// Database reads for pages and the citations of them: a page, the citations in other books
// that cite it, those books' titles and authors, and the text of the pages around each citing
// page.
import { sql, type Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import type { CitingCitation, ContextPage, PageInsights } from '../core/page_insights.ts';

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

// The cached insights for a page, if any
export const findCachedInsights = async(
  db: Kysely<Database>, bookId: string, pageNumber: number
): Promise<PageInsights | undefined> => {
  const row = await db.selectFrom('page_insights_cache')
    .select('page_insights_cache.insights')
    .where('page_insights_cache.book_id', '=', bookId)
    .where('page_insights_cache.page_number', '=', pageNumber)
    .executeTakeFirst();

  return row?.insights;
};

export const saveCachedInsights = (db: Kysely<Database>, insights: PageInsights) => (
  db.insertInto('page_insights_cache')
    .values({
      book_id:     insights.bookId,
      page_number: insights.pageId,
      insights:    JSON.stringify(insights),
    })
    .onConflict((oc) => oc.columns(['book_id', 'page_number']).doUpdateSet((eb) => ({
      insights:   eb.ref('excluded.insights'),
      created_at: sql<Date>`now()`,
    })))
    .execute()
);

// Delete the cached insights of every page these citations point to: in the book each references,
// the pages whose printed number is one of the citation's page locations (the rule
// citationsOfPage uses). Returns how many were deleted.
export const invalidateInsightsCitedBy = async(
  db: Kysely<Database>, citationIds: string[]
): Promise<number> => {
  if (!citationIds.length) {
    return 0;
  }
  else {
    const result = await sql`
      DELETE FROM page_insights_cache cache
      USING citations c
      JOIN citation_locations l ON l.citation_id = c.id AND l.type = 'page'
      JOIN pages p ON p.book_id = c.reference_book_id
        AND CASE WHEN p.printed_page_number ~ '^[0-9]+$'
                 THEN p.printed_page_number::numeric END = l.value
      WHERE c.id = ANY(${ citationIds }::bigint[])
        AND cache.book_id = p.book_id
        AND cache.page_number = p.page_number`.execute(db);

    return Number(result.numAffectedRows ?? 0);
  }
};
