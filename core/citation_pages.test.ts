import { describe, expect, it } from '@jest/globals';
import { citation_page_html, type SourceBlock } from './citation_pages.ts';

const block = (id: string, label: string, html: string): SourceBlock => ({ id, label, html });

describe('citation_page_html', () => {
  const blocks = [
    block('1', 'PageHeader', '<p>Running head</p>'),
    block('2', 'Text', '<p>Body text.</p>'),
    block('3', 'Footnote', '<p><sup>1</sup> First note.</p><p><sup>2</sup> Second note.</p>'),
    block('4', 'Footnote', '<p>continued second note.</p><p><sup>3</sup> Third note.</p>'),
    block('5', 'PageFooter', '<p>12</p>'),
  ];

  it("keeps the body and only the citation's footnote, without headers and footers", () => {
    expect(citation_page_html(blocks, '3', '1')).toBe(
      '<p>Body text.</p>\n<p><sup>1</sup> First note.</p>'
    );
  });

  it('follows a footnote into the next block, up to the next marked one', () => {
    expect(citation_page_html(blocks, '3', '2)')).toBe(
      '<p>Body text.</p>\n<p><sup>2</sup> Second note.</p>\n<p>continued second note.</p>'
    );
  });

  it("keeps the citation's whole block when no paragraph has its marker", () => {
    expect(citation_page_html(blocks, '4', '9')).toBe(
      '<p>Body text.</p>\n<p>continued second note.</p><p><sup>3</sup> Third note.</p>'
    );
  });
});
