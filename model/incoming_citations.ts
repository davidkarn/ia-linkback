// Citations in other books of a book: reading them, and pointing them at the book with new locations.
import type { Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import type { CitationPart } from '../core/summa_thml.ts';
import { invalidateInsightsCitedBy } from './page_insights.ts';

// Rows per insert, well under Postgres's 65535 parameters
const CHUNK = 500;

const chunks = <T>(rows: T[]): T[][] => (
  Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) => rows.slice(i * CHUNK, (i + 1) * CHUNK))
);

// Every citation outside a book, in reading order (by source book, footnote page, then id), so a
// citation comes after the one an "Ibid." in it refers back to
export const findCitationsFromOtherBooks = (db: Kysely<Database>, bookId: string) => (
  db.selectFrom('citations')
    .select([
      'citations.id', 'citations.source_book_id', 'citations.source_footnote_page', 'citations.author',
      'citations.title', 'citations.raw', 'citations.reference_book_id',
    ])
    .where('citations.source_book_id', '<>', bookId)
    .orderBy('citations.source_book_id')
    .orderBy('citations.source_footnote_page')
    .orderBy('citations.id')
    .execute()
);

// Point citations at a book, replacing their location groups with the given ones, in one
// transaction; then clear the cached insights of the pages they now cite. Returns the counts saved.
export const relinkCitations = (
  db: Kysely<Database>, bookId: string, citations: { id: string, groups: CitationPart[][] }[]
) => db.transaction().execute(async(trx) => {
  let groups = 0, locations = 0;

  for (const chunk of chunks(citations)) {
    const ids = chunk.map((c) => c.id);

    await trx.updateTable('citations').set({ reference_book_id: bookId }).where('id', 'in', ids).execute();
    // their locations go with them (citation_locations.citation_group_id cascades)
    await trx.deleteFrom('citation_groups').where('citation_id', 'in', ids).execute();

    const groupRows = chunk.flatMap((c) => c.groups.map((parts) => ({ citationId: c.id, parts })));
    for (const groupChunk of chunks(groupRows)) {
      // RETURNING gives the ids in the order the rows were given
      const groupIds = await trx.insertInto('citation_groups')
        .values(groupChunk.map((g) => ({ citation_id: g.citationId })))
        .returning('id')
        .execute();
      const values   = groupChunk.flatMap((g, i) => g.parts.map((part) => ({
        citation_id:       g.citationId,
        citation_group_id: groupIds[i]!.id,
        type:              part.type as Database['citation_locations']['type'],
        raw:               part.value,
        value:             Number(part.value),
      })));

      for (const valueChunk of chunks(values)) {
        await trx.insertInto('citation_locations').values(valueChunk).execute();
      }
      groups    += groupChunk.length;
      locations += values.length;
    }
  }

  await invalidateInsightsCitedBy(trx, citations.map((c) => c.id));

  return { citations: citations.length, groups, locations };
});
