import { Kysely } from 'kysely';

// Path of the book's cover image, relative to web/public (so the frontend serves it at /<path>).
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('books').addColumn('cover_photo_path', 'text').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('books').dropColumn('cover_photo_path').execute();
}
