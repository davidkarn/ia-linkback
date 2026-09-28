import { describe, expect, it } from '@jest/globals';
import { contentsOf, type ContentsEntry } from './contents.ts';

const parts = (...pairs: [string, string][]) => pairs.map(([type, value]) => ({ type, value }));
const show  = (entries: ContentsEntry[]): unknown[] => entries.map((e) => (
  e.childEntries.length > 0 ? [`${ e.partType } ${ e.partValue }`, show(e.childEntries)] : `${ e.partType } ${ e.partValue }`
));

describe('contentsOf', () => {
  it('is empty for a book whose pages are not cited by parts', () => {
    expect(contentsOf([])).toEqual([]);
  });

  it('nests each page under the parts before its last, in page order', () => {
    expect(show(contentsOf([
      parts(['book', '1']),
      parts(['book', '1'], ['question', '2']),
      parts(['book', '1'], ['question', '2'], ['article', '1']),
      parts(['book', '1'], ['question', '2'], ['article', '2']),
      parts(['book', '1'], ['question', '3']),
      parts(['book', '2'], ['question', '1'], ['article', '1']),
    ]))).toEqual([
      ['book 1', [['question 2', ['article 1', 'article 2']], 'question 3']],
      ['book 2', [['question 1', ['article 1']]]],
    ]);
  });

  it('gives flat parts a flat table', () => {
    expect(show(contentsOf([parts(['chapter', '1']), parts(['chapter', '2'])]))).toEqual(['chapter 1', 'chapter 2']);
  });
});
