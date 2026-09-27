import { describe, expect, it } from '@jest/globals';
import {
  buildInsightsMessages, citablePageNumber, contextPageNumbers, groupCitingPages, pageText,
  toPageInsights, type CitingSource, type ContextPage,
} from './page_insights.ts';

const page = (pageNumber: number, text: string, printed = String(pageNumber)): ContextPage => ({
  pageNumber,
  printedPageNumber: printed,
  blocks:            [
    { label: 'PageHeader', html: '<p>RUNNING HEAD</p>' },
    { label: 'Text', html: `<p>${ text }</p>` },
  ],
});

const source = (bookId: string, pageNumber: number, ids: string[]): CitingSource => ({
  bookId,
  pageNumber,
  footnoteIdentifiers: ids,
  title:               `Title of ${ bookId }`,
  author:              `Author of ${ bookId }`,
  printedPageNumber:   String(pageNumber - 10),
  context:             contextPageNumbers(pageNumber).map((n) => page(n, `${ bookId } page ${ n }`)),
});

describe('citablePageNumber', () => {
  it('is the printed number when it is an integer', () => {
    expect(citablePageNumber('227')).toBe(227);
  });

  it('is null for Roman numerals, spreads and unnumbered pages', () => {
    expect(citablePageNumber('xii')).toBeNull();
    expect(citablePageNumber('8-9')).toBeNull();
    expect(citablePageNumber('')).toBeNull();
  });
});

describe('groupCitingPages', () => {
  it('makes one entry per citing page, keeping first-cited order and each footnote once', () => {
    expect(groupCitingPages([
      { sourceBookId: 'b', sourcePage: 20, footnoteIdentifier: '3' },
      { sourceBookId: 'a', sourcePage: 5, footnoteIdentifier: '1' },
      { sourceBookId: 'b', sourcePage: 20, footnoteIdentifier: '4' },
      { sourceBookId: 'b', sourcePage: 20, footnoteIdentifier: '3' },
      { sourceBookId: 'b', sourcePage: 21, footnoteIdentifier: '' },
    ])).toEqual([
      { bookId: 'b', pageNumber: 20, footnoteIdentifiers: ['3', '4'] },
      { bookId: 'a', pageNumber: 5, footnoteIdentifiers: ['1'] },
      { bookId: 'b', pageNumber: 21, footnoteIdentifiers: [] },
    ]);
  });

  it('is empty when nothing cites the page', () => {
    expect(groupCitingPages([])).toEqual([]);
  });
});

describe('contextPageNumbers', () => {
  it('is the page and two on either side', () => {
    expect(contextPageNumbers(10)).toEqual([8, 9, 10, 11, 12]);
  });

  it('stops at the first page', () => {
    expect(contextPageNumbers(2)).toEqual([1, 2, 3, 4]);
  });
});

describe('pageText', () => {
  it('drops running headers and footers and HTML, keeping paragraphs apart', () => {
    expect(pageText([
      { label: 'PageHeader', html: '<p>CHRIST\'S HOLINESS</p>' },
      {
        label: 'Text',
        html:  '<p>alone was <i>sufficient</i></p>\n<p>St. Paul &amp; Origen<sup>78</sup></p>',
      },
      { label: 'Footnote', html: '<p><sup>78</sup> Heb. I, 9.</p>' },
      { label: 'PageFooter', html: '<p>227</p>' },
    ])).toBe('alone was sufficient\nSt. Paul & Origen78\n\n78 Heb. I, 9.');
  });
});

describe('buildInsightsMessages', () => {
  const messages = buildInsightsMessages({
    book:    { title: 'Christology', author: 'Joseph Pohle' },
    page:    page(236, 'the page being read', '227'),
    sources: [source('sacraments', 205, ['18']), source('grace', 40, ['2', '5'])],
  });
  const user     = messages[1]!.content;

  it('sends the instructions, then this page and every source with its context pages', () => {
    expect(messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(user).toContain('"Christology" by Joseph Pohle, [scan page 236, printed page 227]');
    expect(user).toContain('the page being read');
    expect(user).toContain('SOURCE S1: "Title of sacraments" by Author of sacraments. '
      + 'It cites the page in footnote 18 on scan page 205.');
    expect(user).toContain('SOURCE S2: "Title of grace" by Author of grace. '
      + 'It cites the page in footnote 2, 5 on scan page 40.');
    for (const n of [203, 204, 205, 206, 207]) {
      expect(user).toContain(`sacraments page ${ n }`);
    }
  });

  it('marks the citing page among its context pages and leaves out running headers', () => {
    expect(user).toContain('[scan page 205, printed page 205] (the citing page)');
    expect(user).not.toContain('RUNNING HEAD');
  });
});

describe('toPageInsights', () => {
  const sources = [source('sacraments', 205, ['18']), source('grace', 40, ['2'])];

  it('lists every source in prompt order with the summary the model gave it', () => {
    const insights = toPageInsights({
      bookId:  'christology',
      page:    page(236, 'x', '227'),
      sources,
      answer:  {
        overview: 'Both use it.',
        sources:  [
          { sourceId: 'S2', summary: 'Grace builds on it.' },
          { sourceId: 'S1', summary: 'Sacraments cites it.' },
          { sourceId: 'S9', summary: 'made up' },
        ],
      },
    });

    expect(insights).toMatchObject({
      bookId: 'christology', pageId: 236, printedPageNumber: '227', overview: 'Both use it.',
    });
    expect(insights.sources.map((s) => [s.bookId, s.pageId, s.summary])).toEqual([
      ['sacraments', 205, 'Sacraments cites it.'],
      ['grace', 40, 'Grace builds on it.'],
    ]);
  });

  it('gives a source the model skipped an empty summary', () => {
    const insights = toPageInsights({
      bookId:  'christology',
      page:    page(236, 'x'),
      sources,
      answer:  { overview: '', sources: [{ sourceId: 'S1', summary: 'only one' }] },
    });

    expect(insights.sources.map((s) => s.summary)).toEqual(['only one', '']);
  });
});
