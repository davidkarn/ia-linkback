import { Kysely, sql } from 'kysely';

// The keywords of each footnote extraction insight: words and abbreviations as printed in the
// footnotes it's relevant to ("P. L.", "Migne", "Sent."). The LLM gives them with each insight it
// learns and when consolidating; an insight with a keyword found in a page's footnotes is given
// the model for that page however it's scored, and insights are consolidated in groups that share
// keywords. One per insight (ignoring case); deleted with its insight.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create table footnote_extraction_insight_keywords (
    id bigserial primary key,
    insight_id bigint not null references footnote_extraction_insights(id) on delete cascade,
    keyword text not null,
    created_at timestamptz not null default now()
  )`.execute(db);

  await sql`create unique index footnote_extraction_insight_keywords_insight_keyword_idx
    on footnote_extraction_insight_keywords (insight_id, lower(keyword))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table footnote_extraction_insight_keywords`.execute(db);
}
