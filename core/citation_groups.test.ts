import { describe, expect, it } from '@jest/globals';
import { partColumns, placesOf } from './citation_groups.ts';
import type { CitationLocation } from '../types.ts';

const loc  = (type: CitationLocation['type'], rawLabel: string, ...values: number[]): CitationLocation => (
  { type, rawLabel, values }
);
const show = (group: CitationLocation[]) => placesOf(group).places.map((p) => (
  [p.raw, p.parts.map((part) => `${ part.type } ${ part.value }`).join(', ')]
));

describe('placesOf', () => {
  it('makes one place of a location group without ranges', () => {
    expect(show([loc('book', 'Ephesians', 56), loc('chapter', 'iii', 3), loc('verse', '18', 18)]))
      .toEqual([['Ephesians, iii, 18', 'book 56, chapter 3, verse 18']]);
  });

  it('makes a place per value of a range, sharing the raw label', () => {
    expect(show([loc('chapter', 'ch. 1', 1), loc('verse', 'vv. 2-4', 2, 3, 4)])).toEqual([
      ['ch. 1, vv. 2-4', 'chapter 1, verse 2'],
      ['ch. 1, vv. 2-4', 'chapter 1, verse 3'],
      ['ch. 1, vv. 2-4', 'chapter 1, verse 4'],
    ]);
  });

  it('gathers the values of a type given more than once, without repeats', () => {
    expect(show([loc('volume', 'ix-xi', 9), loc('volume', 'ix-xi', 10), loc('volume', 'ix-xi', 10, 11)]))
      .toEqual([['ix-xi', 'volume 9'], ['ix-xi', 'volume 10'], ['ix-xi', 'volume 11']]);
  });

  it('makes a place for each combination when two types have several values', () => {
    expect(show([loc('chapter', 'chs. 1-2', 1, 2), loc('verse', 'vv. 5-6', 5, 6)]).map(([, parts]) => parts))
      .toEqual(['chapter 1, verse 5', 'chapter 1, verse 6', 'chapter 2, verse 5', 'chapter 2, verse 6']);
  });

  it('leaves out values that are not 32-bit integers, and counts them', () => {
    const { places, skipped } = placesOf([loc('page', 'p. 1.5', 1.5, 3e10), loc('page', 'p. 7', 7)]);
    expect([places.map((p) => [p.raw, p.parts]), skipped]).toEqual([[['p. 7', [{ type: 'page', value: 7 }]]], 2]);
  });

  it('cites nothing when no values are left', () => {
    expect(placesOf([loc('page', 'p. x')])).toEqual({ places: [], skipped: 0 });
  });
});

describe('partColumns', () => {
  it('fills part columns in order, null past the last part', () => {
    const columns = partColumns([{ type: 'book', value: 1 }, { type: 'question', value: 2 }]);
    expect([columns.part1_type, columns.part1_value, columns.part2_type, columns.part2_value, columns.part3_type,
            columns.part8_value]).toEqual(['book', 1, 'question', 2, null, null]);
    expect(Object.keys(columns).length).toBe(16);
  });
});
