import { describe, expect, it } from '@jest/globals';
import {
  documentLeaves, fileBook, textDocument, withBooksFrom, workPages, type EpubDocument,
} from './aristotle_epub.ts';

const doc  = (name: string, body: string): EpubDocument => (
  { name, html: `<html><body>${ body }</body></html>` }
);
const para = (words: number, prefix = 'text') => `<p>${ Array.from({ length: words }, (_, i) => `${ prefix }${ i }`).join(' ') }</p>`;
const show = (docs: EpubDocument[], reading = {}) => workPages('Work', docs, reading).map((p) => (
  `${ p.printedPageNumber } [${ p.citationParts.map((c) => `${ c.type } ${ c.value }`).join(', ') }]`
));

describe('fileBook', () => {
  it("reads a file's book from its name, by numeral or word", () => {
    expect(fileBook('c2_History_of_Animals__Thompson__Book_II.xhtml')).toBe(2);
    expect(fileBook('c3_Nicomachean_Ethics__Ross__Book_Three.xhtml')).toBe(3);
    expect(fileBook('c1_Rhetoric__Freese__Book_1.xhtml')).toBe(1);
    expect(fileBook('c1_On_Sense_and_the_Sensible_Section_I.xhtml')).toBeNull();
  });
});

describe('documentLeaves', () => {
  it('finds chapters marked by a paragraph, a heading, a bold opening number or an anchor', () => {
    const { leaves } = documentLeaves(`<body>
      <p>Part 2 </p><h3>Chapter 3</h3><p><b>4</b> If then there is some end...</p>
      <p><span id="Chapter_5" class="wst-anchor"><b>5</b></span> Forms of speech are simple.</p>
      <p> <br/> 6</p><p>BOOK SECOND. CHAPTER I.</p><p>Just a paragraph.</p></body>`);

    expect(leaves.map((l) => l.marker)).toEqual([
      { kind: 'chapter', value: 2 }, { kind: 'chapter', value: 3 }, { kind: 'chapter', value: 4 },
      { kind: 'chapter', value: 5 }, { kind: 'chapter', value: 6 },
      { kind: 'book', value: 2, chapter: 1 }, undefined,
    ]);
  });

  it('makes a heading of a marker on its own, not of a paragraph a marker opens', () => {
    const { leaves } = documentLeaves(`<body><p>Chapter 2</p>
      <p><b>3</b> Since, then, the present inquiry does not aim at theoretical knowledge like the others
        (for we are inquiring not in order to know what virtue is).</p></body>`);
    expect(leaves.map((l) => l.heading)).toEqual([true, false]);
  });

  it("doesn't take years, abbreviations or margin line numbers for chapters", () => {
    const { leaves } = documentLeaves(`<body><p>1882</p><p>C.</p>
      <p><span class="wst-woach"><span>15</span></span>A man is an animal.</p></body>`);
    expect(leaves.map((l) => l.marker)).toEqual([undefined, undefined, undefined]);
    expect(leaves[2]!.text).toBe('A man is an animal.');
  });

  it("leaves out Wikisource's furniture and keeps text markup, notes' references as numbers", () => {
    const { leaves, notes } = documentLeaves(`<body>
      <p><span class="pagenum ws-pagenum">[1]</span><i>Good</i> is what all things aim at<sup class="mw-ref reference"><a href="#cite_note-1">[1]</a></sup>.
        <span class="wst-verse"><sup><b>1094<sup>a</sup></b></sup></span></p>
      <ol class="mw-references references"><li id="cite_note-1" data-mw-footnote-number="1">
        <span class="mw-cite-backlink">↑</span> <span class="reference-text">Perhaps by Eudoxus.</span></li></ol>
      <div class="licenseContainer"><p>This work is in the public domain.</p></div></body>`);

    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.html).toBe('<i>Good</i> is what all things aim at<sup>1</sup>.');
    expect(leaves[0]!.noteRefs).toEqual(['cite_note-1']);
    expect(notes.get('cite_note-1')).toEqual({ id: 'cite_note-1', number: '1', html: 'Perhaps by Eudoxus.' });
  });

  it('stops at "External links"', () => {
    const { leaves } = documentLeaves('<body><p>Text.</p><h2>External links</h2><p>A link.</p></body>');
    expect(leaves.map((l) => l.text)).toEqual(['Text.']);
  });
});

