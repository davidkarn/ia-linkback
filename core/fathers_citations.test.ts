import { describe, expect, it } from '@jest/globals';
import {
  citedFatherWork, divisionTypes, isOnSomePage, parseFatherLocation, placeOnPage,
} from './fathers_citations.ts';

const work         = (author: string, title: string, location = '') => (
  citedFatherWork(author, title, location)?.bookId
);
const show         = (places: { type: string, value: number }[][]) => (
  places.map((parts) => parts.map((p) => `${ p.type } ${ p.value }`).join(', '))
);
const BOOK_CHAPTER = ['book', 'chapter'];

describe('citedFatherWork', () => {
  it('knows the works by their Latin titles, abbreviated or not', () => {
    expect(work('Augustine', 'De Civ. Dei')).toBe('npnf102-city-of-god');
    expect(work('Augustine', 'De Civit. Dei')).toBe('npnf102-city-of-god');
    expect(work('Augustine', 'City of God')).toBe('npnf102-city-of-god');
    expect(work('Augustine', 'De Trin.')).toBe('npnf103-on-the-holy-trinity');
    expect(work('Augustine', 'De Moribus Eccl.')).toBe('npnf104-on-the-morals-of-the-catholic-church');
    expect(work('Damascene', 'De Fide Orth.')).toBe('npnf209-an-exact-exposition-of-the-orthodox-faith');
    expect(work('John Damascene', 'De Fide Orth')).toBe('npnf209-an-exact-exposition-of-the-orthodox-faith');
  });

  it('tells works that start alike apart', () => {
    expect(work('Augustine', 'De Fide et Symbolo')).toBe('npnf103-a-treatise-on-faith-and-the-creed');
    expect(work('Augustine', 'De Symb.')).toBe('npnf103-on-the-creed');
    expect(work('Augustine', 'Contra Mend.')).toBe('npnf103-against-lying');
    expect(work('Augustine', 'De Mendacio')).toBe('npnf103-on-lying');
  });

  it("reads a bare \"Tract.\" as on John's Gospel only when its location names John", () => {
    expect(work('Augustine', 'Tract.', 'cv in Joan')).toBe(
      'npnf107-lectures-or-tractates-on-the-gospel-according-to-st-john'
    );
    expect(work('Augustine', 'Tract.', 'li')).toBeUndefined();
    expect(work('Augustine', 'Tract.', 'ix in Ep. i Joan')).toBe(
      'npnf107-ten-homilies-on-the-first-epistle-of-john'
    );
    for (const title of ['Tract. in Joan.', 'Super Joan., Tract.', 'In Joan. Tract.', 'Tract. in Ioa']) {
      expect(work('Augustine', title, 'xxvi')).toBe(
        'npnf107-lectures-or-tractates-on-the-gospel-according-to-st-john'
      );
    }
    expect(work('Augustine', 'In prim. canon. Joan. Tract.', 'iv')).toBe(
      'npnf107-ten-homilies-on-the-first-epistle-of-john'
    );
  });

  it('takes letters by any "Ep." title', () => {
    expect(work('Augustine', 'Ep.')).toBe('npnf101-letters-of-st-augustin');
    expect(work('Augustine', 'Ep. ad Volusianum')).toBe('npnf101-letters-of-st-augustin');
    expect(work('Augustine', 'Epist')).toBe('npnf101-letters-of-st-augustin');
  });

  it('leaves other authors, and works not in the volumes, alone', () => {
    expect(work('Augustinis', 'De Re Sacramentaria')).toBeUndefined();
    expect(work('Pseudo-Augustine', 'De Trin.')).toBeUndefined();
    expect(work('Hilary', 'De Trin.')).toBeUndefined();
    expect(work('Augustine', 'Gen. ad lit.')).toBeUndefined();
  });
});

