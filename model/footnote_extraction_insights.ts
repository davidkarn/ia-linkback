// What the LLM that extracts citations from footnotes has learned about how works are cited
// (footnote_extraction_insights), with each insight's keywords
// (footnote_extraction_insight_keywords; see core/footnote_extraction.ts and
// core/insight_consolidation.ts)
import { sql, type Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import { cleanKeywords, type ScoredInsight } from '../core/footnote_extraction.ts';
import type { Insight } from '../core/insight_consolidation.ts';

// Every insight with its keywords (in the order given), oldest first
const findInsights = async(db: Kysely<Database>): Promise<Insight[]> => {
  const rows = await db.selectFrom('footnote_extraction_insights')
    .select([
      'footnote_extraction_insights.id', 'footnote_extraction_insights.insight',
      'footnote_extraction_insights.score',
      sql<string[]>`coalesce((
        select array_agg(k.keyword order by k.id) from footnote_extraction_insight_keywords k
        where k.insight_id = footnote_extraction_insights.id), '{}')`.as('keywords'),
    ])
    .orderBy('footnote_extraction_insights.id')
    .execute();

  return rows.map((r) => ({ id: r.id, insight: r.insight, score: r.score, keywords: r.keywords }));
};

// Save insights with their keywords (cleaned, see cleanKeywords). db: a transaction, when it's
// one of several writes. Returns how many were saved.
const saveInsights = async(db: Kysely<Database>, insights: ScoredInsight[]): Promise<number> => {
  for (const { insight, score, keywords } of insights) {
    const { id } = await db.insertInto('footnote_extraction_insights')
      .values({ insight, score })
      .returning('id')
      .executeTakeFirstOrThrow();
    const kept   = cleanKeywords(keywords);

    if (kept.length > 0) {
      await db.insertInto('footnote_extraction_insight_keywords')
        .values(kept.map((keyword) => ({ insight_id: id, keyword })))
        .execute();
    }
  }

  return insights.length;
};

// Replace the insights read (by id) with these, in one transaction. Only the rows read are
// deleted (and their keywords with them), so an insight saved in the meantime is kept.
const replaceInsights = (
  db: Kysely<Database>, originalIds: string[], insights: ScoredInsight[]
) => (
  db.transaction().execute(async(trx) => {
    await trx.deleteFrom('footnote_extraction_insights').where('id', 'in', originalIds).execute();
    await saveInsights(trx, insights);
  })
);

export const FootnoteExtractionInsightQueries = { findInsights };
export const FootnoteExtractionInsightActions = { replaceInsights, saveInsights };
