// Authors (authors) and the names they go by (alternate_author_names; see
// core/authors.ts and migrations/0020_create_authors.ts)
import { sql, type Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import { namesAnAuthor } from '../core/authors.ts';

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

export const AuthorQueries = { findAuthorId };
export const AuthorActions = { findOrCreateAuthor };
