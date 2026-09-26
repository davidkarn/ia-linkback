import { Kysely, sql } from 'kysely';

// Insights passed to the LLM when it extracts citations from footnotes (spider/process_ocred_books.ts):
// one row per insight.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('footnote_extraction_insights')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('insight', 'text', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('footnote_extraction_insights').execute();
}
