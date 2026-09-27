import { describe, expect, it } from '@jest/globals';
import { citedTitle, fold, keyNames, sameAuthor, sameTitle, skipCitation, volumeOf } from './citation_matching.ts';

describe('fold', () => {
  it('lowercases, strips accents and rejoins words broken at a line end', () => {
    expect(fold('Théologie')).toBe('theologie');
    expect(fold('Knowabil- ity')).toBe('knowability');
  });
});

describe('citedTitle', () => {
  it('drops edition, volume and page suffixes', () => {
    expect(citedTitle('Christian Philosophy: God, 2nd ed')).toBe('Christian Philosophy: God');
    expect(citedTitle('The Sacraments, Vol. II')).toBe('The Sacraments');
  });
});

describe('volumeOf', () => {
  it('reads Roman and Arabic volume numbers', () => {
    expect(volumeOf('Vol. II, p. 34')).toBe(2);
    expect(volumeOf('vol. iv')).toBe(4);
    expect(volumeOf('Volume 3')).toBe(3);
  });

  it('is null when no volume is named', () => {
    expect(volumeOf('pp. 33 sqq')).toBeNull();
    expect(volumeOf(null)).toBeNull();
  });
});

describe('keyNames', () => {
  it('takes both parts of a hyphenated pair, the surname before a comma, else the last name', () => {
    expect(keyNames('Pohle-Preuss')).toEqual(['pohle', 'preuss']);
    expect(keyNames('Driscoll, John T. (John Thomas), 1866-')).toEqual(['driscoll']);
    expect(keyNames('J. T. Driscoll')).toEqual(['driscoll']);
  });
});

describe('sameAuthor', () => {
  it('matches a cited surname among the book\'s author names', () => {
    expect(sameAuthor('Pohle-Preuss', 'Joseph Pohle')).toBe(true);
    expect(sameAuthor('Coffey', 'P. Coffey')).toBe(true);
  });

  it('does not match different authors', () => {
    expect(sameAuthor('Coffey', 'Joseph Pohle')).toBe(false);
  });
});

describe('sameTitle', () => {
  it('matches equal titles, ignoring case, punctuation and a leading article', () => {
    expect(sameTitle('The Divine Trinity', 'the divine trinity')).toBe(true);
  });

  it('matches a title against the same title with a subtitle', () => {
    expect(sameTitle('Christian Philosophy: God', 'Christian philosophy, God; being a contribution to theodicy')).toBe(true);
    expect(sameTitle('Epistemology', 'Epistemology, or the Theory of Knowledge')).toBe(true);
  });

  it('does not match different works', () => {
    expect(sameTitle('Christology', 'Mariology')).toBe(false);
  });
});

describe('skipCitation', () => {
  it('skips citations with no author or title, and the Bible', () => {
    expect(skipCitation('', 'Summa Theologica')).toBe(true);
    expect(skipCitation('Aquinas', '')).toBe(true);
    expect(skipCitation('Bible', '2 Corinthians')).toBe(true);
    expect(skipCitation('Aquinas', 'Summa Theologica')).toBe(false);
  });
});
