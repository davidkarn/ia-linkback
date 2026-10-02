import { describe, expect, it } from '@jest/globals';
import { pagesWithVolumeMarkers, selectVolume, volumeName, volumesOf } from './volumes.ts';

const cited = (pageId: number, ...pairs: [string, number][]) => ({
  pageId, parts: pairs.map(([type, value]) => ({ type, value })),
});
const show  = (volumes: ReturnType<typeof volumesOf>) => volumes.map((v) => (
  `${ v.number }: ${ v.partType } ${ v.partValue } [${ v.pageIds.join(',') }]`
));

describe('volumesOf', () => {
  it('is empty for a book whose pages are not cited by parts', () => {
    expect(volumesOf([1, 2, 3], [])).toEqual([]);
  });

  it('makes a volume of each distinct first part, numbered in page order', () => {
    expect(show(volumesOf([1, 2, 3, 4], [
      cited(1, ['book', 2], ['question', 1]),
      cited(2, ['book', 2], ['question', 2]),
      cited(3, ['book', 1], ['question', 1]),
      cited(4, ['book', 1], ['question', 2]),
    ]))).toEqual(['1: book 2 [1,2]', '2: book 1 [3,4]']);
  });

  it('keeps volumes of the same value but a different type apart', () => {
    expect(show(volumesOf([1, 2], [cited(1, ['book', 1]), cited(2, ['part', 1])])))
      .toEqual(['1: book 1 [1]', '2: part 1 [2]']);
  });

  it('puts a page cited in two volumes in both', () => {
    expect(show(volumesOf([1, 2, 3], [
      cited(1, ['book', 1], ['chapter', 50]),
      cited(2, ['book', 1], ['chapter', 50]),
      cited(2, ['book', 2], ['chapter', 1]),
      cited(3, ['book', 2], ['chapter', 1]),
    ]))).toEqual(['1: book 1 [1,2]', '2: book 2 [2,3]']);
  });

  it('lists a page cited twice in one volume once', () => {
    expect(show(volumesOf([1], [cited(1, ['book', 1], ['chapter', 1]), cited(1, ['book', 1], ['chapter', 2])])))
      .toEqual(['1: book 1 [1]']);
  });

  it('puts uncited pages in the volume before them, or the first one when none is', () => {
    expect(show(volumesOf([1, 2, 3, 4, 5, 6], [
      cited(3, ['book', 1]),
      cited(5, ['book', 2]),
    ]))).toEqual(['1: book 1 [1,2,3,4]', '2: book 2 [5,6]']);
  });
});

describe('selectVolume', () => {
  const volumes = volumesOf([1, 2, 3], [
    cited(1, ['book', 1]), cited(2, ['book', 1]), cited(2, ['book', 2]), cited(3, ['book', 2]),
  ]);

  it('takes the volume asked for', () => {
    expect(selectVolume(volumes, { volume: 2, pageId: 1 })).toBe(2);
  });

  it('is null for a volume the book does not have', () => {
    expect(selectVolume(volumes, { volume: 3 })).toBeNull();
    expect(selectVolume(volumes, { volume: 0 })).toBeNull();
  });

  it("finds a page's first volume", () => {
    expect(selectVolume(volumes, { pageId: 2 })).toBe(1);
    expect(selectVolume(volumes, { pageId: 3 })).toBe(2);
  });

  it('opens volume 1 otherwise', () => {
    expect(selectVolume(volumes, {})).toBe(1);
    expect(selectVolume(volumes, { pageId: 99 })).toBe(1);
  });

  it('gives a book without volumes only volume 1', () => {
    expect(selectVolume([], {})).toBe(1);
    expect(selectVolume([], { volume: 1 })).toBe(1);
    expect(selectVolume([], { volume: 2 })).toBeNull();
    expect(selectVolume([], { pageId: 5 })).toBe(1);
  });
});

describe('pagesWithVolumeMarkers', () => {
  const pages   = [1, 2, 3, 4].map((pageId) => ({ pageId, printedPageNumber: String(pageId), citedByCount: 0 }));
  const volumes = volumesOf([1, 2, 3, 4], [
    cited(1, ['book', 1]), cited(2, ['book', 1]), cited(3, ['book', 2]), cited(4, ['book', 2]),
  ]);

  it("lists every page, with a marker of the volume's name before each volume's first page", () => {
    expect(pagesWithVolumeMarkers(pages, volumes).map((p) => (
      'isVolume' in p ? `[${ p.printedPageNumber } at ${ p.pageId }]` : p.printedPageNumber
    ))).toEqual(['[Book 1 at 1]', '1', '2', '[Book 2 at 3]', '3', '4']);
  });

  it('marks a volume by its part, with no citations of its own', () => {
    expect(volumeName(volumes[1]!)).toBe('Book 2');
    expect(pagesWithVolumeMarkers(pages, volumes)[0]).toEqual(
      { pageId: 1, printedPageNumber: 'Book 1', citedByCount: null, isVolume: true }
    );
  });

  it('marks a volume by the name given it', () => {
    const named = pagesWithVolumeMarkers(pages, volumes, (v) => `Liber ${ v.partValue }`);
    expect(named.filter((p) => 'isVolume' in p).map((p) => p.printedPageNumber))
      .toEqual(['Liber 1', 'Liber 2']);
  });
});
