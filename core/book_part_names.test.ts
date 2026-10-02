import { describe, expect, it } from '@jest/globals';
import { partNamer } from './book_part_names.ts';

describe('partNamer', () => {
  const nameOf = partNamer([
    { parts: [{ type: 'book', value: 1 }], name: 'Prima Pars' },
    { parts: [{ type: 'book', value: 5 }, { type: 'appendix', value: 1 }], name: 'Appendix I' },
  ]);

  it('names the parts given exactly', () => {
    expect(nameOf([{ type: 'book', value: 1 }])).toBe('Prima Pars');
    expect(nameOf([{ type: 'book', value: 5 }, { type: 'appendix', value: 1 }])).toBe('Appendix I');
  });

  it("doesn't name a part by an outer or inner one's name", () => {
    expect(nameOf([{ type: 'book', value: 5 }])).toBeUndefined();
    expect(nameOf([{ type: 'book', value: 1 }, { type: 'question', value: 2 }])).toBeUndefined();
  });

  it("doesn't name a part of another type with the same value", () => {
    expect(nameOf([{ type: 'part', value: 1 }])).toBeUndefined();
  });
});
