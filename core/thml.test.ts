import { describe, expect, it } from '@jest/globals';
import { scripRefCitations } from './thml.ts';
import { bookName, osisBookNumber, printedBookNumber } from './bible.ts';

const source = { bookId: 'summa-theologiae', footnotePage: 13 };

const ref = (passage: string, parsed?: string, text = passage) => (
  `<scripRef passage="${ passage }" id="x"${ parsed ? ` parsed="${ parsed }"` : '' }>${ text }</scripRef>`
);

describe('scripRefCitations', () => {
  it('turns a scripRef into a Bible citation with book, chapter and verse locations', () => {
    expect(scripRefCitations(
      `"I am the way" (${ ref('Jn. 14:6', 'vul|John|14|6|0|0') }) Therefore...`, source
    )).toEqual([{
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
    }]);
  });

  it('expands verse ranges and gives several passages a group each', () => {
    const [range, several] = scripRefCitations(
      ref('2 Cor. 10:4,5', 'vul|2Cor|10|4|10|5')
        + ref('Lev. 4:3,23', 'vul|Lev|4|3|0|0;vul|Lev|4|23|0|0'),
      source,
    );

    expect([range!.location, range!.locationsCited]).toEqual(['10:4-5', [[
      { rawLabel: '2 Corinthians', type: 'book', values: [54] },
      { rawLabel: '10', type: 'chapter', values: [10] },
      { rawLabel: '4-5', type: 'verse', values: [4, 5] },
    ]]]);
    expect(several!.location).toBe('4:3; 4:23');
    expect(several!.locationsCited.map((g) => g.map((l) => l.values[0]))).toEqual([[3, 4, 3], [3, 4, 23]]);
  });

  it('cites a whole chapter without verses', () => {
    const [c] = scripRefCitations(ref('Ps. 118', 'vul|Ps|118|0|0|0'), source);
    expect([c!.title, c!.location, c!.locationsCited[0]!.map((l) => l.type)])
      .toEqual(['Psalms', '118', ['book', 'chapter']]);
  });

  it('uses the Douay names and numbering', () => {
    const titles = scripRefCitations(
      ref('1 Kings 16:7', 'vul|1Kgs|16|7|0|0') + ref('Osee 13:9', 'vul|Hos|13|9|0|0')
        + ref('Apoc. 1:5', 'vul|Rev|1|5|0|0'),
      source,
    ).map((c) => [c.title, c.locationsCited[0]![0]!.values[0]]);

    expect(titles).toEqual([['1 Kings', 9], ['Osee', 33], ['Apocalypse', 73]]);
  });

  it('reads the passage text when there is no parsed form', () => {
    const [c] = scripRefCitations(ref('3 Kings 10:4,5'), source);
    expect([c!.title, c!.location, c!.locationsCited[0]![0]!.values]).toEqual(['3 Kings', '10:4-5', [11]]);
  });

  it('leaves out scripRefs that are not scripture, without using up a footnote number', () => {
    const citations = scripRefCitations(
      ref('Ep. 137') + ref('Rom. 1:20', 'vul|Rom|1|20|0|0') + ref('3 Esdras 4:36')
        + ref('Heb. 11:6', 'vul|Heb|11|6|0|0'),
      source,
    );
    expect(citations.map((c) => [c.source.footnoteIdentifier, c.title]))
      .toEqual([['1', 'Romans'], ['2', 'Hebrews']]);
  });

  it('numbers footnotes from firstIdentifier, so a page can be numbered across calls', () => {
    const citations = scripRefCitations(ref('Rom. 1:20', 'vul|Rom|1|20|0|0'), source, 7);
    expect(citations[0]!.source.footnoteIdentifier).toBe('7');
  });

  it('keeps the text as printed in raw', () => {
    const [c] = scripRefCitations(ref('Ps. 52:1', 'vul|Ps|52|1|0|0', '<i>Ps.</i>  52:1'), source);
    expect(c!.raw).toBe('Ps. 52:1');
  });

  it('finds nothing in ThML without scripRefs', () => {
    expect(scripRefCitations('<p><b>Objection 1:</b> It seems...</p>', source)).toEqual([]);
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
