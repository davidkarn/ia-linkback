import util from 'util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import type { Database } from '../api/database.ts';
import { makeOpenRouterRequest, parseJsonResponse, type ORResponseFormat } from '../lib/open_router.js';

dotenv.config()

const log = (...items: any[]) => console.log(util.inspect(items, { depth: null }));

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL
    })
  }),
});

type Insight = { id: string, insight: string };

type ConsolidatedInsight = {
  insight: string,
  sourceIds: string[],   // ids of the footnote_extraction_insights it was made from
};

// Every insight in footnote_extraction_insights, oldest first
const getAllInsights = (): Promise<Insight[]> => (
  db.selectFrom('footnote_extraction_insights')
    .select(['id', 'insight'])
    .orderBy('id')
    .execute()
);

const CONSOLIDATED_FORMAT: ORResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'consolidated_insights',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['insights'],
      properties: {
        insights: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['insight', 'sourceIds'],
            properties: {
              insight: { type: 'string' },
              sourceIds: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  },
};

const CONSOLIDATE_PROMPT = `You maintain a list of insights that help an LLM extract bibliographic citations
from the footnotes of scanned books: how works are commonly cited, how their parts are numbered, and pitfalls
in reading citations.

You will be given the insights as a JSON array of {id, insight}. Consolidate them into as few insights as
possible without losing information:

- Merge insights that say the same thing, or overlapping things, into one insight that keeps every distinct
detail from each of them (abbreviations, numbering schemes, examples, exceptions).
- Keep insights that share no information separate, even if they are about similar works.
- Keep each insight's wording concrete: do not generalize away specific titles, abbreviations or examples.
- Do not add information that is not in the insights.
- Every input id must appear in the sourceIds of exactly the insights that contain its information.

Return the consolidated insights, each with the ids of the input insights it was made from.`;

const consolidateInsights = async (insights: Insight[]): Promise<{
  consolidated: ConsolidatedInsight[],
  missingIds: string[],
}> => {
  if (insights.length < 5) {
    return {
      consolidated: insights.map(i => ({ insight: i.insight, sourceIds: [i.id] })),
      missingIds: [],
    };
  }
  else {
    const response = await makeOpenRouterRequest([
      { role: 'system', content: CONSOLIDATE_PROMPT },
      { role: 'user', content: JSON.stringify(insights) },
    ], CONSOLIDATED_FORMAT);

    const { insights: consolidated } = parseJsonResponse<{ insights: ConsolidatedInsight[] }>(response);

    const inputIds   = new Set(insights.map(i => i.id));
    const claimed    = new Set(consolidated.flatMap(c => c.sourceIds));
    // originals no consolidated insight says it was made from: their information may have been dropped
    const missingIds = [...inputIds].filter(id => !claimed.has(id));

    return {
      consolidated: consolidated.map(
        c => ({
          ...c,
          sourceIds: c.sourceIds.filter(id => inputIds.has(id))
        })
      ),
      missingIds,
    };
  }
};

// Replace the insights that were consolidated with the consolidated ones, in one transaction. Only the rows
// that were read are deleted, so an insight process_ocred_books.ts saves in the meantime is kept.
const replaceInsights = async (original: Insight[], consolidated: ConsolidatedInsight[]) => {
  await db.transaction().execute(async trx => {
    await trx.deleteFrom('footnote_extraction_insights')
      .where('id', 'in', original.map(i => i.id))
      .execute();

    await trx.insertInto('footnote_extraction_insights')
      .values(consolidated.map(c => ({ insight: c.insight })))
      .execute();
  });
};

// What consolidating changed: each merged or reworded insight with the originals it replaces
const logChanges = (original: Insight[], consolidated: ConsolidatedInsight[]) => {
  const byId = new Map(original.map(i => [i.id, i.insight]));
  let unchanged = 0;

  for (const c of consolidated) {
    const sources = c.sourceIds.map(id => byId.get(id)!);
    if (sources.length === 1 && sources[0] === c.insight) {
      unchanged++;
      continue;
    }

    console.log(sources.length > 1 ? `\nmerged ${sources.length} insights:` : '\nreworded:');
    c.sourceIds.forEach(id => console.log(`  - [${id}] ${byId.get(id)}`));
    console.log(`  => ${c.insight}`);
  }

  console.log(`\n${original.length} insights -> ${consolidated.length} (${unchanged} unchanged)`);
};

const main = async () => {
  try {
    const insights                     = await getAllInsights();
    const { consolidated, missingIds } = await consolidateInsights(insights);

    logChanges(insights, consolidated);

    const byId = new Map(insights.map(i => [i.id, i.insight]));
    const changed = consolidated.length !== insights.length
      || consolidated.some(c => c.sourceIds.length !== 1 || byId.get(c.sourceIds[0]!) !== c.insight);

    if (missingIds.length) {
      // replacing would lose these: leave the table as it is
      console.log('\nnot replacing: no consolidated insight includes these originals:');
      missingIds.forEach(id => console.log(`  - [${id}] ${byId.get(id)}`));
    }
    else if (!changed) {
      console.log('nothing to replace');
    }
    else {
      await replaceInsights(insights, consolidated);
      console.log('replaced the insights in the database');
    }
  } finally {
    await db.destroy();
  }
};

main();
