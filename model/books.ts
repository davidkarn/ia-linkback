// Saving a whole book: its books row, pages and page blocks.
import type { Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import type { Page } from '../types.ts';
import { placesOf } from '../core/citation_groups.ts';
import { groupRow } from './citation_groups.ts';
import { AlternateIdsSql } from './alternate_ids.ts';
import { AuthorActions } from './authors.ts';
import { likePattern, type DbExprBuilder, type DbSelectQuery } from './model_utils.ts';

const CHUNK = 500;

const chunks = <T>(rows: T[]): T[][] => (
  Array.from({
    length: Math.ceil(rows.length / CHUNK) },
             (_, i) => rows.slice(i * CHUNK, (i + 1) * CHUNK)
  )
);

const sortedForDisplay = <O>() => (query: DbSelectQuery<'books', O>) => (
  query.orderBy('books.title').orderBy('books.id')
);

const scopedToQuery = <O>(searchQuery: string) => (query: DbSelectQuery<'books', O>) => {
  if (searchQuery) {
    const pattern = likePattern(searchQuery);

    return query.where((eb) => eb.or([
      eb('books.title', 'ilike', pattern),
      eb('books.author', 'ilike', pattern)
    ]));
  }
  else {
    return query;
  }
};


// Citations in other books of the book, pointing at it or one of its alternate ids
const citedByCount = (eb: DbExprBuilder<'books'>, name: string = 'cited_by_count') => (
  eb.selectFrom('citations')
    .select(eb.fn.countAll<string>().as('n'))
    .where('citations.reference_book_id', 'in',
           AlternateIdsSql.idsCitedAsColumn('books.id'))
    .as(name)
);

// The citations in a book's own footnotes; with unmatched, only those not pointing at the book
// they cite (no reference_book_id). Expressions, to select (citationsFromCount) or sort by.
const citationsFrom = (eb: DbExprBuilder<'books'>, unmatched = false) => {
  const all = eb.selectFrom('citations')
    .select(eb.fn.countAll<string>().as('n'))
    .whereRef('citations.source_book_id', '=', 'books.id');

  return unmatched ? all.where('citations.reference_book_id', 'is', null) : all;
};

const citationsFromCount = (eb: DbExprBuilder<'books'>, name: string = 'citations_from_count') => (
  citationsFrom(eb).as(name)
);

const unmatchedFromCount = (eb: DbExprBuilder<'books'>, name: string = 'unmatched_from_count') => (
  citationsFrom(eb, true).as(name)
);

// How a list of books is sorted: by title, or by its citations, the most first
export const BOOK_SORTS = ['title', 'citationsFrom', 'unmatchedFrom'] as const;
export type BookSort = typeof BOOK_SORTS[number];

const sortedBy = <O>(sort: BookSort) => (query: DbSelectQuery<'books', O>) => {
  if (sort === 'citationsFrom') {
    return query.orderBy((eb) => citationsFrom(eb), 'desc').orderBy('books.title').orderBy('books.id');
  }
  else if (sort === 'unmatchedFrom') {
    return query.orderBy((eb) => citationsFrom(eb, true), 'desc').orderBy('books.title').orderBy('books.id');
  }
  else {
    return query.orderBy('books.title').orderBy('books.id');
  }
};

const pageCount = (eb: DbExprBuilder<'books'>, name: string = 'page_count') => (
  eb.selectFrom('pages')
    .select(eb.fn.countAll<string>().as('n'))
    .whereRef('pages.book_id', '=', 'books.id')
    .as(name)
);




// Save a book, replacing any earlier copy, in one transaction. The books row is upserted, so other
// books' citations of it keep their reference_book_id; its pages are deleted and inserted again,
// which also deletes their blocks, the citations in them and their cached insights. The blocks'
// citations are saved with them: a citation_groups row per place each locationsCited group cites
// (a range is a row per place; see core/citation_groups.ts).
// translator: who translated it; left as it was when not given (importers that don't know one).
// Its author_id is the author its author names, added when no author goes by that name yet (see
// model/authors.ts).
const saveBook = (
  db: Kysely<Database>,
  book: { id: string, title: string, author: string, url: string | null, translator?: string | null },
  pages: Page[],
) => db.transaction().execute(async(trx) => {
  const authorId = await AuthorActions.findOrCreateAuthor(trx, book.author);

  await trx.insertInto('books')
    .values({ ...book, author_id: authorId })
    .onConflict((oc) => oc.column('id').doUpdateSet((eb) => ({
      title:     eb.ref('excluded.title'),
      author:    eb.ref('excluded.author'),
      author_id: eb.ref('excluded.author_id'),
      url:       eb.ref('excluded.url'),
      ...(book.translator === undefined ? {} : { translator: eb.ref('excluded.translator') }),
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

  // the blocks' ids, to attach their citations to
  const blockIds = new Map((await trx.selectFrom('page_blocks')
    .select(['id', 'page_number', 'position'])
    .where('book_id', '=', book.id)
    .execute()).map((b) => [b.page_number + ':' + b.position, b.id]));

  const citations = pages.flatMap((p) => p.blocks.flatMap((b, position) => b.citations.map((c) => ({
    blockId:  blockIds.get(p.pageNumber + ':' + position)!,
    citation: c,
  }))));
  let groups      = 0;

  for (const chunk of chunks(citations)) {
    // RETURNING gives the ids in the order the rows were given
    const ids = await trx.insertInto('citations')
      .values(chunk.map(({ blockId, citation: c }) => ({
        page_block_id:              blockId,
        source_book_id:             c.source.bookId,
        source_footnote_identifier: c.source.footnoteIdentifier,
        source_footnote_page:       c.source.footnotePage,
        reference_book_id:          c.referenceBookId,
        author:                     c.author,
        title:                      c.title,
        location:                   c.location,
        raw:                        c.raw,
      })))
      .returning('id')
      .execute();

    // a row per place each location group cites (see core/citation_groups.ts)
    const groupRows = chunk.flatMap(({ citation: c }, i) => c.locationsCited
      .flatMap((group) => placesOf(group).places)
      .map((place) => groupRow(ids[i]!.id, place)));

    for (const groupChunk of chunks(groupRows)) {
      await trx.insertInto('citation_groups').values(groupChunk).execute();
      groups += groupChunk.length;
    }
  }

  return { pages: pages.length, blocks: blocks.length, citations: citations.length, groups };
});

// The ids, titles and authors of the books but one: those it may cite
const findOtherBookNames = (db: Kysely<Database>, bookId: string) => (
  db.selectFrom('books')
    .select(['id', 'title', 'author'])
    .where('id', '<>', bookId)
    .execute()
);

const findBookIds = async(db: Kysely<Database>): Promise<Set<string>> => (
  new Set((await db.selectFrom('books').select('id').execute()).map((b) => b.id))
);

// coverPhotoPath: relative to the frontend's root ("covers/<file>")
const setCoverPhotoPath = (db: Kysely<Database>, bookId: string, coverPhotoPath: string) => (
  db.updateTable('books')
    .set({ cover_photo_path: coverPhotoPath })
    .where('id', '=', bookId)
    .execute()
);

export const BookScopes = { sortedForDisplay, scopedToQuery, sortedBy };
export const BookActions = { saveBook, setCoverPhotoPath };
export const BookSelectors = { citedByCount, citationsFromCount, unmatchedFromCount, pageCount };
export const BookQueries = { findOtherBookNames, findBookIds };
