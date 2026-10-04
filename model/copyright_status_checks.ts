// Checks of how likely each book is to be in the public domain (copyright_status_check; see
// core/copyright_status.ts)
import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { Database } from '../api/database.ts';
import {
  COPYRIGHT_STATUSES, HIDDEN_COPYRIGHT_STATUSES,
  type BookToCheck, type CopyrightCheck, type CopyrightStatus,
} from '../core/copyright_status.ts';
import { likePattern, type DbSelectQuery } from './model_utils.ts';
import { PageCitedCountsCacheActions } from './page_cited_counts_cache.ts';

// SQL: the status of the latest check of the book with id `bookIdColumn` ("books.id"); null when
// it was never checked
const latestStatusOf = (bookIdColumn: string): RawBuilder<CopyrightStatus | null> => (
  // an alias no query using it will have for one of its own tables
  sql<CopyrightStatus | null>`(
    select latest_check.copyright_status from copyright_status_check latest_check
    where latest_check.book_id = ${ sql.ref(bookIdColumn) }
    order by latest_check.created_at desc, latest_check.id desc
    limit 1)`
);

// SQL: whether the book with id `bookIdColumn` is shown in the library's searches: its latest
// check doesn't find it likely under copyright (see shownInSearches in core), or it was never
// checked
const isShownInSearches = (bookIdColumn: string): RawBuilder<boolean> => (
  sql<boolean>`coalesce(${ latestStatusOf(bookIdColumn) }, '') not in (${
    sql.join(HIDDEN_COPYRIGHT_STATUSES.map((s) => sql.lit(s)))
  })`
);

// SQL: the ids of the withheld books, those whose latest check finds them likely under copyright
// (see shownInSearches in core): a set, for a query testing many books against it at once
const withheldBookIds = (): RawBuilder<string> => sql<string>`(
  select latest.book_id from (
    select distinct on (book_id) book_id, copyright_status from copyright_status_check
    order by book_id, created_at desc, id desc) latest
  where latest.copyright_status in (${ sql.join(HIDDEN_COPYRIGHT_STATUSES.map((s) => sql.lit(s))) }))`;

// Books shown in the library's searches (isShownInSearches)
const shownInSearches = <O>() => (query: DbSelectQuery<'books', O>) => (
  query.where(isShownInSearches('books.id'))
);

// How the admin panel's list of books' copyright statuses is sorted: by title; by status, the
// most likely in the public domain first, those never checked last; or by when they were last
// checked, the latest first
export const COPYRIGHT_SORTS = ['title', 'status', 'checked'] as const;
export type CopyrightSort = typeof COPYRIGHT_SORTS[number];

// Which books the list shows: all, those never checked, or those whose latest check gives a
// status
export const COPYRIGHT_FILTERS = ['all', 'unchecked', ...COPYRIGHT_STATUSES] as const;
export type CopyrightFilter = typeof COPYRIGHT_FILTERS[number];

export type BookCopyrightStatus = {
  book_id: string,
  title: string,
  author: string,
  status: CopyrightStatus | null,
  notes: string | null,
  manual: boolean | null,
  checked_at: Date | null,
};

