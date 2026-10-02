import { describe, expect, it } from '@jest/globals';
import { consolationPages, quotationReferences } from './consolation_gutenberg.ts';

const html = `<html><body>
  <ul class="TOC"><li>BOOK I.<br> THE SORROWS OF BOETHIUS.</li></ul>
  <h2>PREFACE.</h2><p>The translator's preface.</p>
  <h2>BOOK I.</h2>
  <h3>SONG I.<br> Boethius' Complaint.</h3>
  <div class="poem"><div class="stanza"><span>Who wrought my studious numbers<br></span>
    <span class="i2">Smoothly once in happier days,<br></span></div></div>
  <a id="Page_6"></a><h3>I.</h3>
  <p>While I was thus mutely pondering, the letter θ,<a class="fnanchor" href="#Footnote_A_1">[A]</a> and more.</p>
  <h2>BOOK II.</h2><h3>I.</h3><p>After this she abode silent.</p>
  <h3>SONG I.<a class="fnanchor" href="#Footnote_B_2">[B]</a><br> Fortune's Malice.</h3>
  <div class="poem"><div class="stanza"><span>Mad Fortune sweeps along</span></div></div>
  <p class="center">FOOTNOTES:</p>
  <div class="footnote"><p><a id="Footnote_A_1"></a><a href="#FNanchor_A_1"><span class="label">[A]</span></a> θ for the Theoretical life.</p></div>
  <div class="footnote"><p><a id="Footnote_B_2"></a><a href="#FNanchor_B_2"><span class="label">[B]</span></a> A note on Fortune.</p></div>
  <h2>EPILOGUE.</h2><p>Boethius died by a cruel death.</p>
  <h2>REFERENCES TO QUOTATIONS IN THE TEXT.</h2>
  <ul class="Quot"><li>Bk. I., ch. i., <a href="#Page_17">p. 17</a>, l. 6: 'Iliad,' I. 363.</li></ul>
  <footer><p>THE FULL PROJECT GUTENBERG LICENSE</p></footer>
</body></html>`;

describe('quotationReferences', () => {
  it('reads each quotation by book and prose section, a book carried on to the entries after it', () => {
    expect(quotationReferences(`Bk. I., ch. iv., p. 17 , l. 6: 'Iliad,' I. 363. ch. v., p. 30 , l. 19: 'Iliad,' II., 204.
      Bk. V., ch. i., p. 227 , l. 16: Aristotle, 'Physics,' II. v. 5.`)).toEqual([
      { book: 1, prose: 4, source: "'Iliad,' I. 363." },
      { book: 1, prose: 5, source: "'Iliad,' II., 204." },
      { book: 5, prose: 1, source: "Aristotle, 'Physics,' II. v. 5." },
    ]);
  });
});

describe('consolationPages', () => {
  const pages = consolationPages(html, 'The Consolation of Philosophy');

  it('makes a page of each song and prose section, cited by book and metre or prose', () => {
    expect(pages.map((p) => `${ p.printedPageNumber } [${ p.citationParts.map((c) => `${ c.type } ${ c.value }`).join(', ') }]`)).toEqual([
      'Book I, Song I [book 1, metre 1]',
      'Book I, Prose I [book 1, prose 1]',
      'Book II, Prose I [book 2, prose 1]',
      'Book II, Song I [book 2, metre 1]',
    ]);
  });

  it('keeps a poem line by line, and leaves out the contents, preface, epilogue and licence', () => {
    expect(pages[0]!.blocks.map((b) => b.html)).toContain(
      '<p>Who wrought my studious numbers<br/>Smoothly once in happier days,</p>'
    );
    const all = pages.flatMap((p) => p.blocks).map((b) => b.html).join(' ');
    expect(all).not.toMatch(/preface|cruel death|LICENSE|SORROWS/);
  });

  it("puts each footnote, and each quotation's source, on the page they're about", () => {
    const notes = (i: number) => pages[i]!.blocks.filter((b) => b.label === 'Footnote').map((b) => b.html);

    expect(pages[1]!.blocks.find((b) => b.label === 'Text')!.html).toContain('θ,<sup>A</sup> and more');
    expect(notes(1)).toEqual(['<p><sup>A</sup> θ for the Theoretical life.</p>', "<p>Quoted: 'Iliad,' I. 363.</p>"]);
    expect(pages[3]!.blocks[2]!.html).toBe("<h3>Song I. Fortune's Malice.</h3>");
    expect(notes(3)).toEqual(['<p><sup>B</sup> A note on Fortune.</p>']);
  });
});
