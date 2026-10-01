// Consolidating footnote_extraction_insights with an LLM: merging insights that say the same or
// overlapping things, without losing any. Pure functions;
// cli/commands/consolidate_footnote_insights.command.ts makes the request and saves the result.
import type { AppAction } from '../actions/app_actions.ts';
import { column } from '../lib/lib.ts';
import type { ORResponseFormat } from '../lib/open_router.ts';
import { INSIGHT_SCORES } from './footnote_extraction.ts';

// score: 1 to 5 (see INSIGHT_SCORES), null until scored
export type Insight = { id: string, insight: string, score: number | null };

export type ConsolidatedInsight = {
  insight: string,
  score: number | null,  // the model's; null only for an insight kept as it was, unscored
  sourceIds: string[],   // ids of the footnote_extraction_insights it was made from
};

// Fewer insights than this aren't sent to the model, unless one isn't scored yet: they're kept as
// they are
export const MIN_TO_CONSOLIDATE = 5;

// Whether to send the insights to the model: enough of them to merge, or some to score
export const needsConsolidation = (insights: Insight[]): boolean => (
  insights.length >= MIN_TO_CONSOLIDATE || insights.some((i) => i.score === null)
);

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
            required:             ['insight', 'score', 'sourceIds'],
            properties:           {
              insight:   { type: 'string' },
              score:     { type: 'integer', enum: [1, 2, 3, 4, 5] },
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

You will be given the insights as a JSON array of {id, insight, score}. Consolidate them into as few
insights as possible without losing information:

- Merge insights that say the same thing, or overlapping things, into one insight that keeps every distinct
detail from each of them (abbreviations, numbering schemes, examples, exceptions).
- Keep insights that share no information separate, even if they are about similar works.
- Keep each insight's wording concrete: do not generalize away specific titles, abbreviations or examples.
- Do not add information that is not in the insights.
- Every input id must appear in the sourceIds of exactly the insights that contain its information.

Give each consolidated insight ${ INSIGHT_SCORES }. An input's score, when it has one, is an
earlier judgement: keep it unless the consolidated insight applies more or less widely.

Return the consolidated insights, each with its score and the ids of the input insights it was made from.`;

// Insights kept as they are, one each, when there are too few to consolidate
export const unconsolidated = (insights: Insight[]): ConsolidatedInsight[] => (
  insights.map((i) => ({ insight: i.insight, score: i.score, sourceIds: [i.id] }))
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

// A consolidated insight that is one original as it was, text and score
const isUnchanged = (byId: Map<string, Insight>, c: ConsolidatedInsight) => {
  const source = c.sourceIds.length === 1 ? byId.get(c.sourceIds[0]!) : undefined;
  return source !== undefined && source.insight === c.insight && source.score === c.score;
};

// Whether consolidating changed anything: a merge, a rewording, a new score, or a different count
export const insightsHaveChanged = (original: Insight[], consolidated: ConsolidatedInsight[]): boolean => {
  const byId = new Map(original.map((i) => [i.id, i]));

  return consolidated.length !== original.length || !consolidated.every((c) => isUnchanged(byId, c));
};

const showScore = (score: number | null) => (score === null ? 'unscored' : `score ${ score }`);

// What consolidating changed, as lines to show: each merged, reworded or rescored insight with the
// originals it replaces and their scores, then a count
const describeChanges = (
  original: Insight[], consolidated: ConsolidatedInsight[]
): string[] => {
  const byId      = new Map(original.map((i) => [i.id, i]));
  const unchanged = consolidated.filter((c) => isUnchanged(byId, c));
  const kind      = (c: ConsolidatedInsight) => (
    c.sourceIds.length > 1
      ? `merged ${ c.sourceIds.length } insights`
      : (byId.get(c.sourceIds[0]!)?.insight === c.insight ? 'rescored' : 'reworded')
  );

  return [
    ...consolidated
      .filter((c) => !unchanged.includes(c))
      .flatMap((c) => [
        `\n${ kind(c) }:`,
        ...c.sourceIds.map((id) => (
          `  - [${ id }] (${ showScore(byId.get(id)?.score ?? null) }) ${ byId.get(id)?.insight }`
        )),
        `  => (${ showScore(c.score) }) ${ c.insight }`,
      ]),
    `\n${ original.length } insights -> ${ consolidated.length } (${ unchanged.length } unchanged)`,
  ];
};

export const insightConsolidationActions = (
  originalInsights: Insight[],
  consolidated: ConsolidatedInsight[],
  missingIds: string[]
): AppAction[] => {
  if (!insightsHaveChanged(originalInsights, consolidated)) {
    return [{ cmd: 'log', data: ['no changes'] }];
  }
  else {
    const byId                 = new Map(originalInsights.map((i) => [i.id, i.insight]));
    const log                  = (line: string): AppAction => ({ cmd: 'log', data: [line] });
    const outcome: AppAction[] = missingIds.length === 0
      ? [{
          cmd:  'modelAction',
          data: {
            model:  'FootnoteExtractionInsights',
            act:    'replaceInsights',
            params: [
              column(originalInsights, 'id'),
              consolidated.map(({ insight, score }) => ({ insight, score })),
            ],
          },
        }]
      : [
          log('\nnot replacing: no consolidated insight includes these originals:'),
          ...missingIds.map((id) => log(`  - [${ id }] ${ byId.get(id) }`)),
        ];

    return [...describeChanges(originalInsights, consolidated).map(log), ...outcome];
  }
};
