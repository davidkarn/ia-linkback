import { describe, expect, it } from '@jest/globals';
import { douayBookNumber, douayPages, parseDouay, toVulgate, versesOf } from './douay_thml.ts';

const verse    = (book: string, chapter: number, n: number, text: string) => (
  `<scripture passage="${ book } ${ chapter }:${ n }" parsed="|${ book }|${ chapter }|${ n }|0|0" />\n<sup>${ n }</sup>${ text }\n`
);
const chapter  = (book: string, n: number, verses: string[]) => (
  `<div3 title="${ book } ${ n }" id="${ book }.${ n }"><h3>Chapter ${ n }</h3><p id="p">\n${
    verses.map((t, i) => verse(book, n, i + 1, t)).join('') }</p></div3>`
);
const numbered = (from: number, count: number) => Array.from({ length: count }, (_, i) => `v${ from + i }`);

// A small ThML document shaped like ../thml/douayr.xml
const THML = `<ThML><ThML.head></ThML.head><ThML.body>
<div1 title="Title Page" id="i"><h1>The Holy Bible</h1></div1>
<div1 title="Old Testament" id="OT">
<div2 title="Genesis" id="Gen"><h2>The Book of Genesis</h2><h4>So called from the <i>Generation</i>.</h4>
${ chapter('Gen', 1, ['In the beginning God created heaven, and earth.', 'And the earth was void.']) }
${ chapter('Gen', 2, ['So the heavens and the earth were finished.']) }
</div2>
<div2 title="1 Kings, alias 1 Samuel" id="iSam"><h2>The First Book of Samuel</h2>${ chapter('iSam', 1, ['There was a man']) }</div2>
<div2 title="Esther" id="Esth"><h2>The Book of Esther</h2>${ chapter('Esth', 10, ['a', 'b', 'c']) }</div2>
<div2 title="Ecclesiasticus" id="Sir"><h2>Ecclesiasticus</h2>
<div3 title="The Prologue" id="Sir.i"><h3>The Prologue</h3><p>${ verse('Sir', 0, 1, 'The knowledge of many') }</p></div3>
${ chapter('Sir', 1, ['All wisdom is from the Lord God']) }</div2>
<div2 title="Tobias" id="Tob"><h2>The Book of Tobias</h2>${ chapter('Tob', 1, ['Tobias of the tribe']) }</div2>
<div2 title="Daniel" id="Dan"><h2>The Book of Daniel</h2>
${ chapter('Dan', 3, numbered(1, 30)) }${ chapter('Dan', 4, numbered(1, 37)) }</div2>
<div2 title="Prayer of Azariah and the Song of the Three" id="PrAzar">${ chapter('PrAzar', 1, numbered(24, 67)) }</div2>
<div2 title="Additions to Esther" id="AddEsth">
<div3 title="Greek Esther 10" id="AddEsth.10"><p>${ verse('AddEsth', 10, 4, 'd') }${ verse('AddEsth', 10, 5, 'e') }</p></div3>
${ chapter('AddEsth', 11, ['The dream of Mardochai']) }</div2>
</div1>
<div1 title="New Testament" id="NT">
<div2 title="Apocalypse" id="Rev"><h2>The Apocalypse</h2>${ chapter('Rev', 22, ['And he showed me a river']) }</div2>
</div1>
</ThML.body></ThML>`;

const pages = douayPages(toVulgate(parseDouay(THML)));
const page  = (label: string) => pages.find((p) => p.printedPageNumber === label)!;
const texts = (label: string) => page(label).blocks.filter((b) => b.label === 'Text').map((b) => b.html);

describe('versesOf', () => {
  it('reads each marked verse with its number', () => {
    expect(versesOf(`<h3>Chapter 1</h3><p>${ verse('Gen', 1, 1, 'In the <i>beginning</i>.') }${
      verse('Gen', 1, 2, 'And the earth.') }</p>`)).toEqual([
      { number: 1, html: 'In the <i>beginning</i>.' },
      { number: 2, html: 'And the earth.' },
    ]);
  });
});

