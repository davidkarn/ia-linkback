import { describe, expect, it } from '@jest/globals';
import {
  checkConsolidation, consolidationGroups, insightConsolidationActions, insightsHaveChanged,
  MAX_GROUP_SIZE, needsConsolidation, unconsolidated, type Insight,
} from './insight_consolidation.ts';

const original: Insight[] = [
  { id: '1', insight: 'Summa is cited by part, question and article.', score: 1, keywords: ['Summa'] },
  { id: '2', insight: 'The Summa is cited as 1a, qu. 2, art. 3.', score: 2, keywords: ['Summa', '1a'] },
  { id: '3', insight: 'Migne P. L. gives volume and column.', score: 3, keywords: ['Migne', 'P. L.'] },
];

const insight = (id: string, keywords: string[], score: number | null = 2): Insight => (
  { id, insight: `insight ${ id }`, score, keywords }
);
const ids     = (groups: Insight[][]) => groups.map((g) => g.map((i) => i.id));

describe('consolidationGroups', () => {
  it('groups insights sharing a keyword, ignoring case, in the order given', () => {
    expect(ids(consolidationGroups([
      insight('1', ['Summa']), insight('2', ['Migne']), insight('3', ['summa', 'Ia']),
      insight('4', ['P. L.']), insight('5', ['MIGNE', 'p. l.']),
    ]))).toEqual([['1', '3'], ['2', '4', '5']]);
  });

  it('groups insights linked through others sharing keywords with each', () => {
    expect(ids(consolidationGroups([
      insight('1', ['Summa']), insight('2', ['Summa', 'Sent.']), insight('3', ['Sent.']),
      insight('4', ['Migne']),
    ]))).toEqual([['1', '2', '3'], ['4']]);
  });

  it('puts the insights without keywords in a group of their own, last', () => {
    expect(ids(consolidationGroups([insight('1', []), insight('2', ['Summa']), insight('3', [])])))
      .toEqual([['2'], ['1', '3']]);
  });

  it(`doesn't group by a keyword more than ${ MAX_GROUP_SIZE } insights have, and splits large groups`, () => {
    const many = Array.from({ length: MAX_GROUP_SIZE + 1 }, (_, i) => insight(String(i), ['common', `own ${ i }`]));
    expect(consolidationGroups(many)).toHaveLength(MAX_GROUP_SIZE + 1);

    const unkeyed = Array.from({ length: MAX_GROUP_SIZE + 5 }, (_, i) => insight(String(i), []));
    expect(consolidationGroups(unkeyed).map((g) => g.length)).toEqual([MAX_GROUP_SIZE, 5]);
  });
});

describe('needsConsolidation', () => {
  it('is true for two or more insights, or one not scored or without keywords', () => {
    expect(needsConsolidation(original.slice(0, 1))).toBe(false);
    expect(needsConsolidation(original.slice(0, 2))).toBe(true);
    expect(needsConsolidation([{ ...original[0]!, score: null }])).toBe(true);
    expect(needsConsolidation([{ ...original[0]!, keywords: [] }])).toBe(true);
  });
});

describe('checkConsolidation', () => {
  it('drops made-up source ids, cleans keywords, and lists originals no insight was made from', () => {
    const summa = 'The Summa: part, question, article (1a, qu. 2, art. 3).';

    expect(checkConsolidation(original, [
      { insight: summa, score: 1, keywords: ['Summa', 'summa', 'cf'], sourceIds: ['1', '2', '9'] },
    ])).toEqual({
      consolidated: [{ insight: summa, score: 1, keywords: ['Summa'], sourceIds: ['1', '2'] }],
      missingIds:   ['3'],
    });
  });
});

describe('insightsHaveChanged', () => {
  it('is false for insights kept as they are', () => {
    expect(insightsHaveChanged(original, unconsolidated(original))).toBe(false);
  });

  it('is true for a merge, a rewording, a new score or new keywords', () => {
    const keep = (i: Insight) => ({ insight: i.insight, score: i.score, keywords: i.keywords, sourceIds: [i.id] });

    expect(insightsHaveChanged(original, [
      { insight: 'merged', score: 1, keywords: ['Summa'], sourceIds: ['1', '2'] },
      keep(original[2]!),
    ])).toBe(true);
    expect(insightsHaveChanged(original.slice(0, 1), [
      { ...keep(original[0]!), insight: 'reworded' },
    ])).toBe(true);
    expect(insightsHaveChanged(original.slice(2), [{ ...keep(original[2]!), score: 4 }])).toBe(true);
    expect(insightsHaveChanged(original.slice(2), [{ ...keep(original[2]!), keywords: ['Migne'] }]))
      .toBe(true);
  });

  it('ignores the case and order of keywords', () => {
    expect(insightsHaveChanged(original.slice(2), [{
      insight: original[2]!.insight, score: 3, keywords: ['p. l.', 'MIGNE'], sourceIds: ['3'],
    }])).toBe(false);
  });
});

