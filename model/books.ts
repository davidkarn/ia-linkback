// Saving a whole book: its books row, pages and page blocks.
import type { ExpressionBuilder, Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import type { Page } from '../types.ts';
import { placesOf } from '../core/citation_groups.ts';
import { groupRow } from './citation_groups.ts';
import { likePattern, type DbExprBuilder, type DbSelectQuery } from './model_utils.js';

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

export const BookScopes = { sortedForDisplay, scopedToQuery };

const citedByCount = (eb: DbExprBuilder<'books'>, name: string = 'cited_by_count') => (
  eb.selectFrom('citations')
    .select(eb.fn.countAll<string>().as('n'))
    .whereRef('citations.reference_book_id', '=', 'books.id')
    .whereRef('citations.source_book_id', '<>', 'books.id')
    .as(name)
);

const pageCount = (eb: DbExprBuilder<'books'>, name: string = 'page_count') => (
  eb.selectFrom('pages')
    .select(eb.fn.countAll<string>().as('n'))
    .whereRef('pages.book_id', '=', 'books.id')
    .as(name)
);

export const BookSelectors = { citedByCount, pageCount };


// Save a book, replacing any earlier copy, in one transaction. The books row is upserted, so other
// books' citations of it keep their reference_book_id; its pages are deleted and inserted again,
// which also deletes their blocks, the citations in them and their cached insights. The blocks'
// citations are saved with them: a citation_groups row per place each locationsCited group cites
// (a range is a row per place; see core/citation_groups.ts).
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



