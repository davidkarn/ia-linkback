// A book's alternate ids (the alternate_ids table): citations that point at one of them count as
// citations of the book. These say which citations cite a book, for the queries that look them up.
import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { Database } from '../api/database.js';
import type { DbSelectQuery } from './model_utils.js';

// SQL: the ids that citations of `bookId` point at: its own and its alternates'
const idsCitedAs = (bookId: string): RawBuilder<string> => sql<string>`(
  select ${ bookId }::text
  union select alternate_ids.alternate_id from alternate_ids where alternate_ids.book_id = ${ bookId })`;

// SQL: the ids that citations of the book with id `bookIdColumn` point at, for a correlated
// subquery ("books.id")
const idsCitedAsColumn = (bookIdColumn: string): RawBuilder<string> => sql<string>`(
  select ${ sql.ref(bookIdColumn) }
  union select alternate_ids.alternate_id from alternate_ids
  where alternate_ids.book_id = ${ sql.ref(bookIdColumn) })`;

const citesBook = <O>(bookId: string) => (query: DbSelectQuery<'citations', O>) => (
  query.where((eb) => eb.and([
    eb('citations.reference_book_id', 'in', idsCitedAs(bookId)),
  ]))
);

// A book's alternate ids ([] when it has none)
const findAlternateIds = async(db: Kysely<Database>, bookId: string): Promise<string[]> => (
  (await db.selectFrom('alternate_ids')
    .select('alternate_ids.alternate_id')
    .where('alternate_ids.book_id', '=', bookId)
    .execute()).map((r) => r.alternate_id)
);

export const AlternateIdsScopes = { citesBook };
export const AlternateIdsQueries = { findAlternateIds };
export const AlternateIdsSql = { idsCitedAs, idsCitedAsColumn };
