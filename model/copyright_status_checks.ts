// Checks of how likely each book is to be in the public domain (copyright_status_check; see
// core/copyright_status.ts)
import type { Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import type { BookToCheck, CopyrightCheck } from '../core/copyright_status.ts';

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

// Save a book's check. Returns its id.
const saveCheck = async(db: Kysely<Database>, check: CopyrightCheck): Promise<string> => {
  const row = await db.insertInto('copyright_status_check')
    .values({ book_id: check.bookId, copyright_status: check.status, notes: check.notes })
    .returning('id')
    .executeTakeFirstOrThrow();

  return row.id;
};

export const CopyrightStatusCheckQueries = { findBooksWithoutCheck };
export const CopyrightStatusCheckActions = { saveCheck };
