import { describe, expect, it } from '@jest/globals';
import {
  byScore, cleanKeywords, footnoteBlockFor, footnoteHtml, footnotesPrompt, footnoteText, hasKeyword,
  insightsForPage, insightsForPrompt, isGivenToModel, learnedInsights, MAX_KEYWORDS, newInsights,
  pageCitations, placeCitations, removeDuplicateInsights,
} from './footnote_extraction.ts';
import type { SuryaPage } from '../types.ts';

describe('removeDuplicateInsights and newInsights', () => {
  const scored = (insight: string, score: number | null = 1) => ({ insight, score, keywords: [] });

  it('keeps the first of insights differing in case, spacing, quotes or end punctuation', () => {
    expect(removeDuplicateInsights([
      scored('Use “Ibid.” for the work before.', 1), scored('use "ibid."  for the work before', 4),
      scored('  '), scored('Another.', 2),
    ])).toEqual([scored('Use “Ibid.” for the work before.', 1), scored('Another.', 2)]);
  });

  it('leaves out insights saved already', () => {
    expect(newInsights([scored('Saved one.'), scored('New one'), scored('new one.')], ['saved ONE']))
      .toEqual([scored('New one')]);
  });
});

describe('insightsForPrompt', () => {
  it('gives those scored 2 or less, most widely applying first, then those not scored', () => {
    expect(insightsForPrompt([
      { insight: 'obscure', score: 5, keywords: [] },
      { insight: 'unscored', score: null, keywords: [] },
      { insight: 'common-ish', score: 2, keywords: [] },
      { insight: 'rare', score: 3, keywords: [] },
      { insight: 'common', score: 1, keywords: [] },
      { insight: 'also common', score: 1, keywords: [] },
    ])).toEqual(['common', 'also common', 'common-ish', 'unscored']);
  });
});

describe('byScore and isGivenToModel', () => {
  it('orders insights by score, the unscored last, keeping the order of equal scores', () => {
    expect(byScore([
      { insight: 'c', score: null, keywords: [] }, { insight: 'b', score: 4, keywords: [] }, { insight: 'a1', score: 1, keywords: [] },
      { insight: 'a2', score: 1, keywords: [] },
    ]).map((i) => i.insight)).toEqual(['a1', 'a2', 'b', 'c']);
  });

  it('gives the model insights scored 2 or less, and those not scored', () => {
    expect([1, 2, 3, 5, null].map(isGivenToModel)).toEqual([true, true, false, false, true]);
  });
});

describe('footnotesPrompt', () => {
  it('lists the insights, and asks for the new ones scored, with keywords', () => {
    const prompt = footnotesPrompt(['First insight', 'Second insight']);

    expect(prompt).toContain('    - First insight\n    - Second insight');
    expect(prompt).toContain('A score of 1 is');
    expect(prompt).toContain('keywords: 1 to 8 distinctive words or abbreviations');
  });
});

describe('cleanKeywords', () => {
  it('trims, drops repeats (ignoring case and spacing) and keywords too short, in order', () => {
    expect(cleanKeywords(['  Migne ', 'P.  L.', 'migne', 'p. l.', 'cf', '', 'Sent.']))
      .toEqual(['Migne', 'P. L.', 'Sent.']);
  });

  it(`keeps at most ${ MAX_KEYWORDS }`, () => {
    expect(cleanKeywords(Array.from({ length: 12 }, (_, i) => `keyword ${ i }`))).toHaveLength(MAX_KEYWORDS);
  });
});

describe('hasKeyword', () => {
  it('finds a keyword as whole words, ignoring case', () => {
    expect(hasKeyword('SUMMA THEOL. I, q. 2', 'Summa Theol.')).toBe(true);
    expect(hasKeyword('Pohle-Preuss, Christology', 'Pohle')).toBe(true);
    expect(hasKeyword('S. Aug. de Trin. 4', 'Aug.')).toBe(true);
  });

  it("doesn't find a keyword inside a longer word", () => {
    expect(hasKeyword('the Sentences of Lombard', 'Sent.')).toBe(false);
    expect(hasKeyword('August 3, 1870', 'Aug')).toBe(false);
  });

  it("ignores the spacing after an abbreviation's dots", () => {
    expect(hasKeyword('Migne, P.L. 34, 120', 'P. L.')).toBe(true);
    expect(hasKeyword('Migne, P. L. 34, 120', 'P.L.')).toBe(true);
  });

  it('never finds a keyword too short to tell footnotes apart', () => {
    expect(hasKeyword('cf. p. 3', 'cf')).toBe(false);
  });
});

