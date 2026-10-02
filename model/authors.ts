// Authors (authors) and the names they go by (alternate_author_names; see
// core/authors.ts and migrations/0020_create_authors.ts)
import { sql, type Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import { namesAnAuthor } from '../core/authors.ts';
import { likePattern, type DbExprBuilder, type DbSelectQuery } from './model_utils.ts';

// Authors going by a name containing `searchQuery` (any of theirs: "aquinas" finds Thomas
// Aquinas), ignoring case; every author when it's empty
const matchingName = <O>(searchQuery: string | undefined) => (
  query: DbSelectQuery<'authors', O>
) => {
  if (searchQuery === undefined || searchQuery.trim().length === 0) {
    return query;
  }
  else {
    return query.where(({ exists, selectFrom }) => exists(
      selectFrom('alternate_author_names')
        .select('alternate_author_names.id')
        .whereRef('alternate_author_names.author_id', '=', 'authors.id')
        .where('alternate_author_names.name', 'ilike', likePattern(searchQuery.trim()))
    ));
  }
};

// Authors with a book in the collection
const withBooks = <O>() => (query: DbSelectQuery<'authors', O>) => (
  query.where(({ exists, selectFrom }) => exists(
    selectFrom('books').select('books.id').whereRef('books.author_id', '=', 'authors.id')
  ))
);

const sortedByName = <O>() => (query: DbSelectQuery<'authors', O>) => (
  query.orderBy('authors.name').orderBy('authors.id')
);

// The author's books
const bookCount = (eb: DbExprBuilder<'authors'>) => (
  eb.selectFrom('books')
    .select(eb.fn.countAll<string>().as('n'))
    .whereRef('books.author_id', '=', 'authors.id')
    .as('book_count')
);

// Citations in other books of any of the author's books, pointing at it or one of its
// alternate ids
const citedByCount = (eb: DbExprBuilder<'authors'>) => (
  eb.selectFrom('citations')
    .select(eb.fn.countAll<string>().as('n'))
    .where('citations.reference_book_id', 'in', sql<string>`(
      select books.id from books where books.author_id = authors.id
      union select alternate_ids.alternate_id from alternate_ids
        join books on books.id = alternate_ids.book_id
      where books.author_id = authors.id)`)
    .as('cited_by_count')
);

// The id of the author going by `name` (ignoring case); null when none does
const findAuthorId = async(db: Kysely<Database>, name: string): Promise<string | null> => {
  const row = await db.selectFrom('alternate_author_names')
    .select('alternate_author_names.author_id')
    .where(sql`lower(alternate_author_names.name)`, '=', name.trim().toLowerCase())
    .executeTakeFirst();

  return row?.author_id ?? null;
};

// A new author named `name`, that name its first; its id
const createAuthor = async(db: Kysely<Database>, name: string): Promise<string> => {
  const author = await db.insertInto('authors')
    .values({ name })
    .returning('id')
    .executeTakeFirstOrThrow();

  await db.insertInto('alternate_author_names')
    .values({ author_id: author.id, name })
    .execute();

  return author.id;
};

// The id of the author a book's author (books.author) names: the one going by
// that name, else a new one named it. null when it names none ("Anonymous").
const findOrCreateAuthor = async(db: Kysely<Database>, name: string): Promise<string | null> => {
  if (!namesAnAuthor(name)) {
    return null;
  }
  else {
    return await findAuthorId(db, name) ?? await createAuthor(db, name.trim());
  }
};

export const AuthorScopes = { matchingName, withBooks, sortedByName };
export const AuthorSelectors = { bookCount, citedByCount };
export const AuthorQueries = { findAuthorId };
export const AuthorActions = { findOrCreateAuthor };
