import { describe, expect, it } from '@jest/globals';
import {
  footnoteBlockFor, footnoteHtml, footnotesPrompt, newInsights, pageCitations, placeCitations,
  removeDuplicateInsights,
} from './footnote_extraction.ts';
import type { SuryaPage } from '../types.ts';

describe('removeDuplicateInsights and newInsights', () => {
  it('keeps the first spelling of insights differing in case, spacing, quotes or end punctuation', () => {
    expect(removeDuplicateInsights([
      'Use “Ibid.” for the work before.', 'use "ibid."  for the work before', '  ', 'Another.',
    ])).toEqual(['Use “Ibid.” for the work before.', 'Another.']);
  });

  it('leaves out insights saved already', () => {
    expect(newInsights(['Saved one.', 'New one', 'new one.'], ['saved ONE'])).toEqual(['New one']);
  });
});

describe('footnotesPrompt', () => {
  it('lists the insights', () => {
    expect(footnotesPrompt(['First insight', 'Second insight']))
      .toContain('    - First insight\n    - Second insight');
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
