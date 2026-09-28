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

// SQL: every part of the book_pages_to_citations row `row` has a citation_locations row with its
// type and value in the citation_groups row `grp`. A part that is null asks for nothing.
const groupHasRowParts = (row: string, grp: string) => sql.join(
  Array.from({ length: CITATION_PARTS }, (_, i) => {
    const type  = sql.ref(`${ row }.citation_part_${ i + 1 }_type`);
    const value = sql.ref(`${ row }.citation_part_${ i + 1 }_value`);
    return sql`(${ type } is null or exists (
      select 1 from citation_locations part
      where part.citation_group_id = ${ sql.ref(`${ grp }.id`) }
        and part.type = ${ type } and part.value = ${ value }))`;
  }),
  sql` and `,
);

// SQL: the citation `cit` cites the book's page by one of its book_pages_to_citations rows (for books
// cited by part rather than page number, such as the Summa: book 1, question 2, article 1): some
// location group of the citation has every part of the row
const citesPageByParts = (bookId: string, pageNumber: number, cit = 'citations') => sql<boolean>`exists (
  select 1 from book_pages_to_citations bpc
  join citation_groups grp on grp.citation_id = ${ sql.ref(`${ cit }.id`) }
  where bpc.book_id = ${ bookId } and bpc.page_number = ${ pageNumber }
    and ${ groupHasRowParts('bpc', 'grp') })`;

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
      ...(page.printedNumber === null ? [] : [eb.exists(
        eb.selectFrom('citation_locations')
          .whereRef('citation_locations.citation_id', '=', 'citations.id')
          .where('citation_locations.type', '=', 'page')
          .where('citation_locations.value', '=', page.printedNumber),
      )]),
      citesPageByParts(bookId, page.pageNumber),
    ]))
    .orderBy('citations.source_book_id')
    .orderBy('citations.source_footnote_page')
    .orderBy('citations.id')
);

// SQL: the non-null parts of the book_pages_to_citations row `row` as "type:value" keys, in order
// ('{book:1,question:2,article:3}')
const rowPartKeys = (row: string) => sql`array_remove(array[${ sql.join(
  Array.from({ length: CITATION_PARTS }, (_, i) => (
    sql`${ sql.ref(`${ row }.citation_part_${ i + 1 }_type`) } || ':' || ${
      sql.ref(`${ row }.citation_part_${ i + 1 }_value`) }`
  )),
) }], null)`;

// How many citations in other books cite each of a book's pages, by the rules of citationsOfPage:
// its printed page number, or the parts of one of its book_pages_to_citations rows. A citation
// counts once per page, and a range (pp. 42-51) on each of its pages.
//
// By parts, a row matches a location group holding every one of its parts. To give Postgres a key
// to join on (comparing every group with every row is slow: 4 million pairs for the Summa), each
// group's locations and each row's parts become arrays of "type:value" keys; a row is joined to
// the groups holding its last (most specific) key, then checked for the rest by containment (@>).
export const citedCountsByPage = async(
  db: Kysely<Database>, bookId: string
): Promise<Map<number, number>> => {
  const rows = await sql<{ page_number: number, n: string }>`
    with group_keys as (
      select c.id as citation_id, array_agg(l.type || ':' || l.value) as keys
      from citations c
      join citation_groups grp on grp.citation_id = c.id
      join citation_locations l on l.citation_group_id = grp.id
      where c.reference_book_id = ${ bookId } and c.source_book_id <> ${ bookId }
      group by grp.id, c.id
    ), group_key as (
      select g.citation_id, g.keys, key
      from group_keys g cross join lateral unnest(g.keys) key
    ), row_keys as (
      select bpc.page_number, k.keys, k.keys[cardinality(k.keys)] as last_key
      from book_pages_to_citations bpc
      cross join lateral (select ${ rowPartKeys('bpc') } as keys) k
      where bpc.book_id = ${ bookId }
    )
    select page_number, count(distinct citation_id) as n from (
      select p.page_number, c.id as citation_id
      from citations c
      join citation_locations l on l.citation_id = c.id and l.type = 'page'
      join pages p on p.book_id = c.reference_book_id
        and case when p.printed_page_number ~ '^[0-9]+$'
                 then p.printed_page_number::numeric end = l.value
      where c.reference_book_id = ${ bookId } and c.source_book_id <> ${ bookId }
      union all
      select r.page_number, g.citation_id
      from row_keys r
      join group_key g on g.key = r.last_key and g.keys @> r.keys
    ) cited
    group by page_number`.execute(db);

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
