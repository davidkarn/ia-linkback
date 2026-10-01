import { describe, expect, it } from '@jest/globals';
import {
  checkCopyrightResults, copyrightCheckActions, copyrightPrompt, copyrightRequest,
  publicDomainCutoffYear,
} from './copyright_status.ts';

const books = [
  { id: 'npnf102-city-of-god', title: 'City of God', author: 'Augustine of Hippo', url: null },
  { id: 'godhisknowabilit00pohluoft', title: 'God: His Knowability', author: 'Joseph Pohle', url: 'https://archive.org/details/godhisknowabilit00pohluoft' },
];

describe('publicDomainCutoffYear', () => {
  it('is the year 96 years back: in 2026, works of 1930 and before are in the public domain', () => {
    expect(publicDomainCutoffYear(new Date('2026-10-01T12:00:00Z'))).toBe(1930);
    expect(publicDomainCutoffYear(new Date('2027-01-01T00:00:00Z'))).toBe(1931);
  });

  it('is written into the prompt', () => {
    expect(copyrightPrompt(1930)).toContain('published in 1930 or earlier');
  });
});

describe('copyrightRequest', () => {
  it('gives the model each book by its id, title, author and url', () => {
    expect(JSON.parse(copyrightRequest(books))[0]).toEqual({
      bookId: 'npnf102-city-of-god', title: 'City of God', author: 'Augustine of Hippo', url: null,
    });
  });
});

describe('checkCopyrightResults', () => {
  it('keeps the first result for each book asked about, in their order, and lists those missing', () => {
    expect(checkCopyrightResults(books, [
      { bookId: 'not-asked', status: 'likely_copyrighted', notes: 'x' },
      { bookId: 'npnf102-city-of-god', status: 'likely_public_domain', notes: '  NPNF, 1887.  ' },
      { bookId: 'npnf102-city-of-god', status: 'likely_copyrighted', notes: 'a second answer' },
    ])).toEqual({
      checks:  [{ bookId: 'npnf102-city-of-god', status: 'likely_public_domain', notes: 'NPNF, 1887.' }],
      missing: ['godhisknowabilit00pohluoft'],
    });
  });
});

describe('copyrightCheckActions', () => {
  it('saves and logs each check, and logs the books with no result', () => {
    const check = { bookId: 'npnf102-city-of-god', status: 'likely_public_domain' as const, notes: 'NPNF, 1887.' };

    expect(copyrightCheckActions(books, [check], ['godhisknowabilit00pohluoft'])).toEqual([
      { cmd: 'modelAction', data: { model: 'CopyrightStatusChecks', act: 'saveCheck', params: [check] } },
      { cmd: 'log', data: ['likely_public_domain    City of God (npnf102-city-of-god)\n    NPNF, 1887.'] },
      { cmd: 'log', data: ['no result for God: His Knowability (godhisknowabilit00pohluoft): left for the next run'] },
    ]);
  });
});
