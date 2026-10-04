// The citations of each of a book's pages counted (citedCountsByPage in model/page_insights.ts),
// cached in page_cited_counts_cache. Any change to what's counted clears the whole cache, which
// refills a book at a time as its counts are asked for: new or relinked citations, a book's pages
// or page citation parts saved again, or a copyright status set (withheld books' citations aren't
// counted).
import type { Kysely } from 'kysely';
import type { Database } from '../api/database.ts';

// A book's cached counts, by page number; null when they aren't cached
const findCachedCounts = async(
  db: Kysely<Database>, bookId: string
): Promise<Map<number, number> | null> => {
  const row = await db.selectFrom('page_cited_counts_cache')
    .select('page_cited_counts_cache.counts')
    .where('page_cited_counts_cache.book_id', '=', bookId)
    .executeTakeFirst();

  return row === undefined
    ? null
    : new Map(Object.entries(row.counts).map(([page, n]) => [Number(page), n]));
};

// Cache a book's counts, replacing any cached
const saveCachedCounts = (db: Kysely<Database>, bookId: string, counts: Map<number, number>) => (
  db.insertInto('page_cited_counts_cache')
    .values({ book_id: bookId, counts: JSON.stringify(Object.fromEntries(counts)) })
    .onConflict((oc) => oc.column('book_id').doUpdateSet((eb) => ({
      counts:     eb.ref('excluded.counts'),
      created_at: eb.fn('now'),
    })))
    .execute()
);

// Clear every book's cached counts. db: the transaction making the change, so they're cleared
// with it.
const clearCachedCounts = (db: Kysely<Database>) => (
  db.deleteFrom('page_cited_counts_cache').execute()
);

export const PageCitedCountsCacheQueries = { findCachedCounts };
export const PageCitedCountsCacheActions = { saveCachedCounts, clearCachedCounts };
