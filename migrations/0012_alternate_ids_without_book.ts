import { Kysely, sql } from 'kysely';

// An alternate id need not be a book in the collection: it is only an id citations point at
// ("bible" for the Douay-Rheims), so it no longer references books. book_id still does.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table alternate_ids drop constraint alternate_ids_alternate_id_fkey`.execute(db);
}

// Rows whose alternate id is not a book can't satisfy the foreign key again, and are deleted
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`delete from alternate_ids
    where alternate_id not in (select id from books)`.execute(db);
  await sql`alter table alternate_ids
    add constraint alternate_ids_alternate_id_fkey foreign key (alternate_id)
    references books(id) on delete cascade`.execute(db);
}
