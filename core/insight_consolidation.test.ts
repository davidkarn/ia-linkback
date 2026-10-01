import { describe, expect, it } from '@jest/globals';
import {
  checkConsolidation, insightConsolidationActions, insightsHaveChanged, needsConsolidation,
  unconsolidated,
} from './insight_consolidation.ts';

const original = [
  { id: '1', insight: 'Summa is cited by part, question and article.', score: 1 },
  { id: '2', insight: 'The Summa is cited as 1a, qu. 2, art. 3.', score: 2 },
  { id: '3', insight: 'Migne P. L. gives volume and column.', score: 3 },
];

describe('needsConsolidation', () => {
  it('is true for enough insights to merge, or any not scored yet', () => {
    expect(needsConsolidation(original)).toBe(false);
    expect(needsConsolidation([...original, ...original])).toBe(true);
    expect(needsConsolidation([{ ...original[0]!, score: null }])).toBe(true);
  });
});

describe('checkConsolidation', () => {
  it('drops made-up source ids, and lists originals no insight was made from', () => {
    const summa = 'The Summa: part, question, article (1a, qu. 2, art. 3).';

    expect(checkConsolidation(original, [
      { insight: summa, score: 1, sourceIds: ['1', '2', '9'] },
    ])).toEqual({
      consolidated: [{ insight: summa, score: 1, sourceIds: ['1', '2'] }],
      missingIds:   ['3'],
    });
  });
});

describe('insightsHaveChanged', () => {
  it('is false for insights kept as they are', () => {
    expect(insightsHaveChanged(original, unconsolidated(original))).toBe(false);
  });

  it('is true for a merge, a rewording or a new score', () => {
    expect(insightsHaveChanged(original, [
      { insight: 'merged', score: 1, sourceIds: ['1', '2'] },
      { insight: original[2]!.insight, score: 3, sourceIds: ['3'] },
    ])).toBe(true);
    expect(insightsHaveChanged(original.slice(0, 1), [
      { insight: 'reworded', score: 1, sourceIds: ['1'] },
    ])).toBe(true);
    expect(insightsHaveChanged(original.slice(2), [
      { insight: original[2]!.insight, score: 4, sourceIds: ['3'] },
    ])).toBe(true);
  });
});

describe('insightConsolidationActions', () => {
  const merged = [
    { insight: 'merged', score: 1, sourceIds: ['1', '2'] },
    { insight: original[2]!.insight, score: 3, sourceIds: ['3'] },
  ];
  const logs   = (...lines: string[]) => lines.map((line) => ({ cmd: 'log', data: [line] }));

  it('logs each merge with the originals it replaces and a count, then replaces the insights', () => {
    expect(insightConsolidationActions(original, merged, [])).toEqual([
      ...logs(
        '\nmerged 2 insights:',
        `  - [1] (score 1) ${ original[0]!.insight }`,
        `  - [2] (score 2) ${ original[1]!.insight }`,
        '  => (score 1) merged',
        '\n3 insights -> 2 (1 unchanged)',
      ),
      {
        cmd:  'modelAction',
        data: {
          model:  'FootnoteExtractionInsights',
          act:    'replaceInsights',
          params: [
            ['1', '2', '3'],
            [{ insight: 'merged', score: 1 }, { insight: original[2]!.insight, score: 3 }],
          ],
        },
      },
    ]);
  });

  it('logs a rewording', () => {
    expect(insightConsolidationActions(original.slice(0, 1), [
      { insight: 'reworded', score: 1, sourceIds: ['1'] },
    ], []).slice(0, 4)).toEqual(logs(
      '\nreworded:',
      `  - [1] (score 1) ${ original[0]!.insight }`,
      '  => (score 1) reworded',
      '\n1 insights -> 1 (0 unchanged)',
    ));
  });

  it('logs and saves a score given an insight not scored before', () => {
    const unscored = [{ ...original[2]!, score: null }];
    const actions  = insightConsolidationActions(unscored, [
      { insight: original[2]!.insight, score: 4, sourceIds: ['3'] },
    ], []);

    expect(actions.slice(0, 3)).toEqual(logs(
      '\nrescored:',
      `  - [3] (unscored) ${ original[2]!.insight }`,
      `  => (score 4) ${ original[2]!.insight }`,
    ));
    expect(actions[actions.length - 1]).toMatchObject({
      cmd: 'modelAction', data: { params: [['3'], [{ insight: original[2]!.insight, score: 4 }]] },
    });
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
