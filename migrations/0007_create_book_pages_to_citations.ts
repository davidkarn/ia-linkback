import { Kysely, sql } from 'kysely';

// How a book's pages are cited: each row gives a page and the parts of a citation of it, in order
// (for the Summa: book 2, question 3, article 2). A page can have several rows, one per way of citing
// it. Deleted with its page.
const PARTS = 8;

export async function up(db: Kysely<unknown>): Promise<void> {
  let table = db.schema
    .createTable('book_pages_to_citations')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('book_id', 'text', (col) => col.notNull())
    .addColumn('page_number', 'integer', (col) => col.notNull())
    .addColumn('citation_part_1_type', 'text', (col) => col.notNull())
    .addColumn('citation_part_1_value', 'text', (col) => col.notNull());

  for (let n = 2; n <= PARTS; n++) {
    table = table
      .addColumn(`citation_part_${ n }_type`, 'text')
      .addColumn(`citation_part_${ n }_value`, 'text');
  }

  await table
    .addForeignKeyConstraint(
      'book_pages_to_citations_page_fkey', ['book_id', 'page_number'], 'pages',
      ['book_id', 'page_number'], (cb) => cb.onDelete('cascade'),
    )
    .execute();

  await db.schema.createIndex('book_pages_to_citations_page_idx')
    .on('book_pages_to_citations').columns(['book_id', 'page_number']).execute();
  // finding the page a citation points to: book, then its first parts
  await sql`CREATE INDEX book_pages_to_citations_parts_idx ON book_pages_to_citations
    (book_id, citation_part_1_value, citation_part_2_value, citation_part_3_value)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('book_pages_to_citations').execute();
}
