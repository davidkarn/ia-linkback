// Saving a whole book: its books row, pages and page blocks.
import type { Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import type { Page } from '../types.ts';

// Rows per insert, well under Postgres's 65535 parameters
const CHUNK = 500;

const chunks = <T>(rows: T[]): T[][] => (
  Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) => rows.slice(i * CHUNK, (i + 1) * CHUNK))
);

// Save a book, replacing any earlier copy, in one transaction. The books row is upserted, so other
// books' citations of it keep their reference_book_id; its pages are deleted and inserted again,
// which also deletes their blocks, the citations in them and their cached insights.
export const saveBook = (
  db: Kysely<Database>,
  book: { id: string, title: string, author: string, url: string | null },
  pages: Page[],
) => db.transaction().execute(async(trx) => {
  await trx.insertInto('books')
    .values(book)
    .onConflict((oc) => oc.column('id').doUpdateSet((eb) => ({
      title:  eb.ref('excluded.title'),
      author: eb.ref('excluded.author'),
      url:    eb.ref('excluded.url'),
    })))
    .execute();

  await trx.deleteFrom('pages').where('book_id', '=', book.id).execute();

  for (const chunk of chunks(pages)) {
    await trx.insertInto('pages')
      .values(chunk.map((p) => ({
        book_id:             book.id,
        page_number:         p.pageNumber,
        printed_page_number: p.printedPageNumber,
      })))
      .execute();
  }

  const blocks = pages.flatMap((p) => p.blocks.map((b, position) => ({
    book_id:     book.id,
    page_number: p.pageNumber,
    position,
    bbox_x0:     b.bbox[0],
    bbox_y0:     b.bbox[1],
    bbox_x1:     b.bbox[2],
    bbox_y1:     b.bbox[3],
    label:       b.label,
    html:        b.html,
  })));

  for (const chunk of chunks(blocks)) {
    await trx.insertInto('page_blocks').values(chunk).execute();
  }

  return { pages: pages.length, blocks: blocks.length };
});
