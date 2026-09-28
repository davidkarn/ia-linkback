import { describe, expect, it } from '@jest/globals';
import { contentsOf, type ContentsEntry } from './contents.ts';

// pages numbered from 1 in the order given
const pages = (...paths: [string, string][][]) => paths.map((pairs, i) => ({
  pageId: i + 1,
  parts:  pairs.map(([type, value]) => ({ type, value: Number(value) })),
}));
const parts = (...pairs: [string, string][]) => pairs;
const show  = (entries: ContentsEntry[]): unknown[] => entries.map((e) => {
  const label = `${ e.partType } ${ e.partValue } p${ e.pageId }`;
  return e.childEntries.length > 0 ? [label, show(e.childEntries)] : label;
});

describe('contentsOf', () => {
  it('is empty for a book whose pages are not cited by parts', () => {
    expect(contentsOf([])).toEqual([]);
  });

  it('nests each page under the parts before its last, in page order', () => {
    expect(show(contentsOf(pages(
      parts(['book', '1']),
      parts(['book', '1'], ['question', '2']),
      parts(['book', '1'], ['question', '2'], ['article', '1']),
      parts(['book', '1'], ['question', '2'], ['article', '2']),
      parts(['book', '1'], ['question', '3']),
      parts(['book', '2'], ['question', '1'], ['article', '1']),
    )))).toEqual([
      ['book 1 p1', [['question 2 p2', ['article 1 p3', 'article 2 p4']], 'question 3 p5']],
      ['book 2 p6', [['question 1 p6', ['article 1 p6']]]],
    ]);
  });

  it('gives flat parts a flat table', () => {
    expect(show(contentsOf(pages(parts(['chapter', '1']), parts(['chapter', '2'])))))
      .toEqual(['chapter 1 p1', 'chapter 2 p2']);
  });

  it("goes to the page cited by an entry's own parts, even when a page under it comes first", () => {
    expect(show(contentsOf(pages(
      parts(['book', '1'], ['chapter', '1']),
      parts(['book', '1']),
      parts(['book', '1'], ['chapter', '2']),
    )))).toEqual([['book 1 p2', ['chapter 1 p1', 'chapter 2 p3']]]);
  });
});
