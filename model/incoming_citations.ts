// Citations in other books of a book: reading them, and pointing them at the book with new locations.
import type { Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import type { PlaceGroup } from '../core/citation_groups.ts';
import { groupRow } from './citation_groups.ts';
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
      'citations.title', 'citations.location', 'citations.raw', 'citations.reference_book_id',
    ])
    .where('citations.source_book_id', '<>', bookId)
    .orderBy('citations.source_book_id')
    .orderBy('citations.source_footnote_page')
    .orderBy('citations.id')
    .execute()
);

// Every citation whose author matches a Postgres regular expression (case-insensitive), in
// reading order as findCitationsFromOtherBooks
export const findCitationsByAuthor = (db: Kysely<Database>, authorPattern: string) => (
  db.selectFrom('citations')
    .select([
      'citations.id', 'citations.source_book_id', 'citations.source_footnote_page', 'citations.author',
      'citations.title', 'citations.location', 'citations.raw', 'citations.reference_book_id',
    ])
    .where('citations.author', '~*', authorPattern)
    .orderBy('citations.source_book_id')
    .orderBy('citations.source_footnote_page')
    .orderBy('citations.id')
    .execute()
);

// Point citations at a book, replacing their citation_groups rows with the given places, in one
// transaction; then clear the cached insights of the pages they now cite. Returns the counts saved.
export const relinkCitations = (
  db: Kysely<Database>, bookId: string, citations: { id: string, groups: PlaceGroup[] }[]
) => db.transaction().execute(async(trx) => {
  let groups = 0;

  for (const chunk of chunks(citations)) {
    const ids = chunk.map((c) => c.id);

    await trx.updateTable('citations').set({ reference_book_id: bookId }).where('id', 'in', ids).execute();
    await trx.deleteFrom('citation_groups').where('citation_id', 'in', ids).execute();

    const groupRows = chunk.flatMap((c) => c.groups.map((place) => groupRow(c.id, place)));
    for (const groupChunk of chunks(groupRows)) {
      await trx.insertInto('citation_groups').values(groupChunk).execute();
      groups += groupChunk.length;
    }
  }

  await invalidateInsightsCitedBy(trx, citations.map((c) => c.id));

  return { citations: citations.length, groups };
});
