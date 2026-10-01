import { sql } from 'kysely';
import { likePattern, type DbSelectQuery } from './model_utils.js';
import { AlternateIdsSql } from './alternate_ids.js';

export const CITATION_PARTS = 8;
export const CITATION_RANGE = Array.from({ length: CITATION_PARTS }, (_, i) => i + 1);

const groupPartPairs = (grp: string) => sql.join(CITATION_RANGE.map((n) => (
  sql`(${ sql.ref(`${ grp }.part${ n }_type`) }, ${ sql.ref(`${ grp }.part${ n }_value`) })`
)));

const groupHasRowParts = (row: string, grp: string) => sql.join(
  CITATION_RANGE.map((n) => {
    const type  = sql.ref(`${ row }.citation_part_${ n }_type`);
    const value = sql.ref(`${ row }.citation_part_${ n }_value`);
    return sql`(${ type } is null or (${ type }, ${ value }) in (${ groupPartPairs(grp) }))`;
  }),
  sql` and `,
);

const citesPrintedPage = (printed: number, cit = 'citations') => sql<boolean>`exists (
  select 1 from citation_groups grp
  where grp.citation_id = ${ sql.ref(`${ cit }.id`) }
    and ('page', ${ printed }::integer) in (${ groupPartPairs('grp') }))`;

const citesPageByParts = (bookId: string, pageNumber: number, cit = 'citations') => sql<boolean>`exists (
  select 1 from book_pages_to_citations bpc
  join citation_groups grp on grp.citation_id = ${ sql.ref(`${ cit }.id`) }
  where bpc.book_id = ${ bookId } and bpc.page_number = ${ pageNumber }
    and ${ groupHasRowParts('bpc', 'grp') })`;


const citesPage = <O>(bookId: string, printedNumber: string|null, pageNumber: number) => (
  (query: DbSelectQuery<'citations', O>) => query.where((eb) => (
    eb.or([
      ...(printedNumber === null ? [] : [citesPrintedPage(printedNumber)]),
      citesPageByParts(bookId, pageNumber),
    ])
  ))
);

const citesBook = <O>(bookId: string) => (query: DbSelectQuery<'citations', O>) => (
  query.where((eb) => eb.and([
    eb('citations.reference_book_id', 'in', AlternateIdsSql.idsCitedAs(bookId)),
  ]))
);


// Citations whose title, author or raw text contains the search, ignoring case; all of them for an
// empty search
const matchingSearch = <O>(search: string) => (query: DbSelectQuery<'citations', O>) => {
  if (search.trim().length > 0) {
    const pattern = likePattern(search.trim());

    return query.where((eb) => eb.or([
      eb('citations.title', 'ilike', pattern),
      eb('citations.author', 'ilike', pattern),
      eb('citations.raw', 'ilike', pattern),
    ]));
  }
  else {
    return query;
  }
};

// Whether a citation points at the book it cites (its reference_book_id is set)
export const CITATION_MATCHES = ['all', 'matched', 'unmatched'] as const;
export type CitationMatch = typeof CITATION_MATCHES[number];

const withMatch = <O>(match: CitationMatch) => (query: DbSelectQuery<'citations', O>) => {
  if (match === 'matched') {
    return query.where('citations.reference_book_id', 'is not', null);
  }
  else if (match === 'unmatched') {
    return query.where('citations.reference_book_id', 'is', null);
  }
  else {
    return query;
  }
};

// By author, then title, then id, so pages don't overlap; citations with no author (an "Ibid.",
// a note the model couldn't attribute) after the rest
const sortedByAuthorAndTitle = <O>() => (query: DbSelectQuery<'citations', O>) => (
  query
    .orderBy(sql`citations.author = ''`)
    .orderBy('citations.author')
    .orderBy('citations.title')
    .orderBy('citations.id')
);

export const CitationScopes = {
  citesBook, citesPage, matchingSearch, withMatch, sortedByAuthorAndTitle,
};