describe('douayPages', () => {
  it('makes a page per chapter, in the order of the Douay canon, cited by book and chapter', () => {
    expect(pages.map((p) => [p.pageNumber, p.printedPageNumber, p.citationParts.map((c) => `${ c.type } ${ c.value }`)]))
      .toEqual([
        [1, 'Genesis 1', ['book 1', 'chapter 1']],
        [2, 'Genesis 2', ['book 1', 'chapter 2']],
        [3, '1 Kings 1', ['book 9', 'chapter 1']],
        [4, 'Tobias 1', ['book 17', 'chapter 1']],
        [5, 'Esther 10', ['book 19', 'chapter 10']],
        [6, 'Esther 11', ['book 19', 'chapter 11']],
        [7, 'Ecclesiasticus, Prologue', ['book 26', 'chapter 0']],
        [8, 'Ecclesiasticus 1', ['book 26', 'chapter 1']],
        [9, 'Daniel 3', ['book 32', 'chapter 3']],
        [10, 'Daniel 4', ['book 32', 'chapter 4']],
        [11, 'Apocalypse 22', ['book 73', 'chapter 22']],
      ]);
  });

  it("heads a page with its testament and book, and puts the book's introduction before chapter 1", () => {
    expect(page('Genesis 1').blocks.map((b) => [b.label, b.html])).toEqual([
      ['PageHeader', '<p>Old Testament</p>'],
      ['PageHeader', '<p>The Book of Genesis</p>'],
      ['SectionHeader', '<h3>Genesis, Chapter 1</h3>'],
      ['Text', '<p><i>So called from the <i>Generation</i>.</i></p>'],
      ['Text', '<p><sup>1</sup> In the beginning God created heaven, and earth.</p>'],
      ['Text', '<p><sup>2</sup> And the earth was void.</p>'],
    ]);
    expect(texts('Genesis 2')).toEqual(['<p><sup>1</sup> So the heavens and the earth were finished.</p>']);
  });

  it('puts the Prayer of Azariah back in Daniel 3, numbered as in the Vulgate', () => {
    const verses = texts('Daniel 3').map((t) => t.match(/<sup>(\d+)<\/sup> (\S+)</)!.slice(1).join(' '));
    expect(verses.length).toBe(100);
    expect([verses[22], verses[23], verses[89], verses[90], verses[96], verses[97], verses[99]]).toEqual([
      '23 v23', '24 v24', '90 v90', '91 v24', '97 v30', '98 v1', '100 v3',
    ]);
    expect(texts('Daniel 4').slice(0, 1)).toEqual(['<p><sup>1</sup> v4</p>']);
    expect(texts('Daniel 4').length).toBe(34);
  });

  it('puts the additions to Esther back in Esther', () => {
    expect(texts('Esther 10').map((t) => t.replace(/<\/?p>/g, ''))).toEqual([
      '<sup>1</sup> a', '<sup>2</sup> b', '<sup>3</sup> c', '<sup>4</sup> d', '<sup>5</sup> e',
    ]);
    expect(pages.some((p) => /Azariah|Additions/.test(p.printedPageNumber))).toBe(false);
  });

  it('refuses a book that is not in the Douay canon', () => {
    expect(() => douayPages(parseDouay(THML.replace('title="Tobias"', 'title="Enoch"'))))
      .toThrow('not a book of the Douay canon: Tob "Enoch"');
  });
});

describe('douayBookNumber', () => {
  it('numbers books by their Douay names', () => {
    expect(['Genesis', '3 Kings', 'Canticle of Canticles', 'Josue', '1 Paralipomenon', 'Apocalypse']
      .map(douayBookNumber)).toEqual([1, 11, 24, 6, 13, 73]);
  });
});
