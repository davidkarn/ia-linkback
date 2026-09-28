import { describe, expect, it } from '@jest/globals';
import { authorOf, divisionOf, findWorks, numberOf, volumeWorks, workBookId } from './fathers_thml.ts';
import { parseDivs } from './summa_thml.ts';

const div  = (level: number, id: string, title: string, inner: string, short = title) => (
  `<div${ level } id="${ id }" shorttitle="${ short }" title="${ title }">${ inner }</div${ level }>`
);
const note = (text: string) => `<note place="end" n="9"><p class="endnote">${ text }</p></note>`;

// A volume shaped like ../thml/anf01.xml: an author holding works, one divided into books
const THML = `<ThML><ThML.head><title>not text</title></ThML.head><ThML.body>
${ div(1, 'i', 'Title Page', '<p>ANTE-NICENE FATHERS</p>') }
${ div(1, 'ii', 'CLEMENT OF ROME', [
    div(2, 'ii.i', 'Introductory Note to the First Epistle', '<p>By the editor.</p>'),
    div(2, 'ii.ii', 'First Epistle to the Corinthians', [
      div(3, 'ii.ii.i', 'Chapter I.—The salutation.',
          '<h3>Chapter I.—The salutation.</h3><p id="p1"><index subject1="x" />The church'
          + `${ note('Or, “sojourning.”') } of God (<scripRef passage="Rom. 1:20" parsed="vul|Rom|1|20|0|0">`
          + 'Rom. 1:20</scripRef>).</p>', 'Chapter I.—The salutation...'),
      div(3, 'ii.ii.ii', 'Chapter II.—Praise of the Corinthians.', '<p>Moreover, ye were all.</p>',
          'Chapter II'),
      div(3, 'ii.ii.iii', 'Elucidations', '<p>An editor note.</p>'),
    ].join('')),
  ].join('')) }
${ div(1, 'iii', 'IRENÆUS', [
    div(2, 'iii.i', 'Against Heresies: Book I', div(3, 'iii.i.i', 'Chapter I', '<p>One.</p>')),
    div(2, 'iii.ii', 'Against Heresies: Book II', [
      '<p>Preface to the second book.</p>',
      div(3, 'iii.ii.i', 'Absurdity of the doctrine.', '<p>Two.</p>', 'Chapter I'),
    ].join('')),
    div(2, 'iii.iii', 'Fragments', '<verse><l>A line,</l><l>another.</l></verse>'),
  ].join('')) }
${ div(1, 'iv', 'Indexes', div(2, 'iv.i', 'Index of Scripture References', '<p>Genesis</p>')) }
</ThML.body></ThML>`;

const works = volumeWorks('anf01', THML);
const work  = (id: string) => works.find((w) => w.id === id)!;

describe('divisionOf and numberOf', () => {
  it('reads numbered divisions from contents labels and titles', () => {
    const d = (shortTitle: string, title = shortTitle) => divisionOf({ shortTitle, title });
    expect(d('Chapter V.—No less evils...')).toEqual({ label: 'Chapter V', type: 'chapter', value: 5 });
    expect(d('Book I')).toEqual({ label: 'Book I', type: 'book', value: 1 });
    expect(d('Book First')).toEqual({ label: 'Book First', type: 'book', value: 1 });
    expect(d('Homily 12')).toEqual({ label: 'Homily 12', type: 'chapter', value: 12 });
    expect(d('II')).toEqual({ label: 'II', type: null, value: 2 });
    expect(d('Elucidations')).toBeNull();
    expect(d('Letter to a Young Widow.')).toBeNull();
  });

  it('reads Roman, Arabic and ordinal numbers', () => {
    expect([numberOf('xliv'), numberOf('12'), numberOf('Third'), numberOf('Ep')]).toEqual([44, 12, 3, null]);
  });
});

describe('findWorks', () => {
  it('finds works by their shape, leaving out front matter and indexes', () => {
    const found = findWorks(parseDivs(THML.slice(THML.indexOf('<ThML.body'))));
    expect(found.map((f) => [f.div.title, f.within])).toEqual([
      ['First Epistle to the Corinthians', ['CLEMENT OF ROME']],
      ['Against Heresies', ['IRENÆUS']],
      ['Fragments', ['IRENÆUS']],
    ]);
  });
});

describe('volumeWorks', () => {
  it('makes a book of each work, with its author', () => {
    expect(works.map((w) => [w.id, w.title, w.author, w.url])).toEqual([
      ['anf01-first-epistle-to-the-corinthians', 'First Epistle to the Corinthians', 'Clement of Rome',
       'https://www.ccel.org/ccel/schaff/anf01.ii.ii.html'],
      ['anf01-against-heresies', 'Against Heresies', 'Irenaeus', 'https://www.ccel.org/ccel/schaff/anf01.iii.i.html'],
      ['anf01-fragments', 'Fragments', 'Irenaeus', 'https://www.ccel.org/ccel/schaff/anf01.iii.iii.html'],
    ]);
  });

  it('makes a page per chapter, labelled and cited by its divisions', () => {
    expect(work('anf01-first-epistle-to-the-corinthians').pages.map((p) => (
      [p.pageNumber, p.printedPageNumber, p.citationParts.map((c) => `${ c.type } ${ c.value }`)]
    ))).toEqual([[1, 'Chapter I', ['chapter 1']], [2, 'Chapter II', ['chapter 2']]]);
  });

  it('joins the books of a work, with the text before a book\'s chapters on a page of its own', () => {
    expect(work('anf01-against-heresies').pages.map((p) => [p.printedPageNumber, p.citationParts])).toEqual([
      ['Book I, Chapter I', [{ type: 'book', value: 1 }, { type: 'chapter', value: 1 }]],
      ['Book II', [{ type: 'book', value: 2 }]],
      ['Book II, Chapter I', [{ type: 'book', value: 2 }, { type: 'chapter', value: 1 }]],
    ]);
  });

  it('footnotes notes and scripture, dropping index marks and the repeated title', () => {
    const page = work('anf01-first-epistle-to-the-corinthians').pages[0]!;
    expect(page.blocks.map((b) => [b.label, b.html])).toEqual([
      ['PageHeader', '<p>First Epistle to the Corinthians</p>'],
      ['PageHeader', '<p>Chapter I</p>'],
      ['SectionHeader', '<h3>Chapter I.—The salutation.</h3>'],
      ['Text', '<p>The church<sup>1</sup> of God (Rom. 1:20)<sup>2</sup>.</p>'],
      ['Footnote', '<p><sup>1</sup> Or, “sojourning.”</p>'],
      ['Footnote', '<p><sup>2</sup> Rom. 1:20</p>'],
    ]);
    expect(page.blocks[5]!.citations.map((c) => [c.title, c.location, c.source])).toEqual([[
      'Romans', '1:20',
      { bookId: 'anf01-first-epistle-to-the-corinthians', footnoteIdentifier: '2', footnotePage: 1 },
    ]]);
  });

  it('keeps verse as lines, and a work without chapters as one page cited by nothing', () => {
    const fragments = work('anf01-fragments');
    expect(fragments.pages.map((p) => [p.citationParts, p.blocks.find((b) => b.label === 'Text')!.html]))
      .toEqual([[[], '<p>A line,<br />another.</p>']]);
  });
});

describe('workBookId and authorOf', () => {
  it('makes ids from the volume and title', () => {
    expect(workBookId('npnf102', 'City of God')).toBe('npnf102-city-of-god');
    expect(workBookId('anf01', 'Epistle to the Smyrnæans')).toBe('anf01-epistle-to-the-smyrn-ans');
  });

  it('finds authors by the work, then the divs it is in, then the volume', () => {
    const found = (title: string, within: string[] = []) => ({
      div: { level: 2, id: 'x', title, shortTitle: title, own: '', children: [] }, within,
    });
    expect(authorOf('anf01', found('Epistle to Polycarp', ['IGNATIUS']))).toBe('Ignatius of Antioch');
    expect(authorOf('anf01', found('The Martyrdom of Polycarp', ['POLYCARP']))).toBe('Church of Smyrna');
    expect(authorOf('npnf102', found('City of God'))).toBe('Augustine of Hippo');
    expect(authorOf('anf08', found('Pantænus, the Alexandrian Philosopher.', ['Remains']))).toBe('Pantaenus');
    expect(authorOf('nope', found('x'))).toBeNull();
  });
});
