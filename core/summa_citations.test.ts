import { describe, expect, it } from '@jest/globals';
import { isIbid, isSummaCitation, lastPlace, parseSummaCitation } from './summa_citations.ts';

const places = (raw: string, previous?: { book: number, question: number }) => (
  parseSummaCitation(raw, previous).map((g) => g.map((p) => `${ p.type } ${ p.value }`).join(', '))
);

describe('isSummaCitation', () => {
  it('is the Summa Theologica by Thomas Aquinas', () => {
    expect(isSummaCitation('Summa Theologica', 'St. Thomas Aquinas')).toBe(true);
    expect(isSummaCitation('Summa Theo- logica', 'Thomas')).toBe(true);
    expect(isSummaCitation('Summa Theol.', 'Aquinas')).toBe(true);
  });

  it('is not another Summa, or another author', () => {
    expect(isSummaCitation('Summa Contra Gentiles', 'Aquinas')).toBe(false);
    expect(isSummaCitation('Summa Theologica', 'Alexander of Hales')).toBe(false);
  });
});

describe('parseSummaCitation', () => {
  it('reads labelled locations', () => {
    expect(places('St. Thomas, Summa Theol., 2a 2ae, qu. 186, art. 7.'))
      .toEqual(['book 3, question 186, article 7']);
    expect(places('S. Theol., 1a, qu. 3, art. 7.')).toEqual(['book 1, question 3, article 7']);
    expect(places('Summa Theol., Supplement., qu. 95, art. 2.')).toEqual(['book 5, question 95, article 2']);
    expect(places('Summa Theologica, 12–2ae: C: 7, ad 1.'))
      .toEqual(['book 2, question 100, article 7, ad 1']);
  });

  it('reads bare and Roman numbers', () => {
    expect(places('Sum. theol., ii-ii, 184, 3.')).toEqual(['book 3, question 184, article 3']);
    expect(places('Summa Theologica, 1a: XLIX: 2.')).toEqual(['book 1, question 49, article 2']);
    expect(places('Summa Theologica, 3a: III: 5.')).toEqual(['book 4, question 3, article 5']);
  });

  it('reads OCR misreadings of the parts', () => {
    expect(places('Summa Theologica, 12-2ac: XLIX: 3.')).toEqual(['book 2, question 49, article 3']);
    expect(places('Summa Theologica, 2a-2ac: LXX: 2.')).toEqual(['book 3, question 70, article 2']);
    expect(places('Summa Theologica, ia zae, q. 5, a. 1')).toEqual(['book 2, question 5, article 1']);
    expect(places('Summa Theologica, 12: VII: 1. I Contra Gentes 69'))
      .toEqual(['book 1, question 7, article 1']);
  });

  it('reads parts written as numbers right after the title', () => {
    expect(places('Sum. theol., 1, 86, 3.')).toEqual(['book 1, question 86, article 3']);
    expect(places('Sum theol., 1, 13, 12. Cp. Sum. theol., 111, 16, 1, et ad. 1')).toEqual([
      'book 1, question 13, article 12',
      'book 4, question 16, article 1',
    ]);
  });

  it('reads the first question of a range', () => {
    expect(places('Sum. theol., ii-ii, 179-80.')).toEqual(['book 3, question 179']);
  });

  it('gives each place and each question its own group', () => {
    expect(places('Summa Theol., 1a, qu. 2, art. 3; 2a 2ae, qu. 23, art. 1.')).toEqual([
      'book 1, question 2, article 3',
      'book 3, question 23, article 1',
    ]);
    expect(places('Ibid., 1a–2a: LXXII: 1, 3. LXXV: 3.')).toEqual([
      'book 2, question 72, article 1',
      'book 2, question 75, article 3',
    ]);
  });

  it('takes the part, and question, of an Ibid. from the citation before it', () => {
    expect(places('Ibid., q. 90, a. 1.', { book: 2, question: 3 })).toEqual(['book 2, question 90, article 1']);
    expect(places('Ibid. a. 6', { book: 2, question: 3 })).toEqual(['book 2, question 3, article 6']);
    expect(places('Ibid., 2a–2a: CLXXX: 6.', { book: 1, question: 3 }))
      .toEqual(['book 3, question 180, article 6']);
    expect(places('Ibid., q. 90, a. 1.')).toEqual([]);
  });

  it('is nothing without a question', () => {
    expect(places('Summa Theologica, 1a')).toEqual([]);
    expect(places('Ibid.')).toEqual([]);
  });
});

describe('isIbid and lastPlace', () => {
  it('recognizes Ibid. and finds the last place cited', () => {
    expect([isIbid('Ibid., q. 2'), isIbid('Summa Theol., 1a, q. 2')]).toEqual([true, false]);
    expect(lastPlace(parseSummaCitation('Summa Theol., 1a, qu. 2; 3a, qu. 5, art. 1.')))
      .toEqual({ book: 4, question: 5 });
  });
});

describe('parseSummaCitation: more OCR', () => {
  it('reads "38" before a question as "3a", and "2ae-2a" as II-II', () => {
    expect(places('S. Theol., 38, qu. 12, art. 2, ad 1.')).toEqual(['book 4, question 12, article 2, ad 1']);
    expect(places('Ibid., 2ae–2a: CLXXX: 6.')).toEqual(['book 3, question 180, article 6']);
  });

  it('does not take a reply followed by a quotation for another question', () => {
    expect(places("Sum. theol., ii-ii, 26, 3 ad. 3: 'How")).toEqual(['book 3, question 26, article 3, ad 3']);
  });
});

describe('parseSummaCitation: numbers misread for parts before "qu."', () => {
  it('reads "12", "18", "1am" as 1a, "32" as 3a, and "Ilae" as IIae', () => {
    expect(places('St. Thomas, S. Theol., 18, qu. 43, art. 3, ad 3')).toEqual(['book 1, question 43, article 3, ad 3']);
    expect(places('S. Theol., 12, qu. 36, art. 2.')).toEqual(['book 1, question 36, article 2']);
    expect(places('St. Thomas, S. Theol., 32, qu. 25, art. 1.')).toEqual(['book 4, question 25, article 1']);
    expect(places('St. Thomas, Summa Theologica, Ia Ilae, q. 109, a. 6.')).toEqual(['book 2, question 109, article 6']);
    expect(places('Summa, Ila Ilae, q. 17, a. 4, 5.')).toEqual(['book 3, question 17, article 4']);
  });
});

describe('parseSummaCitation: Arabic two-part forms', () => {
  it('reads "1-2ae" and "2-2ae"', () => {
    expect(places('S. Theol., 1-2ae, qu. 17, art. 1, ad 3')).toEqual(['book 2, question 17, article 1, ad 3']);
    expect(places('Cfr. S. Theol., 2-2ae, qu. 81, art. 8')).toEqual(['book 3, question 81, article 8']);
    expect(places('S. Theol., 18. qu. 12, art. 12.')).toEqual(['book 1, question 12, article 12']);
  });
});

describe('parseSummaCitation: part boundaries', () => {
  it('reads "iii." as the Third Part, not "i" and "ii"', () => {
    expect(places('—Summa Theol., iii., q. 76, art. 1, ad. 3.')).toEqual(['book 4, question 76, article 1, ad 3']);
  });

  it('does not join an article number to the part after it', () => {
    expect(places('Summa Theologica, 1a: XIII: 12. 2a-2ae: 1: 2.')).toEqual([
      'book 1, question 13, article 12',
      'book 3, question 1, article 2',
    ]);
  });
});
