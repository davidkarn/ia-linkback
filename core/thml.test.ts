import { describe, expect, it } from '@jest/globals';
import { scripRefCitations, workReference, workReferences } from './thml.ts';
import { bookName, osisBookNumber, printedBookNumber } from './bible.ts';

const source = { bookId: 'summa-theologiae', footnotePage: 13 };

const ref = (passage: string, parsed?: string, text = passage) => (
  `<scripRef passage="${ passage }" id="x"${ parsed ? ` parsed="${ parsed }"` : '' }>${ text }</scripRef>`
);

const work = (text: string) => workReferences(text).map((w) => [w.author, w.title, w.location]);

describe('scripRefCitations: scripture', () => {
  it('turns a scripRef into a Bible citation, numbered after the parenthesis', () => {
    const { html, footnotes } = scripRefCitations(
      `<p>"the way" (${ ref('Jn. 14:6', 'vul|John|14|6|0|0') }) Therefore</p>`, source
    );

    expect(html).toBe(`<p>"the way" (${ ref('Jn. 14:6', 'vul|John|14|6|0|0') })<sup>1</sup> Therefore</p>`);
    expect(footnotes).toEqual([{
      identifier: '1',
      kind:       'scripture',
      raw:        'Jn. 14:6',
      citations:  [{
        source:          { bookId: 'summa-theologiae', footnoteIdentifier: '1', footnotePage: 13 },
        referenceBookId: null,
        author:          'Bible',
        title:           'John',
        location:        '14:6',
        raw:             'Jn. 14:6',
        locationsCited:  [[
          { rawLabel: 'John', type: 'book', values: [50] },
          { rawLabel: '14', type: 'chapter', values: [14] },
          { rawLabel: '6', type: 'verse', values: [6] },
        ]],
      }],
    }]);
  });

  it('puts the number right after a scripRef that shares its parenthesis', () => {
    const { html } = scripRefCitations(
      `(${ ref('Jn. 14:6', 'vul|John|14|6|0|0') }; ${ ref('Rom. 1:20', 'vul|Rom|1|20|0|0') })`, source
    );
    expect(html.replace(/<scripRef[^>]*>|<\/scripRef>/g, '')).toBe('(Jn. 14:6<sup>1</sup>; Rom. 1:20<sup>2</sup>)');
  });

  it('expands verse ranges and gives several passages a group each', () => {
    const [range, several] = scripRefCitations(
      ref('2 Cor. 10:4,5', 'vul|2Cor|10|4|10|5')
        + ref('Lev. 4:3,23', 'vul|Lev|4|3|0|0;vul|Lev|4|23|0|0'),
      source,
    ).footnotes.map((f) => f.citations[0]!);

    expect([range!.location, range!.locationsCited[0]![2]]).toEqual(['10:4-5', {
      rawLabel: '4-5', type: 'verse', values: [4, 5],
    }]);
    expect(several!.location).toBe('4:3; 4:23');
    expect(several!.locationsCited.length).toBe(2);
  });

  it('uses the Douay names and numbering, and reads text-only passages', () => {
    const titles = scripRefCitations(
      ref('1 Kings 16:7', 'vul|1Kgs|16|7|0|0') + ref('Apoc. 1:5', 'vul|Rev|1|5|0|0') + ref('3 Kings 10:4,5'),
      source,
    ).footnotes.map((f) => [f.citations[0]!.title, f.citations[0]!.locationsCited[0]![0]!.values[0]]);

    expect(titles).toEqual([['1 Kings', 9], ['Apocalypse', 73], ['3 Kings', 11]]);
  });

  it('recognizes untagged scripture in parentheses', () => {
    const { footnotes } = scripRefCitations('<p>as it is written (Ps. 118)</p>', source);
    expect(footnotes.map((f) => [f.kind, f.citations[0]!.title, f.citations[0]!.location]))
      .toEqual([['scripture', 'Psalms', '118']]);
  });

  it('leaves out scripRefs that are not scripture, without using up a number', () => {
    const { footnotes } = scripRefCitations(
      ref('Ep. 137') + ref('Rom. 1:20', 'vul|Rom|1|20|0|0') + ref('3 Esdras 4:36'), source
    );
    expect(footnotes.map((f) => [f.identifier, f.citations[0]!.title])).toEqual([['1', 'Romans']]);
  });
});