describe('parseFatherLocation', () => {
  it('reads numbers in order, one per division', () => {
    expect(show(parseFatherLocation('xiv, 9', BOOK_CHAPTER))).toEqual(['book 14, chapter 9']);
    expect(show(parseFatherLocation('IV. 10', BOOK_CHAPTER))).toEqual(['book 4, chapter 10']);
    expect(show(parseFatherLocation('xxi', BOOK_CHAPTER))).toEqual(['book 21']);
    expect(show(parseFatherLocation('cxv', ['chapter']))).toEqual(['chapter 115']);
  });

  it('puts labelled numbers in their place', () => {
    expect(show(parseFatherLocation('XI, c. 9', BOOK_CHAPTER))).toEqual(['book 11, chapter 9']);
    expect(show(parseFatherLocation('lib. xv. cap. 16', BOOK_CHAPTER))).toEqual(['book 15, chapter 16']);
    expect(show(parseFatherLocation('xi, chap. 9', BOOK_CHAPTER))).toEqual(['book 11, chapter 9']);
  });

  it('makes a place of each number of a list at the last division', () => {
    expect(show(parseFatherLocation('i, 3,4', BOOK_CHAPTER))).toEqual([
      'book 1, chapter 3', 'book 1, chapter 4',
    ]);
    expect(show(parseFatherLocation('ii, 4-6', BOOK_CHAPTER))).toEqual([
      'book 2, chapter 4', 'book 2, chapter 5', 'book 2, chapter 6',
    ]);
  });

  it('stops at the text going on, and at numbers past the divisions', () => {
    expect(show(parseFatherLocation('cv in Joan', ['chapter']))).toEqual(['chapter 105']);
    expect(show(parseFatherLocation('cxxvii, ad Arment. et Paulin', ['chapter']))).toEqual(['chapter 127']);
    expect(show(parseFatherLocation('50, n. 3', ['chapter', 'part']))).toEqual(['chapter 50']);
    expect(show(parseFatherLocation('36, c. 14, n. 32', ['chapter']))).toEqual(['chapter 36']);
    expect(show(parseFatherLocation('i, 10', ['book']))).toEqual(['book 1']);
    expect(show(parseFatherLocation(
      'I, c. 12, n. 35 (Migne, P. L., XXXIV, 1247', BOOK_CHAPTER
    ))).toEqual(['book 1, chapter 12']);
  });

  it('is empty without a leading number', () => {
    expect(parseFatherLocation('', BOOK_CHAPTER)).toEqual([]);
    expect(parseFatherLocation('Prolog.', BOOK_CHAPTER)).toEqual([]);
    expect(parseFatherLocation('c. 9', BOOK_CHAPTER)).toEqual([]);
  });
});

describe('divisionTypes and isOnSomePage', () => {
  const rows = [
    { parts: [{ type: 'book', value: 1 }] },
    { parts: [{ type: 'book', value: 1 }, { type: 'chapter', value: 2 }] },
  ];

  it("takes the types of the work's most divided rows", () => {
    expect(divisionTypes(rows)).toEqual(['book', 'chapter']);
    expect(divisionTypes([])).toEqual([]);
  });

  it('finds a place on the page of a row it starts with', () => {
    expect(isOnSomePage([{ type: 'book', value: 1 }, { type: 'chapter', value: 9 }], rows)).toBe(true);
    expect(isOnSomePage([{ type: 'book', value: 2 }], rows)).toBe(false);
  });
});

describe('placeOnPage', () => {
  const part = (type: string, value: number) => ({ type, value });
  const rows = [
    { parts: [part('book', 1), part('chapter', 1)] },
    { parts: [part('book', 1), part('chapter', 2)] },
    { parts: [part('book', 2), part('chapter', 1)] },
  ];

  it('keeps a place that is on a page', () => {
    expect(placeOnPage([part('book', 1), part('chapter', 2)], rows))
      .toEqual([part('book', 1), part('chapter', 2)]);
  });

  it('takes a division no page is cited by alone to the first page under it', () => {
    expect(placeOnPage([part('book', 2)], rows)).toEqual([part('book', 2), part('chapter', 1)]);
  });

  it('is undefined with no page under it', () => {
    expect(placeOnPage([part('book', 3)], rows)).toBeUndefined();
    expect(placeOnPage([part('book', 1), part('chapter', 9)], rows)).toBeUndefined();
  });
});
