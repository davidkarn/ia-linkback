// Database reads for pages and the citations of them: a page, the citations in other books
// that cite it, those books' titles and authors, and the text of the pages around each citing
// page.
import type { Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import type { CitingCitation, ContextPage } from '../core/page_insights.ts';

export const findPage = (db: Kysely<Database>, bookId: string, pageNumber: number) => (
  db.selectFrom('pages')
    .select(['pages.page_number', 'pages.printed_page_number'])
    .where('pages.book_id', '=', bookId)
    .where('pages.page_number', '=', pageNumber)
    .executeTakeFirst()
);

// Citations in other books of a book's page, by its printed page number: a "page" location equal to
// it. Callers choose the columns.
export const citationsOfPage = (db: Kysely<Database>, bookId: string, printedNumber: number) => (
  db.selectFrom('citations')
    .where('citations.reference_book_id', '=', bookId)
    .where('citations.source_book_id', '<>', bookId)
    .where((eb) => eb.exists(
      eb.selectFrom('citation_locations')
        .whereRef('citation_locations.citation_id', '=', 'citations.id')
        .where('citation_locations.type', '=', 'page')
        .where('citation_locations.value', '=', printedNumber),
    ))
    .orderBy('citations.source_book_id')
    .orderBy('citations.source_footnote_page')
    .orderBy('citations.id')
);

export const findCitingCitations = async(
  db: Kysely<Database>, bookId: string, printedNumber: number
): Promise<CitingCitation[]> => {
  const rows = await citationsOfPage(db, bookId, printedNumber)
    .select([
      'citations.source_book_id',
      'citations.source_footnote_page',
      'citations.source_footnote_identifier',
    ])
    .execute();

  return rows.map((r) => ({
    sourceBookId:       r.source_book_id,
    sourcePage:         r.source_footnote_page,
    footnoteIdentifier: r.source_footnote_identifier,
  }));
};

export const findBooks = async(db: Kysely<Database>, bookIds: string[]) => {
  if (!bookIds.length) {
    return new Map<string, { id: string, title: string, author: string }>();
  }
  else {
    const rows = await db.selectFrom('books')
      .select(['books.id', 'books.title', 'books.author'])
      .where('books.id', 'in', bookIds)
      .execute();

    return new Map(rows.map((r) => [r.id, r]));
  }
};

const pageKey = (bookId: string, pageNumber: number) => bookId + '\u0000' + pageNumber;

// The pages asked for that exist, with their blocks in reading order, keyed by pageKey
export const findContextPages = async(
  db: Kysely<Database>, wanted: { bookId: string, pageNumbers: number[] }[]
): Promise<{ get: (bookId: string, pageNumber: number) => ContextPage | undefined }> => {
  const pairs = wanted.flatMap((w) => w.pageNumbers.map((n) => ({ bookId: w.bookId, n })));
  const pages = new Map<string, ContextPage>();

  if (pairs.length) {
    const rows = await db.selectFrom('pages')
      .leftJoin('page_blocks', (join) => join
        .onRef('page_blocks.book_id', '=', 'pages.book_id')
        .onRef('page_blocks.page_number', '=', 'pages.page_number'))
      .select([
        'pages.book_id', 'pages.page_number', 'pages.printed_page_number',
        'page_blocks.label', 'page_blocks.html',
      ])
      .where((eb) => eb.or(pairs.map((p) => eb.and([
        eb('pages.book_id', '=', p.bookId),
        eb('pages.page_number', '=', p.n),
      ]))))
      .orderBy('pages.book_id')
      .orderBy('pages.page_number')
      .orderBy('page_blocks.position')
      .execute();

    for (const r of rows) {
      const key  = pageKey(r.book_id, r.page_number);
      const page = pages.get(key) ?? {
        pageNumber:        r.page_number,
        printedPageNumber: r.printed_page_number,
        blocks:            [],
      };

      if (r.label !== null && r.html !== null) {
        page.blocks.push({ label: r.label, html: r.html });
      }
      pages.set(key, page);
    }
  }

  return { get: (bookId, pageNumber) => pages.get(pageKey(bookId, pageNumber)) };
};