describe('scripRefCitations: other works', () => {
  it('marks citations of other works in parentheses, with the author named before them', () => {
    const { html, footnotes } = scripRefCitations(
      '<p>Dionysius says (Coel. Hier. xii) that ... and Tertullian (Apol. XVI.) says</p>', source
    );

    expect(html).toBe('<p>Dionysius says (Coel. Hier. xii)<sup>1</sup> that ... '
      + 'and Tertullian (Apol. XVI.)<sup>2</sup> says</p>');
    expect(footnotes.map((f) => [f.identifier, f.kind, f.raw])).toEqual([
      ['1', 'work', 'Coel. Hier. xii'],
      ['2', 'work', 'Apol. XVI.'],
    ]);
    expect(footnotes.map((f) => {
      const c = f.citations[0]!;
      return [c.author, c.title, c.location, c.source.footnoteIdentifier];
    })).toEqual([
      ['Dionysius', 'Coel. Hier.', 'xii', '1'],
      ['Tertullian', 'Apol.', 'XVI', '2'],
    ]);
  });

  it('numbers scripture and works together in the order they appear, from firstIdentifier', () => {
    const { footnotes } = scripRefCitations(
      `Augustine (De Trin. i, 1) and (${ ref('Rom. 1:20', 'vul|Rom|1|20|0|0') })`, source, 5
    );
    expect(footnotes.map((f) => [f.identifier, f.kind])).toEqual([['5', 'work'], ['6', 'scripture']]);
  });

  it('gives a parenthesis citing several works one footnote with a citation for each', () => {
    const { footnotes } = scripRefCitations('the Philosopher (Metaph. xii, text. 51; De Anima iii)', source);
    expect(footnotes.length).toBe(1);
    expect(footnotes[0]!.citations.map((c) => [c.author, c.title, c.location])).toEqual([
      ['Philosopher', 'Metaph.', 'xii, text. 51'],
      ['Philosopher', 'De Anima', 'iii'],
    ]);
  });

  it('leaves the text unchanged apart from the numbers', () => {
    const text                = '<p>As Augustine says (De Civ. Dei x, 3), and (1) (i.e., the prophets) (Q[70], A[1]).</p>';
    const { html, footnotes } = scripRefCitations(text, source);
    expect(html.replace(/<sup>\d+<\/sup>/g, '')).toBe(text);
    expect(footnotes.map((f) => f.citations[0]!.author)).toEqual(['Augustine']);
  });
});

describe('scripRefCitations: notes', () => {
  const note = (n: string, text: string) => (
    `<note place="end" n="${ n }" id="x${ n }"><p class="endnote" id="y${ n }">${ text }</p></note>`
  );

  it('replaces each note with its number and makes it a footnote with its plain text', () => {
    const { html, footnotes } = scripRefCitations(
      `<p>his high career,${ note('6', ' Ep. LXXXI.') } and of the latter${ note('7', ' Relig. Hist. 1214.') }.</p>`,
      source,
    );

    expect(html).toBe('<p>his high career,<sup>1</sup> and of the latter<sup>2</sup>.</p>');
    expect(footnotes.map((f) => [f.identifier, f.kind, f.raw])).toEqual([
      ['1', 'note', 'Ep. LXXXI.'],
      ['2', 'note', 'Relig. Hist. 1214.'],
    ]);
  });

  it("gives a note the citations in it, under the note's number", () => {
    const { footnotes } = scripRefCitations(
      'text' + note('3', ` See ${ ref('Rom. 1:20', 'vul|Rom|1|20|0|0') } and (De Trin. i, 1).`)
        + ' more' + note('4', ' cf. Ecc. Hist. v. 19. p. 146.') + note('5', ' The best account.'),
      source,
    );

    expect(footnotes.map((f) => [f.identifier, f.citations.map((c) => (
      [c.author, c.title, c.location, c.source.footnoteIdentifier]
    ))])).toEqual([
      ['1', [['Bible', 'Romans', '1:20', '1'], ['', 'De Trin.', 'i, 1', '1']]],
      ['2', [['', 'Ecc. Hist.', 'v. 19. p. 146', '2']]],
      ['3', []],
    ]);
  });

  it("numbers notes with the text's citations in reading order, and doesn't mark what is inside a note", () => {
    const { html, footnotes } = scripRefCitations(
      `Augustine (De Trin. i, 1)${ note('9', ` ${ ref('Ps. 118', 'vul|Ps|118|0|0|0') }`) } and `
        + `(${ ref('Jn. 14:6', 'vul|John|14|6|0|0') }).`,
      source,
    );

    expect(footnotes.map((f) => [f.identifier, f.kind])).toEqual([['1', 'work'], ['2', 'note'], ['3', 'scripture']]);
    expect(html.replace(/<scripRef[^>]*>|<\/scripRef>/g, ''))
      .toBe('Augustine (De Trin. i, 1)<sup>1</sup><sup>2</sup> and (Jn. 14:6)<sup>3</sup>.');
  });
});