describe('insightsForPage', () => {
  const insight = (text: string, score: number | null, keywords: string[] = []) => (
    { insight: text, score, keywords }
  );
  const common  = insight('Common.', 1);
  const migne   = insight('Migne P. L. gives volume and column.', 4, ['Migne', 'P. L.']);
  const lombard = insight('Sent. is Lombard.', 3, ['Sent.']);
  const scotus  = insight('Ox. is the Opus Oxoniense.', 2, ['Ox.']);

  it('gives the insights for every page, then those with a keyword in the footnotes', () => {
    expect(insightsForPage([common], [common, migne, lombard], 'Migne, P.L. 34, 120.'))
      .toEqual(['Common.', 'Migne P. L. gives volume and column.']);
  });

  it('orders the matched insights by score, and gives each once', () => {
    expect(insightsForPage([common], [migne, common, scotus, lombard], 'Sent. I; Ox. II; Migne'))
      .toEqual(['Common.', scotus.insight, lombard.insight, migne.insight]);
  });

  it('gives only the insights for every page when no keyword is found', () => {
    expect(insightsForPage([common], [common, migne], 'Summa Theol. I, q. 2')).toEqual(['Common.']);
  });
});

describe('learnedInsights', () => {
  it("takes the model's new insights, their keywords cleaned", () => {
    expect(learnedInsights({
      footnotes:          [],
      additionalInsights: [{ insight: 'Sent. is Lombard.', score: 3, keywords: ['Sent.', ' sent. ', 'cf'] }],
    })).toEqual([{ insight: 'Sent. is Lombard.', score: 3, keywords: ['Sent.'] }]);
  });
});

describe('footnoteHtml', () => {
  it("joins a page's Footnote blocks in reading order", () => {
    const block = (label: string, html: string, reading_order: number) => (
      { label, html, reading_order } as SuryaPage['blocks'][number]
    );
    const page  = { page:   3,
                    blocks: [
                      block('Footnote', '<p>2 Second</p>', 5), block('Text', '<p>Body</p>', 1),
                      block('Footnote', '<p>1 First</p>', 4),
                    ] } as SuryaPage;

    expect(footnoteHtml(page)).toBe('<p>1 First</p>\n<p>2 Second</p>');
    expect(footnoteText(page)).toBe('1 First\n2 Second');
  });
});

describe('pageCitations', () => {
  it("gives each citation its footnote's marker and page", () => {
    const location = [[{ rawLabel: 'p. 3', type: 'page' as const, values: [3] }]];
    expect(pageCitations('book-1', 12, {
      additionalInsights: [],
      footnotes:          [{ identifier: '4',
                             citations:  [{
                               author:         'Pohle',
                               title:          'Christology',
                               location:       'p. 3',
                               raw:            'Pohle, Christology, p. 3',
                               locationsCited: location,
                             }] }],
    })).toEqual([{
      source:          { bookId: 'book-1', footnoteIdentifier: '4', footnotePage: 12 },
      referenceBookId: null,
      author:          'Pohle',
      title:           'Christology',
      location:        'p. 3',
      raw:             'Pohle, Christology, p. 3',
      locationsCited:  location,
    }]);
  });
});

describe('footnoteBlockFor', () => {
  const blocks = [
    { id: 'a', html: '<p>continued from before.</p>' },
    { id: 'b', html: '<p><sup>12</sup> Pohle, God.</p>' },
    { id: 'c', html: '<p>13) Tanquerey.</p><p>* Starred note.</p>' },
  ];

  it('finds the block where the marker starts a footnote, as <sup> or at a line start', () => {
    expect(footnoteBlockFor(blocks, '12')?.id).toBe('b');
    expect(footnoteBlockFor(blocks, '13')?.id).toBe('c');
    expect(footnoteBlockFor(blocks, '*')?.id).toBe('c');
  });

  it("takes a continued footnote's first block, and is undefined for a marker found nowhere", () => {
    expect(footnoteBlockFor(blocks, '')?.id).toBe('a');
    expect(footnoteBlockFor(blocks, '99')).toBeUndefined();
  });
});

describe('placeCitations', () => {
  const block = (label: 'Text' | 'Footnote', html: string) => (
    { bbox: [0, 0, 1, 1] as [number, number, number, number], label, html, citations: [] }
  );
  const pages = [{ pageNumber:        4,
                   printedPageNumber: '4',
                   blocks:            [
                     block('Text', '<p>Body</p>'),
                     block('Footnote', '<p><sup>1</sup> Pohle.</p>'),
                     block('Footnote', '<p><sup>2</sup> Tanquerey.</p>'),
                   ] }];
  const cite  = (footnotePage: number, footnoteIdentifier: string) => ({
    source:          { bookId: 'b', footnoteIdentifier, footnotePage },
    referenceBookId: null,
    author:          '',
    title:           '',
    location:        '',
    raw:             '',
    locationsCited:  [],
  });

  it("places each citation at its footnote block's position on its page", () => {
    expect(placeCitations(pages, [cite(4, '2'), cite(4, '1')]).placed).toEqual([
      { pageNumber: 4, position: 2, citation: cite(4, '2') },
      { pageNumber: 4, position: 1, citation: cite(4, '1') },
    ]);
  });

  it('leaves out citations whose page has no block with their marker', () => {
    expect(placeCitations(pages, [cite(4, '9'), cite(5, '1')]).unplaced).toEqual([cite(4, '9'), cite(5, '1')]);
  });
});
