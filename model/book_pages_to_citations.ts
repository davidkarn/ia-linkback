// How a book's pages are cited: book_pages_to_citations rows (see
// migrations/0007_create_book_pages_to_citations.ts).
import type { Insertable, Kysely } from 'kysely';
import type { BookPagesToCitationsTable, Database } from '../api/database.ts';
import type { CitationPart } from '../core/summa_thml.ts';
import { contentsOf, type ContentsEntry } from '../core/contents.ts';

const MAX_PARTS = 8;

// Rows per insert, well under Postgres's 65535 parameters
const CHUNK = 500;

// A book's pages with their labels (printed page numbers), in order
export const findPageLabels = (db: Kysely<Database>, bookId: string) => (
  db.selectFrom('pages')
    .select(['pages.page_number', 'pages.printed_page_number'])
    .where('pages.book_id', '=', bookId)
    .orderBy('pages.page_number')
    .execute()
);

const toRow = (
  bookId: string, pageNumber: number, parts: CitationPart[]
): Insertable<BookPagesToCitationsTable> => {
  if (!parts.length || parts.length > MAX_PARTS) {
    throw new Error(`page ${ pageNumber }: a citation has 1 to ${ MAX_PARTS } parts, not ${ parts.length }`);
  }
  else {
    const row: Record<string, string | number | null> = { book_id: bookId, page_number: pageNumber };
    for (let n = 1; n <= MAX_PARTS; n++) {
      row[`citation_part_${ n }_type`]  = parts[n - 1]?.type ?? null;
      row[`citation_part_${ n }_value`] = parts[n - 1]?.value ?? null;
    }
    return row as unknown as Insertable<BookPagesToCitationsTable>;
  }
};

// Replace a book's page citations with these, in one transaction. Returns how many were saved.
export const replacePageCitations = (
  db: Kysely<Database>, bookId: string, pages: { pageNumber: number, parts: CitationPart[] }[]
) => db.transaction().execute(async(trx) => {
  const rows = pages.map((p) => toRow(bookId, p.pageNumber, p.parts));

  await trx.deleteFrom('book_pages_to_citations').where('book_id', '=', bookId).execute();
  for (let i = 0; i < rows.length; i += CHUNK) {
    await trx.insertInto('book_pages_to_citations').values(rows.slice(i, i + CHUNK)).execute();
  }

  return rows.length;
});

// A book's table of contents from its pages' citation parts, in page order (see core/contents.ts);
// empty when the book has no book_pages_to_citations rows
export const findContents = async(db: Kysely<Database>, bookId: string): Promise<ContentsEntry[]> => {
  const rows = await db.selectFrom('book_pages_to_citations')
    .selectAll()
    .where('book_id', '=', bookId)
    .orderBy('page_number')
    .orderBy('id')
    .execute();

  return contentsOf(rows.map((row) => {
    const parts: CitationPart[] = [];
    for (let n = 1; n <= MAX_PARTS; n++) {
      const r     = row as unknown as Record<string, string | null>;
      const type  = r[`citation_part_${ n }_type`];
      const value = r[`citation_part_${ n }_value`];
      if (type && value !== null && value !== undefined) {
        parts.push({ type, value });
      }
    }
    return { pageId: row.page_number, parts };
  }));
};
