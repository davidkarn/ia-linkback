import { describe, expect, it } from '@jest/globals';
import { cleanHtml, paragraphs, summaCitationParts, summaPages, tidyTitle } from './summa_thml.ts';

// A small ThML document shaped like ../thml/summa.xml
const THML = `<ThML><ThML.head><title>not text</title></ThML.head><ThML.body>
<div1 title="Title Page" id="i"><p>Title page</p></div1>
<div1 title="First Part" id="FP">
 <div2 title="Treatise on Sacred Doctrine" id="FP.i">
  <h2>TREATISE ON SACRED DOCTRINE</h2>
  <div3 title="Question. 2 - THE EXISTENCE OF GOD (THREE ARTICLES)" id="FP_Q2">
   <h3 id="FP_Q2-p0.1"><a name="FP_Q2" id="FP_Q2" />THE EXISTENCE OF GOD (TWO ARTICLES)</h3>
   <p id="FP_Q2-p1" />
   <p id="FP_Q2-p2"> Concerning the first, there are two points of inquiry:</p>
   <div4 title="Article. 1 - Whether it is self-evident?" id="FP_Q2_A1">
    <h4><a name="FP_Q2_A1" id="FP_Q2_A1" />Whether the existence of God is self-evident?</h4>
    <p id="FP_Q2_A1-p1" />
    <p><b>Objection 1:</b> It seems so (<scripRef passage="Jn. 14:6" id="x">Jn. 14:6</scripRef>).</p>
    <p><b>I answer that,</b> As said above
      (<a href="#FP_Q1_A7" id="y">Q[1], A[7]</a>), it is not.</p>
   </div4>
   <div4 title="Article. 2 - Whether it can be demonstrated?" id="FP_Q2_A2">
    <h4>Whether it can be demonstrated that God exists?</h4>
    <p><b>Objection 1:</b> It seems not.</p>
   </div4>
  </div3>
  <div3 title="Question. 71 - ON THE WORK OF THE FIFTH DAY" id="FP_Q71">
   <h3>ON THE WORK OF THE FIFTH DAY (ONE ARTICLE)</h3>
   <p>We must next consider the work of the fifth day.</p>
  </div3>
 </div2>
</div1>
<div1 title="First Part of the Second Part" id="FS">
 <div2 title="Treatise on the Last End" id="FS.i">
  <div3 title="Prologue" id="FS.i.i"><h3>PROLOGUE</h3><p>Since man is made in God's image...</p></div3>
  <div3 title="Question. 1 - OF MAN'S LAST END (EIGHT ARTICLES)" id="FS_Q1">
   <h3>OF MAN'S LAST END (EIGHT ARTICLES)</h3>
   <div4 id="FS_Q1_A1"><h4>Whether it belongs to man to act for an end?</h4><p>Text.</p></div4>
  </div3>
 </div2>
</div1>
<div1 title="Third Part" id="TP">
 <div2 id="TP.i"><h2>TREATISE ON THE INCARNATION</h2><p>Forasmuch as our Saviour...</p>
  <div3 id="TP_Q1"><h3>OF THE FITNESS OF THE INCARNATION (SIX ARTICLES)</h3>
   <div4 id="TP_Q1_A1"><h4>Whether it was fitting that God should become incarnate?</h4><p>Text.</p></div4>
  </div3>
 </div2>
</div1>
<div1 title="Indexes" id="viii"><div2 id="viii.i"><p>Genesis</p></div2></div1>
</ThML.body></ThML>`;

const pages = summaPages(THML);
const page  = (label: string) => pages.find((p) => p.printedPageNumber === label)!;
const html  = (label: string, blockLabel: string) => (
  page(label).blocks.filter((b) => b.label === blockLabel).map((b) => b.html)
);

