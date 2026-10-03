// Consolidating footnote_extraction_insights with an LLM: merging insights that say the same or
// overlapping things, without losing any. Insights are consolidated in groups that share keywords
// (see consolidationGroups), a request per group. Pure functions;
// cli/commands/consolidate_footnote_insights.command.ts makes the requests and saves the results.
import type { AppAction } from '../actions/app_actions.ts';
import { column } from '../lib/lib.ts';
import type { ORResponseFormat } from '../lib/open_router.ts';
import { cleanKeywords, INSIGHT_KEYWORDS, INSIGHT_SCORES, keywordKey } from './footnote_extraction.ts';

// score: 1 to 5 (see INSIGHT_SCORES), null until scored; keywords: [] until given some
export type Insight = { id: string, insight: string, score: number | null, keywords: string[] };

export type ConsolidatedInsight = {
  insight: string,
  score: number | null,  // the model's; null only for an insight kept as it was, unscored
  keywords: string[],
  sourceIds: string[],   // ids of the footnote_extraction_insights it was made from
};

// The most insights consolidated in one request
export const MAX_GROUP_SIZE = 30;

// Whether to send a group of insights to the model: two or more to merge, or one to score or give
// keywords
export const needsConsolidation = (insights: Insight[]): boolean => (
  insights.length >= 2 || insights.some((i) => i.score === null || i.keywords.length === 0)
);

const chunks = <T>(items: T[], size: number): T[][] => (
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))
);