describe('workPages', () => {
  it('makes a page of each chapter, cited by book (from the file) and chapter', () => {
    expect(show([
      doc('c1_W_Book_I.xhtml', `<p>Part 1</p>${ para(40) }<p>Part 2</p>${ para(40) }`),
      doc('c2_W_Book_II.xhtml', `<p>Part 1</p>${ para(40) }`),
    ])).toEqual([
      'Book I, Chapter 1 [book 1, chapter 1]', 'Book I, Chapter 2 [book 1, chapter 2]',
      'Book II, Chapter 1 [book 2, chapter 1]',
    ]);
  });

  it('cites a work of one book by chapter alone, its front matter by nothing', () => {
    expect(show([doc('c0_W.xhtml', `<h2>Preface</h2>${ para(40) }<p>1</p>${ para(40) }<p>2</p>${ para(40) }`)]))
      .toEqual(['Preface []', 'Chapter 1 [chapter 1]', 'Chapter 2 [chapter 2]']);
  });

  it('drops a table of contents: chapters listed again, or markers with next to no text', () => {
    expect(show([doc('c0_W.xhtml', `<h2>Contents</h2>${
      ['1', '2', '3'].map((n) => `<p>Chap. ${ n }. Of things.</p>${ para(40, 'summary') }`).join('')
    }${ ['1', '2', '3'].map((n) => `<p>Chapter ${ n }</p>${ para(200) }`).join('') }`)]))
      .toEqual(['Contents []', 'Chapter 1 [chapter 1]', 'Chapter 2 [chapter 2]', 'Chapter 3 [chapter 3]']);
  });

  it("takes a book's long unmarked opening before its chapter 2 for its chapter 1", () => {
    expect(show([doc('c1_W_Book_I.xhtml', `${ para(150) }<p><b>2</b> More.</p>${ para(40) }`)]))
      .toEqual(['Book I, Chapter 1 [book 1, chapter 1]', 'Book I, Chapter 2 [book 1, chapter 2]']);
  });

  it('reads books marked in the text, and from where the reading says the text starts', () => {
    expect(show([doc('c0_W.xhtml', `<p>Book I.</p><p>Book II.</p>${ para(40, 'contents') }`
      + `<p>CHAPTER I.</p>${ para(40) }<p>BOOK SECOND. CHAPTER I.</p>${ para(40) }`)],
                { textStartsAt: /^CHAPTER I\.$/, firstBook: 1 }))
      // the contents before the text: a page of no book or chapter, labelled by its first heading
      .toEqual(['Book I. []', 'Book I, Chapter 1 [book 1, chapter 1]', 'Book II, Chapter 1 [book 2, chapter 1]']);
  });

  it("puts each footnote on the page that refers to it, under the work's title", () => {
    const [page] = workPages('Ethics', [doc('c0_W.xhtml', `<p>Part 1</p><p>Good<sup class="mw-ref"><a href="#cite_note-1">[1]</a></sup> ${ 'word '.repeat(40) }</p>
      <ol class="references"><li id="cite_note-1" data-mw-footnote-number="1"><span class="reference-text">A note.</span></li></ol>`)]);

    expect(page!.blocks.map((b) => [b.label, b.html.slice(0, 30)])).toEqual([
      ['PageHeader', '<p>Ethics</p>'],
      ['SectionHeader', '<h3>Part 1</h3>'],
      ['Text', '<p>Good<sup>1</sup> word word '],
      ['Footnote', '<p><sup>1</sup> A note.</p>'],
    ]);
  });
});

describe('textDocument', () => {
  const text = [
    'Provided by The Internet Classics Archive.', '', 'Physics', 'By Aristotle', '',
    'BOOK I', '', 'Part 1 ', '', 'When the objects of an inquiry, in any department,',
    'have principles, conditions, or elements,', '', `${ 'more words '.repeat(20) }`, '',
    'Part 2', '', `${ 'still more words '.repeat(20) }`, '', 'BOOK II', '', 'Part 1', '',
    `${ 'nature '.repeat(40) }`, '', 'THE END', '', 'Copyright statement: all rights reserved.',
  ].join('\r\n');

  it("keeps the text from the first book to the end, a paragraph per run of lines", () => {
    const html = textDocument('physics.txt', text).html;
    expect(html).toContain('<p>When the objects of an inquiry, in any department, have principles, conditions, or elements,</p>');
    expect(html).not.toContain('Internet Classics Archive');
    expect(html).not.toContain('Copyright');
  });

  it("reads chapter lines with stray quotation marks, and drops paragraphs of nothing but them", () => {
    const quoted = ['BOOK I', '', 'Part 1 "', '', '"', '', `"THERE are ${ 'senses '.repeat(40) }`, '', 'Part 2 "', '',
                    `${ 'being '.repeat(40) }`, '', 'THE END'].join('\n');
    const pages  = workPages('M', [textDocument('m.txt', quoted)]);

    expect(pages.map((p) => p.printedPageNumber)).toEqual(['Book I, Chapter 1', 'Book I, Chapter 2']);
    expect(pages[0]!.blocks.map((b) => b.html)).not.toContain('<p>"</p>');
  });

  it('reads as pages by book and chapter', () => {
    expect(show([textDocument('physics.txt', text)])).toEqual([
      'Book I, Chapter 1 [book 1, chapter 1]', 'Book I, Chapter 2 [book 1, chapter 2]',
      'Book II, Chapter 1 [book 2, chapter 1]',
    ]);
  });
});

describe('withBooksFrom', () => {
  const page = (source: string, book: number | null, chapter: number | null, n: number) => ({
    pageNumber:        n,
    printedPageNumber: `${ source } ${ book }.${ chapter }`,
    citationParts:     [
      ...(book === null ? [] : [{ type: 'book', value: book }]),
      ...(chapter === null ? [] : [{ type: 'chapter', value: chapter }]),
    ],
    blocks: [],
  });

  it("takes the books given from the other edition, keeps the rest, in book order, numbered again", () => {
    const main       = [page('main', null, null, 1), page('main', 1, 1, 2), page('main', 2, 1, 3), page('main', 3, 1, 4)];
    const supplement = [page('mit', 1, 1, 1), page('mit', 2, 1, 2), page('mit', 2, 2, 3), page('mit', 4, 1, 4)];

    expect(withBooksFrom(main, supplement, [2, 4]).map((p) => `${ p.pageNumber } ${ p.printedPageNumber }`))
      .toEqual(['1 main null.null', '2 main 1.1', '3 mit 2.1', '4 mit 2.2', '5 main 3.1', '6 mit 4.1']);
  });
});