describe('workReference(s)', () => {
  it('splits a citation into title and location', () => {
    expect(work('De Fide Orth. i, 1,3')).toEqual([['', 'De Fide Orth.', 'i, 1,3']]);
    expect(work('Gen. ad lit. xii, 6,7')).toEqual([['', 'Gen. ad lit.', 'xii, 6,7']]);
    expect(work('De Civ. Dei x, 3')).toEqual([['', 'De Civ. Dei', 'x, 3']]);
    expect(work('1 Poster. iii')).toEqual([['', '1 Poster.', 'iii']]);
    expect(work('Hil. de Syn. p. 133')).toEqual([['', 'Hil. de Syn.', 'p. 133']]);
    expect(work('C. Ar. ii. 22')).toEqual([['', 'C. Ar.', 'ii. 22']]);
    expect(work('Relig. Hist. 1214.')).toEqual([['', 'Relig. Hist.', '1214']]);
  });

  it('reads an author named in the parenthesis', () => {
    expect(work('Dionysius, De Div. Nom. iv')).toEqual([['Dionysius', 'De Div. Nom.', 'iv']]);
    expect(work('Neale, i. 61')).toEqual([['Neale', '', 'i. 61']]);
    expect(work('Stromata, lib. i. c. 21')).toEqual([['', 'Stromata', 'lib. i. c. 21']]);
  });

  it('carries a work over to a following location', () => {
    expect(work('De Trin. vi, 10; vii, 3')).toEqual([['', 'De Trin.', 'vi, 10'], ['', 'De Trin.', 'vii, 3']]);
  });

  it('is nothing for parentheses that are not citations', () => {
    for (const text of ['1', 'B', 'i.e., the prophets', 'for instance', 'Q[70], A[1]', 'FOUR ARTICLES',
                        'Orthodox', 'Chapter LXIV', 'May 20–Aug. 25', 'Of these there are 3', 'Rome, 1742',
                        'B C D I S V W X Y Z 1 2 4 5 6']) {
      expect(workReference(text)).toBeNull();
    }
  });
});

describe('bible book lookups', () => {
  it('maps OSIS codes, including the Vulgate ones, to Douay book numbers', () => {
    expect([osisBookNumber('Gen'), osisBookNumber('2Kgdms'), osisBookNumber('1Esd'), osisBookNumber('Sir')])
      .toEqual([1, 10, 15, 26]);
    expect(osisBookNumber('Nope')).toBeNull();
  });

  it('reads printed book names and abbreviations', () => {
    expect([printedBookNumber('4 Kings'), printedBookNumber('Ecclus.'), printedBookNumber('1 Cor'),
            printedBookNumber('Luc')]).toEqual([12, 26, 53, 49]);
    expect(printedBookNumber('Ep')).toBeNull();
  });

  it('names books for display', () => {
    expect([bookName(1), bookName(9), bookName(73)]).toEqual(['Genesis', '1 Kings', 'Apocalypse']);
  });
});