// The insights in groups to consolidate together: those sharing a keyword (by keywordKey), and
// those sharing one with those, are in one group. A keyword more than MAX_GROUP_SIZE insights have
// is too common to group them by. Insights without keywords are grouped together, to be given
// some. A group is at most MAX_GROUP_SIZE insights (a larger one is split); each group's insights,
// and the groups (by their first insight), are in the order given.
export const consolidationGroups = (insights: Insight[]): Insight[][] => {
  const parent = insights.map((_, i) => i);
  const root   = (i: number): number => {
    while (parent[i] !== i) {
      i = parent[i]!;
    }
    return i;
  };

  const byKeyword = new Map<string, number[]>();
  insights.forEach((insight, i) => {
    for (const key of new Set(insight.keywords.map(keywordKey))) {
      byKeyword.set(key, [...(byKeyword.get(key) ?? []), i]);
    }
  });

  for (const members of byKeyword.values()) {
    if (members.length <= MAX_GROUP_SIZE) {
      for (const i of members.slice(1)) {
        parent[root(i)] = root(members[0]!);
      }
    }
  }

  // by the root of each group, in the order its first insight comes
  const keyed   = new Map<number, Insight[]>();
  const unkeyed = insights.filter((insight, i) => {
    if (insight.keywords.length === 0) {
      return true;
    }
    else {
      keyed.set(root(i), [...(keyed.get(root(i)) ?? []), insight]);
      return false;
    }
  });

  return [...keyed.values(), ...(unkeyed.length > 0 ? [unkeyed] : [])]
    .flatMap((group) => chunks(group, MAX_GROUP_SIZE));
};

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
            required:             ['insight', 'score', 'keywords', 'sourceIds'],
            properties:           {
              insight:   { type: 'string' },
              score:     { type: 'integer', enum: [1, 2, 3, 4, 5] },
              keywords:  { type: 'array', items: { type: 'string' } },
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

You will be given the insights as a JSON array of {id, insight, score, keywords}: related insights,
which share keywords. Consolidate them into as few insights as possible without losing information:

A score of 1 is one that likely to be relevent for most academic philosophical and theological works published in the 19th and early 20th century, a score is 2 is one that is likely to be relevent for more than 10% of such sources, scores 3 to 5 are more obscure and unlikely to be relevent outside of particular works.

- Merge insights that say the same thing, or that have overlapping information on similar circumstances or terms, into one insight that keeps every distinct
detail from each of them (abbreviations, numbering schemes, examples, exceptions).
- Keep each insight's wording concrete: do not generalize away specific titles, abbreviations or examples.
- Do not add information that is not in the insights.
- Every input id must appear in the sourceIds of exactly the insights that contain its information.
- Do not delete any information

Give each consolidated insight ${ INSIGHT_SCORES } An input's score, when it has one, is an
earlier judgement: keep it unless the consolidated insight applies more or less widely.

Give each consolidated insight its ${ INSIGHT_KEYWORDS } Keep the keywords of the inputs it was made
from that still apply to it, and give keywords to inputs that have none.

Return the consolidated insights, each with its score, its keywords and the ids of the input insights
it was made from.`;

// Insights kept as they are, one each, when there's nothing to consolidate
export const unconsolidated = (insights: Insight[]): ConsolidatedInsight[] => (
  insights.map((i) => ({
    insight: i.insight, score: i.score, keywords: i.keywords, sourceIds: [i.id],
  }))
);

// The model's consolidation checked against the originals: source ids it made up are dropped,
// keywords are cleaned (see cleanKeywords), and missingIds are the originals no consolidated
// insight says it was made from (their information may have been lost, so they shouldn't be
// replaced)
export const checkConsolidation = (
  original: Insight[], consolidated: ConsolidatedInsight[]
): { consolidated: ConsolidatedInsight[], missingIds: string[] } => {
  const inputIds = new Set(original.map((i) => i.id));
  const claimed  = new Set(consolidated.flatMap((c) => c.sourceIds));

  return {
    consolidated: consolidated.map((c) => ({
      ...c,
      keywords:  cleanKeywords(c.keywords),
      sourceIds: c.sourceIds.filter((id) => inputIds.has(id)),
    })),
    missingIds: [...inputIds].filter((id) => !claimed.has(id)),
  };
};

// The same keywords, ignoring case and order
const sameKeywords = (a: string[], b: string[]) => {
  const keys = (ks: string[]) => [...new Set(ks.map(keywordKey))].sort().join('\u0000');
  return keys(a) === keys(b);
};

// A consolidated insight that is one original as it was: text, score and keywords
const isUnchanged = (byId: Map<string, Insight>, c: ConsolidatedInsight) => {
  const source = c.sourceIds.length === 1 ? byId.get(c.sourceIds[0]!) : undefined;
  return source !== undefined && source.insight === c.insight && source.score === c.score
    && sameKeywords(source.keywords, c.keywords);
};

// Whether consolidating changed anything: a merge, a rewording, a new score, new keywords, or a
// different count
export const insightsHaveChanged = (original: Insight[], consolidated: ConsolidatedInsight[]): boolean => {
  const byId = new Map(original.map((i) => [i.id, i]));

  return consolidated.length !== original.length || !consolidated.every((c) => isUnchanged(byId, c));
};

const showScore = (score: number | null) => (score === null ? 'unscored' : `score ${ score }`);

const showKeywords = (keywords: string[]) => (
  keywords.length === 0 ? 'no keywords' : keywords.join(', ')
);

// What consolidating changed, as lines to show: each merged, reworded, rescored or re-keyworded
// insight with the originals it replaces and their scores and keywords, then a count
const describeChanges = (
  original: Insight[], consolidated: ConsolidatedInsight[]
): string[] => {
  const byId      = new Map(original.map((i) => [i.id, i]));
  const unchanged = consolidated.filter((c) => isUnchanged(byId, c));
  const kind      = (c: ConsolidatedInsight) => {
    const source = c.sourceIds.length === 1 ? byId.get(c.sourceIds[0]!) : undefined;

    if (source === undefined) {
      return `merged ${ c.sourceIds.length } insights`;
    }
    else if (source.insight !== c.insight) {
      return 'reworded';
    }
    else if (source.score !== c.score) {
      return 'rescored';
    }
    else {
      return 'new keywords';
    }
  };

  return [
    ...consolidated
      .filter((c) => !unchanged.includes(c))
      .flatMap((c) => [
        `\n${ kind(c) }:`,
        ...c.sourceIds.map((id) => (
          `  - [${ id }] (${ showScore(byId.get(id)?.score ?? null) }; `
            + `${ showKeywords(byId.get(id)?.keywords ?? []) }) ${ byId.get(id)?.insight }`
        )),
        `  => (${ showScore(c.score) }; ${ showKeywords(c.keywords) }) ${ c.insight }`,
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
              consolidated.map(({ insight, score, keywords }) => ({ insight, score, keywords })),
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
