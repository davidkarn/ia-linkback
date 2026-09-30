import { describe, expect, it } from '@jest/globals';
import {
  checkConsolidation, describeChanges, isChanged, unconsolidated,
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

describe('isChanged', () => {
  it('is false for insights kept as they are', () => {
    expect(isChanged(original, unconsolidated(original))).toBe(false);
  });

  it('is true for a merge or a rewording', () => {
    expect(isChanged(original, [
      { insight: 'merged', sourceIds: ['1', '2'] }, { insight: original[2]!.insight, sourceIds: ['3'] },
    ])).toBe(true);
    expect(isChanged(original.slice(0, 1), [{ insight: 'reworded', sourceIds: ['1'] }])).toBe(true);
  });
});

describe('describeChanges', () => {
  it('shows each merge with the originals it replaces, then a count', () => {
    expect(describeChanges(original, [
      { insight: 'merged', sourceIds: ['1', '2'] }, { insight: original[2]!.insight, sourceIds: ['3'] },
    ])).toEqual([
      '\nmerged 2 insights:',
      `  - [1] ${ original[0]!.insight }`,
      `  - [2] ${ original[1]!.insight }`,
      '  => merged',
      '\n3 insights -> 2 (1 unchanged)',
    ]);
  });
});