describe('summaPages', () => {
  it('makes a contents page per question, a page per article and a page per prologue, in order', () => {
    expect(pages.map((p) => [p.pageNumber, p.printedPageNumber])).toEqual([
      [1, 'I q. 2'],
      [2, 'I q. 2 a. 1'],
      [3, 'I q. 2 a. 2'],
      [4, 'I q. 71'],
      [5, 'I-II prol.'],
      [6, 'I-II q. 1'],
      [7, 'I-II q. 1 a. 1'],
      [8, 'III prol.'],
      [9, 'III q. 1'],
      [10, 'III q. 1 a. 1'],
    ]);
  });

  it("heads an article's page with its part, question and article", () => {
    expect(html('I q. 2 a. 1', 'PageHeader')).toEqual([
      '<p>Prima Pars</p>', '<p>Question 2</p>', '<p>Article 1</p>',
    ]);
    expect(html('I-II q. 1 a. 1', 'PageHeader')[0]).toBe('<p>Prima Secundae Partis</p>');
  });

  it("gives an article's page its title and paragraphs, cleaned, with its citations numbered", () => {
    expect(html('I q. 2 a. 1', 'SectionHeader'))
      .toEqual(['<h4>Article 1. Whether the existence of God is self-evident?</h4>']);
    expect(html('I q. 2 a. 1', 'Text')).toEqual([
      '<p><b>Objection 1:</b> It seems so (Jn. 14:6)<sup>1</sup>.</p>',
      '<p><b>I answer that,</b> As said above (Q[1], A[7]), it is not.</p>',
    ]);
  });

  it('adds a footnote block for each citation, after the text, carrying its citations', () => {
    const blocks = page('I q. 2 a. 1').blocks;
    const notes  = blocks.filter((b) => b.label === 'Footnote');

    expect(blocks.at(-1)!.label).toBe('Footnote');
    expect(notes.map((b) => b.html)).toEqual(['<p><sup>1</sup> Jn. 14:6</p>']);
    expect(notes[0]!.citations.map((c) => [c.author, c.title, c.location, c.source])).toEqual([[
      'Bible', 'John', '14:6', { bookId: 'summa-theologiae', footnoteIdentifier: '1', footnotePage: 2 },
    ]]);
  });

  it('numbers footnotes from 1 on each page, across its paragraphs', () => {
    const pages = summaPages(THML.replace(
      '<p><b>Objection 1:</b> It seems not.</p>',
      '<p>Augustine says (De Trin. i, 1).</p><p>Dionysius says (Coel. Hier. xii).</p>'
    ));
    const notes = pages.find((p) => p.printedPageNumber === 'I q. 2 a. 2')!.blocks
      .filter((b) => b.label === 'Footnote');

    expect(notes.map((b) => [b.html, b.citations[0]!.author, b.citations[0]!.source.footnotePage])).toEqual([
      ['<p><sup>1</sup> De Trin. i, 1</p>', 'Augustine', 3],
      ['<p><sup>2</sup> Coel. Hier. xii</p>', 'Dionysius', 3],
    ]);
  });

  it('can save the citations under another book id', () => {
    const cited = summaPages(THML, 'test-summa').flatMap((p) => p.blocks).flatMap((b) => b.citations);
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.every((c) => c.source.bookId === 'test-summa')).toBe(true);
  });

  it("gives a question's contents page its title, prologue and list of articles", () => {
    expect(html('I q. 2', 'PageHeader')).toEqual(['<p>Prima Pars</p>', '<p>Question 2</p>']);
    expect(html('I q. 2', 'SectionHeader')).toEqual(['<h3>Question 2: The Existence of God</h3>']);
    expect(html('I q. 2', 'Text')).toEqual([
      '<p>Concerning the first, there are two points of inquiry:</p>',
      '<ul><li><b>Article 1.</b> Whether the existence of God is self-evident?</li>'
        + '<li><b>Article 2.</b> Whether it can be demonstrated that God exists?</li></ul>',
    ]);
  });

  it('keeps the text of a question without articles on its contents page', () => {
    expect(html('I q. 71', 'Text')).toEqual(['<p>We must next consider the work of the fifth day.</p>']);
  });

  it('keeps prologues, whether a section of their own or text before a treatise\'s questions', () => {
    expect(html('I-II prol.', 'Text')).toEqual(["<p>Since man is made in God's image...</p>"]);
    expect(html('III prol.', 'SectionHeader')).toEqual(['<h3>Treatise on the Incarnation</h3>']);
    expect(html('III prol.', 'PageHeader')).toEqual(['<p>Tertia Pars</p>', '<p>Prologue</p>']);
  });

  it('leaves out the title page and indexes', () => {
    expect(pages.flatMap((p) => p.blocks).some((b) => /Title page|Genesis/.test(b.html))).toBe(false);
  });
});

describe('tidyTitle', () => {
  it('drops the article count and puts an all-capitals title in title case', () => {
    expect(tidyTitle("OF MAN'S LAST END (EIGHT ARTICLES)")).toBe("Of Man's Last End");
    expect(tidyTitle('OF THE SIMPLICITY OF GOD')).toBe('Of the Simplicity of God');
  });

  it('leaves a title already in mixed case', () => {
    expect(tidyTitle('The Existence of God (Three Articles)')).toBe('The Existence of God');
  });
});

describe('cleanHtml and paragraphs', () => {
  it('drops empty anchors and keeps link and scripture text', () => {
    expect(cleanHtml('<a name="x" id="x" />See <a href="#y">Q[1]</a> and '
      + '<scripRef passage="Ps. 1:1">Ps. 1:1</scripRef>')).toBe('See Q[1] and Ps. 1:1');
  });

  it('skips empty, self-closing paragraphs', () => {
    expect(paragraphs('<p id="a" /><p> One </p><p id="b"></p><p>Two</p>')).toEqual(['One', 'Two']);
  });
});

describe('summaCitationParts', () => {
  const parts = (label: string) => summaCitationParts(label)?.map((p) => `${ p.type } ${ p.value }`);

  it("cites an article's page by book, question and article", () => {
    expect(parts('I q. 2 a. 1')).toEqual(['book 1', 'question 2', 'article 1']);
    expect(parts('I-II q. 3 a. 2')).toEqual(['book 2', 'question 3', 'article 2']);
    expect(parts('II-II q. 189 a. 10')).toEqual(['book 3', 'question 189', 'article 10']);
    expect(parts('III q. 1 a. 1')).toEqual(['book 4', 'question 1', 'article 1']);
    expect(parts('Suppl. q. 99 a. 5')).toEqual(['book 5', 'question 99', 'article 5']);
  });

  it("cites a question's contents page by book and question, and a prologue by its book", () => {
    expect(parts('I q. 71')).toEqual(['book 1', 'question 71']);
    expect(parts('III prol.')).toEqual(['book 4']);
  });

  it('puts the appendix after book 5 for the appendices to the Supplement', () => {
    expect(parts('Suppl. App. 1 q. 2 a. 6')).toEqual(['book 5', 'appendix 1', 'question 2', 'article 6']);
    expect(parts('Suppl. App. 1 prol.')).toEqual(['book 5', 'appendix 1']);
  });

  it('is null for a label that is not a Summa page', () => {
    expect(summaCitationParts('227')).toBeNull();
    expect(summaCitationParts('IV q. 1')).toBeNull();
  });

  it('reads every label summaPages makes', () => {
    expect(pages.every((p) => summaCitationParts(p.printedPageNumber) !== null)).toBe(true);
  });
});

