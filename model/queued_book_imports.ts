// The queue of books to import (queued_book_imports): found on archive.org by
// find-and-queue-cited-books, OCR'd by ocr-queued-books, imported by process-ocred-books. A book
// moves through the statuses queued -> inProgress (OCR'd) -> processingContents -> imported ->
// importedAndCrawled (its citations linked and the books it cites queued).
import { sql, type Kysely, type Selectable } from 'kysely';
import type { Database, QueuedBookImportsTable } from '../api/database.ts';
import { QUEUE_STATUSES, type QueueStatus } from '../core/queued_books.ts';
import { likePattern, type DbSelectQuery } from './model_utils.ts';

export type QueuedBook = Selectable<QueuedBookImportsTable>;
export type { QueueStatus };

// The first book queued with this status, if any
const findNextQueuedBook = (db: Kysely<Database>, status: QueueStatus) => (
  db.selectFrom('queued_book_imports')
    .selectAll()
    .where('status', '=', status)
    .orderBy('id')
    .limit(1)
    .executeTakeFirst()
);

// The first `limit` books queued with this status, in the order they'll be taken
const findNextQueuedBooks = (db: Kysely<Database>, status: QueueStatus, limit: number) => (
  db.selectFrom('queued_book_imports')
    .selectAll()
    .where('status', '=', status)
    .orderBy('id')
    .limit(limit)
    .execute()
);

// How many books are queued with each status (statuses no book has are left out)
const countByStatus = async(
  db: Kysely<Database>
): Promise<{ status: QueueStatus, count: number }[]> => {
  const rows = await db.selectFrom('queued_book_imports')
    .select((eb) => ['status', eb.fn.countAll<string>().as('count')])
    .groupBy('status')
    .execute();

  return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
};

const setQueuedBookStatus = (db: Kysely<Database>, id: string, status: QueueStatus) => (
  db.updateTable('queued_book_imports')
    .set({ status })
    .where('id', '=', id)
    .execute()
);

// A queued book imported as the book bookId
const markQueuedBookImported = (db: Kysely<Database>, id: string, bookId: string) => (
  db.updateTable('queued_book_imports')
    .set({ imported_book_id: bookId, status: 'imported' })
    .where('id', '=', id)
    .execute()
);

// The titles and authors of the books queued but not imported yet
const findQueuedBookNames = (db: Kysely<Database>) => (
  db.selectFrom('queued_book_imports')
    .select(['title', 'author'])
    .where('status', 'not in', ['imported', 'importedAndCrawled', 'complete'])
    .execute()
);

// Every archive.org item and PDF url queued, whatever its status
const findQueuedUrls = async(db: Kysely<Database>): Promise<Set<string>> => {
  const rows = await db.selectFrom('queued_book_imports')
    .select(['archive_url', 'pdf_url'])
    .execute();

  return new Set(
    rows.flatMap((r) => [r.archive_url, r.pdf_url]).filter((u): u is string => u !== null)
  );
};

// Queue a book found on archive.org for OCR. Returns its id.
const queueBook = async(
  db: Kysely<Database>,
  book: { title: string, author: string, archiveUrl: string, pdfUrl: string },
): Promise<string> => {
  const row = await db.insertInto('queued_book_imports')
    .values({
      title:       book.title,
      author:      book.author,
      archive_url: book.archiveUrl,
      pdf_url:     book.pdfUrl,
      status:      'queued',
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return row.id;
};

// Queued books whose title or author contains the search, ignoring case; all of them for an empty
// search
const matchingSearch = <O>(search: string) => (query: DbSelectQuery<'queued_book_imports', O>) => {
  if (search.trim().length > 0) {
    const pattern = likePattern(search.trim());

    return query.where((eb) => eb.or([
      eb('queued_book_imports.title', 'ilike', pattern),
      eb('queued_book_imports.author', 'ilike', pattern),
    ]));
  }
  else {
    return query;
  }
};

// Queued books with this status; all of them without one
const withStatus = <O>(status: QueueStatus | undefined) => (
  (query: DbSelectQuery<'queued_book_imports', O>) => (
    status === undefined ? query : query.where('queued_book_imports.status', '=', status)
  )
);

// How a list of queued books is sorted: by status, in the order a book goes through them
// (QUEUE_STATUSES), or by when they were created or last updated, the latest first; then in queue
// order
export const QUEUED_BOOK_SORTS = ['status', 'created', 'updated'] as const;
export type QueuedBookSort = typeof QUEUED_BOOK_SORTS[number];

const sortedBy = <O>(sort: QueuedBookSort) => (query: DbSelectQuery<'queued_book_imports', O>) => {
  if (sort === 'created') {
    return query
      .orderBy('queued_book_imports.created_at', 'desc')
      .orderBy('queued_book_imports.id');
  }
  else if (sort === 'updated') {
    return query
      .orderBy('queued_book_imports.updated_at', 'desc')
      .orderBy('queued_book_imports.id');
  }
  else {
    return query
      .orderBy(sql`array_position(
        ${ sql.val(QUEUE_STATUSES) }::text[], queued_book_imports.status
      )`)
      .orderBy('queued_book_imports.id');
  }
};

export const QueuedBookImportsScopes = { matchingSearch, withStatus, sortedBy };

export const QueuedBookImportsQueries = {
  findNextQueuedBook, findNextQueuedBooks, countByStatus, findQueuedBookNames, findQueuedUrls,
};
export const QueuedBookImportsActions = { queueBook, setQueuedBookStatus, markQueuedBookImported };
