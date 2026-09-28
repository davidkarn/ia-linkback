// Saving a whole book: its books row, pages and page blocks.
import type { Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import type { Page } from '../types.ts';

// Rows per insert, well under Postgres's 65535 parameters
const CHUNK = 500;

// citation_locations.value is a 32-bit integer
const INT_MIN = -2147483648, INT_MAX = 2147483647;

const chunks = <T>(rows: T[]): T[][] => (
  Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) => rows.slice(i * CHUNK, (i + 1) * CHUNK))
);

// Save a book, replacing any earlier copy, in one transaction. The books row is upserted, so other
// books' citations of it keep their reference_book_id; its pages are deleted and inserted again,
// which also deletes their blocks, the citations in them and their cached insights. The blocks'
// citations are saved with them: a citation_groups row per locationsCited group, and a
// citation_locations row per value.
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
  let groups      = 0, locations = 0;

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

    const groupRows = chunk.flatMap(({ citation: c }, i) => c.locationsCited
      .map((group) => group.flatMap((loc) => loc.values
        .filter((v) => Number.isInteger(v) && v >= INT_MIN && v <= INT_MAX)
        .map((value) => ({ type: loc.type, raw: loc.rawLabel, value }))))
      .filter((values) => values.length)
      .map((values) => ({ citationId: ids[i]!.id, values })));

    for (const groupChunk of chunks(groupRows)) {
      const groupIds = await trx.insertInto('citation_groups')
        .values(groupChunk.map((g) => ({ citation_id: g.citationId })))
        .returning('id')
        .execute();
      const values   = groupChunk.flatMap((g, i) => g.values.map((v) => ({
        ...v, citation_id: g.citationId, citation_group_id: groupIds[i]!.id,
      })));

      for (const valueChunk of chunks(values)) {
        await trx.insertInto('citation_locations').values(valueChunk).execute();
      }
      groups    += groupChunk.length;
      locations += values.length;
    }
  }

  return {
    pages: pages.length, blocks: blocks.length, citations: citations.length, groups, locations,
  };
});
