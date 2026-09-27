import { Kysely, sql } from 'kysely';

// The last page insights made for each book page (GET /books/{bookId}/pages/{pageId}/insights),
// so the OpenRouter request isn't repeated. Deleted when a citation is newly linked to the page
// (linkReferences in spider/find_and_queue_cited_books.ts), and with its book.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('page_insights_cache')
    .addColumn('book_id', 'text', (col) => col.notNull())
    .addColumn('page_number', 'integer', (col) => col.notNull())
    // json, not jsonb, keeps the response exactly as it was made (jsonb reorders keys)
    .addColumn('insights', 'json', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('page_insights_cache_pkey', ['book_id', 'page_number'])
    .addForeignKeyConstraint(
      'page_insights_cache_page_fkey', ['book_id', 'page_number'], 'pages', ['book_id', 'page_number'],
      (cb) => cb.onDelete('cascade'),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('page_insights_cache').execute();
}
