import { Kysely, sql } from 'kysely';

// A citation's reference_book_id need not be a book in the collection: it can be an alternate id
// ("bible", standing for douay-rheims; see 0012_alternate_ids_without_book.ts), so it no longer
// references books
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table citations drop constraint citations_reference_book_id_fkey`.execute(db);
}

// Citations referencing an id that is not a book can't satisfy the foreign key again, and lose
// their reference_book_id (as they would have when the book was deleted)
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`update citations set reference_book_id = null
    where reference_book_id not in (select id from books)`.execute(db);
  await sql`alter table citations
    add constraint citations_reference_book_id_fkey foreign key (reference_book_id)
    references books(id) on delete set null`.execute(db);
}
