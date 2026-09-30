// Consolidating footnote_extraction_insights with an LLM: merging insights that say the same or
// overlapping things, without losing any. Pure functions;
// cli/commands/consolidate_footnote_insights.command.ts makes the request and saves the result.
import type { ORResponseFormat } from '../lib/open_router.ts';

export type Insight = { id: string, insight: string };

export type ConsolidatedInsight = {
  insight: string,
  sourceIds: string[],   // ids of the footnote_extraction_insights it was made from
};

// Fewer insights than this aren't sent to the model: they're kept as they are
export const MIN_TO_CONSOLIDATE = 5;

export const CONSOLIDATED_FORMAT: ORResponseFormat = {
  type:        'json_schema',
  json_schema: {
    name:   'consolidated_insights',
    strict: true,
    schema: {
      type:                 'object',
      additionalProperties: false,
      required:             ['insights'],
      properties:           {
        insights: {
          type:  'array',
          items: {
            type:                 'object',
            additionalProperties: false,
            required:             ['insight', 'sourceIds'],
            properties:           {
              insight:   { type: 'string' },
              sourceIds: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  },
};

export const CONSOLIDATE_PROMPT = `You maintain a list of insights that help an LLM extract bibliographic citations
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

// Insights kept as they are, one each, when there are too few to consolidate
export const unconsolidated = (insights: Insight[]): ConsolidatedInsight[] => (
  insights.map((i) => ({ insight: i.insight, sourceIds: [i.id] }))
);

// The model's consolidation checked against the originals: source ids it made up are dropped, and
// missingIds are the originals no consolidated insight says it was made from (their information
// may have been lost, so they shouldn't be replaced)
export const checkConsolidation = (
  original: Insight[], consolidated: ConsolidatedInsight[]
): { consolidated: ConsolidatedInsight[], missingIds: string[] } => {
  const inputIds = new Set(original.map((i) => i.id));
  const claimed  = new Set(consolidated.flatMap((c) => c.sourceIds));

  return {
    consolidated: consolidated.map((c) => ({
      ...c,
      sourceIds: c.sourceIds.filter((id) => inputIds.has(id)),
    })),
    missingIds: [...inputIds].filter((id) => !claimed.has(id)),
  };
};

// Whether consolidating changed anything: a merge, a rewording, or a different count
export const isChanged = (original: Insight[], consolidated: ConsolidatedInsight[]): boolean => {
  const byId = new Map(original.map((i) => [i.id, i.insight]));

  return consolidated.length !== original.length
    || consolidated.some((c) => c.sourceIds.length !== 1 || byId.get(c.sourceIds[0]!) !== c.insight);
};

// What consolidating changed, as lines to show: each merged or reworded insight with the
// originals it replaces, then a count
export const describeChanges = (
  original: Insight[], consolidated: ConsolidatedInsight[]
): string[] => {
  const byId      = new Map(original.map((i) => [i.id, i.insight]));
  const unchanged = consolidated.filter((c) => (
    c.sourceIds.length === 1 && byId.get(c.sourceIds[0]!) === c.insight
  ));

  return [
    ...consolidated
      .filter((c) => !unchanged.includes(c))
      .flatMap((c) => [
        c.sourceIds.length > 1 ? `\nmerged ${ c.sourceIds.length } insights:` : '\nreworded:',
        ...c.sourceIds.map((id) => `  - [${ id }] ${ byId.get(id) }`),
        `  => ${ c.insight }`,
      ]),
    `\n${ original.length } insights -> ${ consolidated.length } (${ unchanged.length } unchanged)`,
  ];
};