describe('insightConsolidationActions', () => {
  const merged = [
    { insight: 'merged', score: 1, keywords: ['Summa'], sourceIds: ['1', '2'] },
    { insight: original[2]!.insight, score: 3, keywords: ['Migne', 'P. L.'], sourceIds: ['3'] },
  ];
  const logs   = (...lines: string[]) => lines.map((line) => ({ cmd: 'log', data: [line] }));

  it('logs each merge with the originals it replaces and a count, then replaces the insights', () => {
    expect(insightConsolidationActions(original, merged, [])).toEqual([
      ...logs(
        '\nmerged 2 insights:',
        `  - [1] (score 1; Summa) ${ original[0]!.insight }`,
        `  - [2] (score 2; Summa, 1a) ${ original[1]!.insight }`,
        '  => (score 1; Summa) merged',
        '\n3 insights -> 2 (1 unchanged)',
      ),
      {
        cmd:  'modelAction',
        data: {
          model:  'FootnoteExtractionInsights',
          act:    'replaceInsights',
          params: [
            ['1', '2', '3'],
            [
              { insight: 'merged', score: 1, keywords: ['Summa'] },
              { insight: original[2]!.insight, score: 3, keywords: ['Migne', 'P. L.'] },
            ],
          ],
        },
      },
    ]);
  });

  it('logs a rewording', () => {
    expect(insightConsolidationActions(original.slice(0, 1), [
      { insight: 'reworded', score: 1, keywords: ['Summa'], sourceIds: ['1'] },
    ], []).slice(0, 4)).toEqual(logs(
      '\nreworded:',
      `  - [1] (score 1; Summa) ${ original[0]!.insight }`,
      '  => (score 1; Summa) reworded',
      '\n1 insights -> 1 (0 unchanged)',
    ));
  });

  it('logs and saves a score given an insight not scored before', () => {
    const unscored = [{ ...original[2]!, score: null }];
    const actions  = insightConsolidationActions(unscored, [
      { insight: original[2]!.insight, score: 4, keywords: ['Migne', 'P. L.'], sourceIds: ['3'] },
    ], []);

    expect(actions.slice(0, 3)).toEqual(logs(
      '\nrescored:',
      `  - [3] (unscored; Migne, P. L.) ${ original[2]!.insight }`,
      `  => (score 4; Migne, P. L.) ${ original[2]!.insight }`,
    ));
    expect(actions[actions.length - 1]).toMatchObject({
      cmd:  'modelAction',
      data: { params: [['3'], [{ insight: original[2]!.insight, score: 4, keywords: ['Migne', 'P. L.'] }]] },
    });
  });

  it('logs and saves keywords given an insight without any', () => {
    const unkeyed = [{ ...original[2]!, keywords: [] }];
    const actions = insightConsolidationActions(unkeyed, [
      { insight: original[2]!.insight, score: 3, keywords: ['Migne'], sourceIds: ['3'] },
    ], []);

    expect(actions.slice(0, 3)).toEqual(logs(
      '\nnew keywords:',
      `  - [3] (score 3; no keywords) ${ original[2]!.insight }`,
      `  => (score 3; Migne) ${ original[2]!.insight }`,
    ));
    expect(actions[actions.length - 1]).toMatchObject({ cmd: 'modelAction' });
  });

  it("doesn't replace the insights when an original would be lost, and logs which", () => {
    const actions = insightConsolidationActions(original, merged.slice(0, 1), ['3']);

    expect(actions.some((a) => a.cmd === 'modelAction')).toBe(false);
    expect(actions.slice(-2)).toEqual(logs(
      '\nnot replacing: no consolidated insight includes these originals:',
      `  - [3] ${ original[2]!.insight }`,
    ));
  });

  it('only logs when nothing changed', () => {
    expect(insightConsolidationActions(original, unconsolidated(original), [])).toEqual(logs('no changes'));
  });
});
