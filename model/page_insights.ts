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

const CITATION_PARTS = 8;

const range = Array.from({ length: CITATION_PARTS }, (_, i) => i + 1);

// SQL: the citation_groups row `grp`'s parts as (type, value) pairs, for `(type, value) in (...)`
const groupPartPairs = (grp: string) => sql.join(range.map((n) => (
  sql`(${ sql.ref(`${ grp }.part${ n }_type`) }, ${ sql.ref(`${ grp }.part${ n }_value`) })`
)));

// SQL: the citation_groups row `grp`'s parts as a table (n, type, value), to join laterally; a
// part that is null is left out by the caller (where type is not null)
const groupPartRows = (grp: string) => sql`(values ${ sql.join(range.map((n) => (
  sql`(${ n }, ${ sql.ref(`${ grp }.part${ n }_type`) }, ${ sql.ref(`${ grp }.part${ n }_value`) })`
))) })`;

// SQL: the non-null parts of a row as "type:value" keys, in order ('{book:1,question:2,article:3}');
// `column(n, kind)` names part n's type or value column
const partKeys = (column: (n: number, kind: 'type' | 'value') => string) => (
  sql`array_remove(array[${ sql.join(range.map((n) => (
    sql`${ sql.ref(column(n, 'type')) } || ':' || ${ sql.ref(column(n, 'value')) }`
  ))) }], null)`
);

// SQL: every part of the book_pages_to_citations row `row` is one of the parts of the
// citation_groups row `grp`. A part that is null asks for nothing.
const groupHasRowParts = (row: string, grp: string) => sql.join(
  range.map((n) => {
    const type  = sql.ref(`${ row }.citation_part_${ n }_type`);
    const value = sql.ref(`${ row }.citation_part_${ n }_value`);
    return sql`(${ type } is null or (${ type }, ${ value }) in (${ groupPartPairs(grp) }))`;
  }),
  sql` and `,
);

// SQL: the citation `cit` cites the book's page by one of its book_pages_to_citations rows (for books
// cited by part rather than page number, such as the Summa: book 1, question 2, article 1): some
// place it cites (a citation_groups row) has every part of the row
const citesPageByParts = (bookId: string, pageNumber: number, cit = 'citations') => sql<boolean>`exists (
  select 1 from book_pages_to_citations bpc
  join citation_groups grp on grp.citation_id = ${ sql.ref(`${ cit }.id`) }
  where bpc.book_id = ${ bookId } and bpc.page_number = ${ pageNumber }
    and ${ groupHasRowParts('bpc', 'grp') })`;

// SQL: the citation `cit` cites page number `printed` (some place it cites has a "page" part
// equal to it)
const citesPrintedPage = (printed: number, cit = 'citations') => sql<boolean>`exists (
  select 1 from citation_groups grp
  where grp.citation_id = ${ sql.ref(`${ cit }.id`) }
    and ('page', ${ printed }::integer) in (${ groupPartPairs('grp') }))`;

// Citations in other books of a book's page: those with a "page" location equal to its printed page
// number (when that is a number), or that cite it by the parts of one of its book_pages_to_citations
// rows (see citesPageByParts). Callers choose the columns.
export const citationsOfPage = (
  db: Kysely<Database>, bookId: string, page: { pageNumber: number, printedNumber: number | null }
) => (
  db.selectFrom('citations')
    .where('citations.reference_book_id', '=', bookId)
    .where('citations.source_book_id', '<>', bookId)
    .where((eb) => eb.or([
      ...(page.printedNumber === null ? [] : [citesPrintedPage(page.printedNumber)]),
      citesPageByParts(bookId, page.pageNumber),
    ]))
    .orderBy('citations.source_book_id')
    .orderBy('citations.source_footnote_page')
    .orderBy('citations.id')
);

export const citedCountsByPage = async(
  db: Kysely<Database>, bookId: string
): Promise<Map<number, number>> => {
  const rows = await sql<{ page_number: number, n: string }>`
SELECT
	bpc.page_number,
	count(DISTINCT (c.id)) as n
FROM
	book_pages_to_citations bpc
	JOIN citations c ON c.reference_book_id = bpc.book_id
	JOIN citation_groups grp ON grp.citation_id = c.id
WHERE
	bpc.book_id = ${ bookId }
	AND (bpc.citation_part_1_type IS NULL
		OR bpc.citation_part_1_type = grp.part1_type)
	AND (bpc.citation_part_1_value IS NULL
		OR bpc.citation_part_1_value = grp.part1_value)
	AND (bpc.citation_part_2_type IS NULL
		OR bpc.citation_part_2_type = grp.part2_type)
	AND (bpc.citation_part_2_value IS NULL
		OR bpc.citation_part_2_value = grp.part2_value)
	AND (bpc.citation_part_3_type IS NULL
		OR bpc.citation_part_3_type = grp.part3_type)
	AND (bpc.citation_part_3_value IS NULL
		OR bpc.citation_part_3_value = grp.part3_value)
	AND (bpc.citation_part_4_type IS NULL
		OR bpc.citation_part_4_type = grp.part4_type)
	AND (bpc.citation_part_4_value IS NULL
		OR bpc.citation_part_4_value = grp.part4_value)
	AND (bpc.citation_part_5_type IS NULL
		OR bpc.citation_part_5_type = grp.part5_type)
	AND (bpc.citation_part_5_value IS NULL
		OR bpc.citation_part_5_value = grp.part5_value)
	AND (bpc.citation_part_1_type IS NULL
		OR bpc.citation_part_1_type = grp.part1_type)
	AND (bpc.citation_part_6_value IS NULL
		OR bpc.citation_part_6_value = grp.part6_value)
	AND (bpc.citation_part_7_type IS NULL
		OR bpc.citation_part_7_type = grp.part7_type)
	AND (bpc.citation_part_7_value IS NULL
		OR bpc.citation_part_7_value = grp.part7_value)
	AND (bpc.citation_part_8_type IS NULL
		OR bpc.citation_part_8_type = grp.part8_type)
	AND (bpc.citation_part_8_value IS NULL
		OR bpc.citation_part_8_value = grp.part8_value)
GROUP BY
	bpc.page_number
UNION ALL
SELECT
	citation_groups.part1_value as page_number,
	count(DISTINCT (citations.id)) as n
FROM
  citations
LEFT JOIN citation_groups ON citation_groups.citation_id = citations.id
  WHERE
  citations.reference_book_id = ${ bookId } and citation_groups.part1_type = 'page'
GROUP BY citation_groups.part1_value
`.execute(db);

  return new Map(rows.rows.map((r) => [r.page_number, Number(r.n)]));
};

export const findCitingCitations = async(
  db: Kysely<Database>, bookId: string, page: { pageNumber: number, printedNumber: number | null }
): Promise<CitingCitation[]> => {
  const rows = await citationsOfPage(db, bookId, page)
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
      JOIN citation_groups grp ON grp.citation_id = c.id
      CROSS JOIN LATERAL ${ groupPartRows('grp') } part(n, type, value)
      JOIN pages p ON p.book_id = c.reference_book_id
        AND CASE WHEN p.printed_page_number ~ '^[0-9]+$'
                 THEN p.printed_page_number::numeric END = part.value
      WHERE c.id = ANY(${ citationIds }::bigint[])
        AND part.type = 'page'
        AND cache.book_id = p.book_id
        AND cache.page_number = p.page_number`.execute(db);

    return Number(result.numAffectedRows ?? 0);
  }
};