// A page of the books with their latest checks: those whose title or author contains `query`,
// filtered and sorted (then by title); and how many there are in all. bookId: only that book.
const findBookStatuses = async(db: Kysely<Database>, opts: {
  query: string, filter: CopyrightFilter, sort: CopyrightSort, offset: number, length: number,
  bookId?: string,
}): Promise<{ rows: BookCopyrightStatus[], count: number }> => {
  const filtered = () => {
    const withLatest = db.selectFrom('books')
      .leftJoinLateral((eb) => eb.selectFrom('copyright_status_check')
        .select([
          'copyright_status_check.copyright_status', 'copyright_status_check.notes',
          'copyright_status_check.manual', 'copyright_status_check.created_at',
        ])
        .whereRef('copyright_status_check.book_id', '=', 'books.id')
        .orderBy('copyright_status_check.created_at', 'desc')
        .orderBy('copyright_status_check.id', 'desc')
        .limit(1)
        .as('latest'), (join) => join.onTrue());
    const ofBook     = opts.bookId === undefined
      ? withLatest
      : withLatest.where('books.id', '=', opts.bookId);
    const searched   = opts.query.length > 0
      ? ofBook.where((eb) => eb.or([
        eb('books.title', 'ilike', likePattern(opts.query)),
        eb('books.author', 'ilike', likePattern(opts.query)),
      ]))
      : ofBook;

    if (opts.filter === 'all') {
      return searched;
    }
    else if (opts.filter === 'unchecked') {
      return searched.where('latest.copyright_status', 'is', null);
    }
    else {
      return searched.where('latest.copyright_status', '=', opts.filter);
    }
  };

  const statusRank = sql<number>`case latest.copyright_status ${ sql.join(
    COPYRIGHT_STATUSES.map((s, i) => sql`when ${ sql.lit(s) } then ${ sql.lit(i) }`), sql` `
  ) } else ${ sql.lit(COPYRIGHT_STATUSES.length) } end`;

  const selected = filtered().select([
    'books.id as book_id', 'books.title', 'books.author', 'latest.copyright_status as status',
    'latest.notes', 'latest.manual', 'latest.created_at as checked_at',
  ]);
  const sortedBy = () => {
    if (opts.sort === 'status') {
      return selected.orderBy(statusRank);
    }
    else if (opts.sort === 'checked') {
      return selected.orderBy(sql`latest.created_at desc nulls last`);
    }
    else {
      return selected;
    }
  };
  const sorted   = sortedBy();

  const rows  = await sorted.orderBy('books.title').orderBy('books.id')
    .offset(opts.offset)
    .limit(opts.length)
    .execute();
  const total = await filtered()
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .executeTakeFirstOrThrow();

  return { rows, count: Number(total.count) };
};

// The books never checked, by title; at most `limit` of them when it's given
const findBooksWithoutCheck = (
  db: Kysely<Database>, limit?: number
): Promise<BookToCheck[]> => {
  const query = db.selectFrom('books')
    .select(['books.id', 'books.title', 'books.author', 'books.url'])
    .where(({ not, exists, selectFrom }) => not(exists(
      selectFrom('copyright_status_check')
        .select('copyright_status_check.id')
        .whereRef('copyright_status_check.book_id', '=', 'books.id')
    )))
    .orderBy('books.title')
    .orderBy('books.id');

  return limit === undefined ? query.execute() : query.limit(limit).execute();
};

// Save a book's check; manual: set by hand (the admin panel). Returns its id.
const saveCheck = async(
  db: Kysely<Database>, check: CopyrightCheck, manual: boolean = false
): Promise<string> => {
  const row = await db.insertInto('copyright_status_check')
    .values({
      book_id: check.bookId, copyright_status: check.status, notes: check.notes, manual,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  // a withheld book's citations aren't counted toward the pages they cite
  await PageCitedCountsCacheActions.clearCachedCounts(db);

  return row.id;
};

// The status of a book's latest check; null when it was never checked (or there's no such book)
const findLatestStatus = async(
  db: Kysely<Database>, bookId: string
): Promise<CopyrightStatus | null> => {
  const row = await db.selectFrom('copyright_status_check')
    .select('copyright_status_check.copyright_status')
    .where('copyright_status_check.book_id', '=', bookId)
    .orderBy('copyright_status_check.created_at', 'desc')
    .orderBy('copyright_status_check.id', 'desc')
    .limit(1)
    .executeTakeFirst();

  return row?.copyright_status ?? null;
};

export const CopyrightStatusCheckSql = { latestStatusOf, isShownInSearches, withheldBookIds };
export const CopyrightStatusCheckScopes = { shownInSearches };
export const CopyrightStatusCheckQueries = {
  findBooksWithoutCheck, findBookStatuses, findLatestStatus,
};
export const CopyrightStatusCheckActions = { saveCheck };
