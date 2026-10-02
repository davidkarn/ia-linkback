import { describe, expect, it } from '@jest/globals';
import { ARISTOTLE_WORKS } from './aristotle_citations.ts';
import { citedFatherWork, parseFatherLocation } from './fathers_citations.ts';

const work = (author: string, title: string) => citedFatherWork(author, title, '', ARISTOTLE_WORKS)?.bookId;

describe('ARISTOTLE_WORKS', () => {
  it('knows the works by their Latin abbreviations, cited as the Philosopher or by name', () => {
    expect(work('Philosopher', 'Ethic.')).toBe('aristotle-nicomachean-ethics');
    expect(work('Aristotle', 'Eth. Nic.')).toBe('aristotle-nicomachean-ethics');
    expect(work('Philosopher', 'Metaph.')).toBe('aristotle-metaphysics');
    expect(work('Aristot.', 'Met')).toBe('aristotle-metaphysics');
    expect(work('Philosopher', 'Peri Herm.')).toBe('aristotle-on-interpretation');
    expect(work('Philosopher', 'Praedic.')).toBe('aristotle-categories');
    expect(work('Aristotle', 'De Cœl')).toBe('aristotle-on-the-heavens');
  });

  it('tells works that start alike apart', () => {
    expect(work('Aristotle', 'Eth. Eudemic.')).toBe('aristotle-eudemian-ethics');
    expect(work('Philosopher', 'De Gener.')).toBe('aristotle-on-generation-and-corruption');
    expect(work('Philosopher', 'De Gener. Animal.')).toBe('aristotle-on-the-generation-of-animals');
  });

  it('leaves alone other authors, works not imported, and "Analytics" (Prior or Posterior)', () => {
    expect(work('Augustine', 'De Anima')).toBeUndefined();
    expect(work('Philosopher', 'Meteor.')).toBeUndefined();
    expect(work('Aristotle', 'Analytics')).toBeUndefined();
  });

  it('reads the usual locations as book and chapter, a commentary\'s text number as the book', () => {
    const show = (location: string) => parseFatherLocation(location, ['book', 'chapter'])
      .map((p) => p.map((x) => `${ x.type } ${ x.value }`).join(', '));
    expect(show('ii, 6')).toEqual(['book 2, chapter 6']);
    expect(show('iv, text 52,57')).toEqual(['book 4']);
  });
});
