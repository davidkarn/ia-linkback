// What the LLM that extracts citations from footnotes has learned about how works are cited
// (footnote_extraction_insights; see core/footnote_extraction.ts and core/insight_consolidation.ts)
import type { Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import type { Insight } from '../core/insight_consolidation.ts';

// Every insight, oldest first
const findInsights = (db: Kysely<Database>): Promise<Insight[]> => (
  db.selectFrom('footnote_extraction_insights')
    .select(['id', 'insight'])
    .orderBy('id')
    .execute()
);

// Replace the insights read (by id) with these, in one transaction. Only the rows read are
// deleted, so an insight saved in the meantime is kept.
const replaceInsights = (db: Kysely<Database>, originalIds: string[], insights: string[]) => (
  db.transaction().execute(async(trx) => {
    await trx.deleteFrom('footnote_extraction_insights').where('id', 'in', originalIds).execute();

    if (insights.length > 0) {
      await trx.insertInto('footnote_extraction_insights')
        .values(insights.map((insight) => ({ insight })))
        .execute();
    }
  })
);

export const FootnoteExtractionInsightQueries = { findInsights };
export const FootnoteExtractionInsightActions = { replaceInsights };
