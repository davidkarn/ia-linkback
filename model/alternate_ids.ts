// A book's alternate ids (the alternate_ids table): citations that point at one of them count as
// citations of the book. These say which citations cite a book, for the queries that look them up.
import { sql, type ExpressionBuilder, type RawBuilder } from 'kysely';
import type { Database } from '../api/database.ts';

// SQL: the ids that citations of `bookId` point at: its own and its alternates'
export const idsCitedAs = (bookId: string): RawBuilder<string> => sql<string>`(
  select ${ bookId }::text
  union select alternate_ids.alternate_id from alternate_ids where alternate_ids.book_id = ${ bookId })`;

// SQL: the ids that citations of the book with id `bookIdColumn` point at, for a correlated
// subquery ("books.id")
export const idsCitedAsColumn = (bookIdColumn: string): RawBuilder<string> => sql<string>`(
  select ${ sql.ref(bookIdColumn) }
  union select alternate_ids.alternate_id from alternate_ids
  where alternate_ids.book_id = ${ sql.ref(bookIdColumn) })`;

// A where clause for `citations`: citations in other books of `bookId` (pointing at it or one of its
// alternates, from a book that is neither)
export const citesBook = (bookId: string) => (eb: ExpressionBuilder<Database, 'citations'>) => eb.and([
  eb('citations.reference_book_id', 'in', idsCitedAs(bookId)),
  eb('citations.source_book_id', 'not in', idsCitedAs(bookId)),
]);
