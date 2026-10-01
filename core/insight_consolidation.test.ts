import { describe, expect, it } from '@jest/globals';
import {
  checkConsolidation, insightConsolidationActions, insightsHaveChanged, unconsolidated,
} from './insight_consolidation.ts';

const original = [
  { id: '1', insight: 'Summa is cited by part, question and article.' },
  { id: '2', insight: 'The Summa is cited as 1a, qu. 2, art. 3.' },
  { id: '3', insight: 'Migne P. L. gives volume and column.' },
];

describe('checkConsolidation', () => {
  it('drops made-up source ids, and lists originals no insight was made from', () => {
    expect(checkConsolidation(original, [
      { insight: 'The Summa: part, question, article (1a, qu. 2, art. 3).', sourceIds: ['1', '2', '9'] },
    ])).toEqual({
      consolidated: [
        { insight: 'The Summa: part, question, article (1a, qu. 2, art. 3).', sourceIds: ['1', '2'] },
      ],
      missingIds: ['3'],
    });
  });
});

describe('insightsHaveChanged', () => {
  it('is false for insights kept as they are', () => {
    expect(insightsHaveChanged(original, unconsolidated(original))).toBe(false);
  });

  it('is true for a merge or a rewording', () => {
    expect(insightsHaveChanged(original, [
      { insight: 'merged', sourceIds: ['1', '2'] }, { insight: original[2]!.insight, sourceIds: ['3'] },
    ])).toBe(true);
    expect(insightsHaveChanged(original.slice(0, 1), [{ insight: 'reworded', sourceIds: ['1'] }])).toBe(true);
  });
});

describe('insightConsolidationActions', () => {
  const merged = [
    { insight: 'merged', sourceIds: ['1', '2'] }, { insight: original[2]!.insight, sourceIds: ['3'] },
  ];
  const logs   = (...lines: string[]) => lines.map((line) => ({ cmd: 'log', data: [line] }));

  it('logs each merge with the originals it replaces and a count, then replaces the insights', () => {
    expect(insightConsolidationActions(original, merged, [])).toEqual([
      ...logs(
        '\nmerged 2 insights:',
        `  - [1] ${ original[0]!.insight }`,
        `  - [2] ${ original[1]!.insight }`,
        '  => merged',
        '\n3 insights -> 2 (1 unchanged)',
      ),
      {
        cmd:  'modelAction',
        data: {
          model:  'FootnoteExtractionInsights',
          act:    'replaceInsights',
          params: [['1', '2', '3'], ['merged', original[2]!.insight]],
        },
      },
    ]);
  });

  it('logs a rewording', () => {
    expect(insightConsolidationActions(original.slice(0, 1), [
      { insight: 'reworded', sourceIds: ['1'] },
    ], []).slice(0, 4)).toEqual(logs(
      '\nreworded:',
      `  - [1] ${ original[0]!.insight }`,
      '  => reworded',
      '\n1 insights -> 1 (0 unchanged)',
    ));
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
