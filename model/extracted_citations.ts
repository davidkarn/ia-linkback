// Saving the citations extracted from an imported book's footnotes (see core/footnote_extraction.ts),
// with the insights learned extracting them
import type { Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import type { Citation } from '../types.ts';
import { placesOf } from '../core/citation_groups.ts';
import { newInsights } from '../core/footnote_extraction.ts';
import { groupRow } from './citation_groups.ts';

// A book's Footnote blocks, in reading order
export const findFootnoteBlocks = (db: Kysely<Database>, bookId: string) => (
  db.selectFrom('page_blocks')
    .select(['id', 'page_number', 'html'])
    .where('book_id', '=', bookId)
    .where('label', '=', 'Footnote')
    .orderBy('page_number')
    .orderBy('position')
    .execute()
);

// Replace a book's citations with these, each in its Footnote block, with a citation_groups row per
// place each of its location groups cites (see core/citation_groups.ts); and save the insights
// learned that aren't saved already. In one transaction. Returns the counts saved, and how many
// location values were left out of the places.
export const replaceExtractedCitations = (
  db: Kysely<Database>,
  bookId: string,
  placed: { blockId: string, citation: Citation }[],
  insights: string[],
) => db.transaction().execute(async(trx) => {
  const counts = { citations: 0, groups: 0, skippedValues: 0, newInsights: 0 };

  await trx.deleteFrom('citations').where('source_book_id', '=', bookId).execute();

  for (const { blockId, citation: c } of placed) {
    const { id: citationId } = await trx.insertInto('citations')
      .values({
        page_block_id:              blockId,
        source_book_id:             bookId,
        source_footnote_identifier: c.source.footnoteIdentifier,
        source_footnote_page:       c.source.footnotePage,
        reference_book_id:          c.referenceBookId,
        author:                     c.author,
        title:                      c.title,
        location:                   c.location,
        raw:                        c.raw,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    counts.citations++;

    for (const group of c.locationsCited) {
      const { places, skipped } = placesOf(group);
      counts.skippedValues     += skipped;

      if (places.length > 0) {
        await trx.insertInto('citation_groups')
          .values(places.map((place) => groupRow(citationId, place)))
          .execute();
        counts.groups += places.length;
      }
    }
  }

  const saved = await trx.selectFrom('footnote_extraction_insights').select('insight').execute();
  const added = newInsights(insights, saved.map((r) => r.insight));

  if (added.length > 0) {
    await trx.insertInto('footnote_extraction_insights')
      .values(added.map((insight) => ({ insight })))
      .execute();
  }
  counts.newInsights = added.length;

  return counts;
});
