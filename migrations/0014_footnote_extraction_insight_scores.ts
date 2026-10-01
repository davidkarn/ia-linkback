import { Kysely, sql } from 'kysely';

// How widely an insight applies, 1 to 5: 1 for citations seen in a wide number of texts, 5 for
// very obscure ones, rarely seen. The LLM scores insights as it learns them, and again when they
// are consolidated; only those scored 1 or 2 are given it when extracting citations. Null until
// scored (insights saved before scores).
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table footnote_extraction_insights
    add column score integer
    constraint footnote_extraction_insights_score_check check (score between 1 and 5)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table footnote_extraction_insights drop column score`.execute(db);
}
