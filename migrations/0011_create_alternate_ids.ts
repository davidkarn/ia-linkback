import { Kysely, sql } from 'kysely';

// Other ids a book goes by: citations that point at alternate_id (another copy or edition of the
// book) count as citations of book_id (see model/alternate_ids.ts)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('alternate_ids')
    .addColumn('book_id', 'text', (col) => col.notNull().references('books.id').onDelete('cascade'))
    .addColumn('alternate_id', 'text', (col) => col.notNull().references('books.id').onDelete('cascade'))
    .addPrimaryKeyConstraint('alternate_ids_pkey', ['book_id', 'alternate_id'])
    .addCheckConstraint('alternate_ids_not_itself', sql`book_id <> alternate_id`)
    .execute();

  // finding the books an alternate id stands for (clearing the insights of pages newly cited)
  await db.schema.createIndex('alternate_ids_alternate_id_idx')
    .on('alternate_ids').column('alternate_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('alternate_ids').execute();
}
