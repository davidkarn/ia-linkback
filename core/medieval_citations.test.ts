import { describe, expect, it } from '@jest/globals';
import { citedFatherWork, parseFatherLocation } from './fathers_citations.ts';
import { BOETHIUS_WORKS, CONTRA_GENTILES_WORKS } from './medieval_citations.ts';

const scg = (author: string, title: string) => citedFatherWork(author, title, '', CONTRA_GENTILES_WORKS)?.bookId;

describe('CONTRA_GENTILES_WORKS', () => {
  it("knows the Summa Contra Gentiles by Aquinas, by its titles' many forms", () => {
    for (const [author, title] of [['Thomas Aquinas', 'Summa Contra Gentiles'], ['St. Thomas', 'C. Gent.'],
                                   ['S. Thom.', 'Contra Gent.'], ['Thomas Aquinas', 'Summa c. Gent'], ['Thomas Aquinas', 'Cont. Gentes']]) {
      expect(scg(author!, title!)).toBe('summa-contra-gentiles');
    }
  });

  it("leaves Athanasius's Contra Gentes, and the Summa Theologiae, alone", () => {
    expect(scg('Athanasius', 'Contra Gentes')).toBeUndefined();
    expect(scg('St. Athanasius', 'C. Gentes')).toBeUndefined();
    expect(scg('Thomas Aquinas', 'Summa Theologica')).toBeUndefined();
  });
});

describe('BOETHIUS_WORKS', () => {
  const [consolation] = BOETHIUS_WORKS;

  it('knows the Consolation, and reads its places as book and prose section', () => {
    expect(citedFatherWork('Boethius', 'De Consol.', '', BOETHIUS_WORKS)).toBe(consolation);
    expect(citedFatherWork('Boethius', 'De Trin.', '', BOETHIUS_WORKS)).toBeUndefined();
    expect(parseFatherLocation('iii, 11', consolation!.types!)).toEqual([[
      { type: 'book', value: 3 }, { type: 'prose', value: 11 },
    ]]);
  });
});
