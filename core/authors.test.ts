import { describe, expect, it } from '@jest/globals';
import { namesAnAuthor } from './authors.ts';

describe('namesAnAuthor', () => {
  it('is true of a name', () => {
    expect(namesAnAuthor('Augustine of Hippo')).toBe(true);
  });

  it("is false of no author, an anonymous one or the Bible's, in any case", () => {
    expect(namesAnAuthor('')).toBe(false);
    expect(namesAnAuthor('  ')).toBe(false);
    expect(namesAnAuthor('Anonymous')).toBe(false);
    expect(namesAnAuthor('bible')).toBe(false);
  });
});
