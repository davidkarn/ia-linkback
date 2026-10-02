// A book's volumes, from how its pages are cited (book_pages_to_citations): each distinct first
// citation part ("book 1", "book 2") is a volume. A book with no such rows has no volumes, and
// is read as a single volume 1 holding every page. Pure functions; the service reads the rows.
import type { CitationPart } from './summa_thml.ts';

// number: 1-based, in the order the volumes are first reached in page order.
// pageIds: the volume's pages, in page order
export type Volume = { number: number, partType: string, partValue: number, pageIds: number[] };

const volumeKey = (part: CitationPart) => part.type + '\u0000' + part.value;

// The volumes of a book with these pages (pageIds in page order), given the citation parts of its
// cited pages. A page is in the volume of each of its citations' first parts, so a page where one
// volume ends and the next starts is in both. A page with no citations is in the volume before
// it, or in the first volume when it comes before every cited page. [] when no page is cited.
export const volumesOf = (
  pageIds: number[], citedPages: { pageId: number, parts: CitationPart[] }[]
): Volume[] => {
  const partsByPage = new Map<number, CitationPart[]>();
  for (const page of citedPages) {
    const first = page.parts[0];
    if (first !== undefined) {
      partsByPage.set(page.pageId, [...(partsByPage.get(page.pageId) ?? []), first]);
    }
  }

  const volumes = new Map<string, Volume>();
  // uncited pages before the first cited one, which go to the first volume
  const leading: number[] = [];
  let last: Volume | undefined;

  for (const pageId of pageIds) {
    const firstParts = partsByPage.get(pageId) ?? [];

    if (firstParts.length > 0) {
      for (const part of firstParts) {
        const key    = volumeKey(part);
        const volume = volumes.get(key) ?? {
          number: volumes.size + 1, partType: part.type, partValue: part.value, pageIds: [],
        };
        volumes.set(key, volume);
        if (!volume.pageIds.includes(pageId)) {
          volume.pageIds.push(pageId);
        }
        last = volume;
      }
    }
    else if (last !== undefined) {
      last.pageIds.push(pageId);
    }
    else {
      leading.push(pageId);
    }
  }

  const all = [...volumes.values()];
  if (all.length > 0) {
    all[0]!.pageIds.unshift(...leading);
  }
  return all;
};

// The volume to open: `volume` when it is given (null when the book has no such volume), else the
// first volume holding `pageId`, else volume 1. A book without volumes has only volume 1.
export const selectVolume = (
  volumes: Volume[], opts: { volume?: number | undefined, pageId?: number | undefined }
): number | null => {
  const count = Math.max(volumes.length, 1);

  if (opts.volume !== undefined) {
    return opts.volume >= 1 && opts.volume <= count ? opts.volume : null;
  }
  else if (opts.pageId !== undefined) {
    const pageId = opts.pageId;
    return volumes.find((v) => v.pageIds.includes(pageId))?.number ?? 1;
  }
  else {
    return 1;
  }
};

// A book with fewer pages than this lists every volume's pages at once (with a marker where each
// volume starts) rather than only the open volume's
export const ALL_VOLUMES_UNDER_PAGES = 200;

// A volume's name, from its part: "Book 2", "Part 3"
export const volumeName = (volume: Volume): string => (
  volume.partType.charAt(0).toUpperCase() + volume.partType.slice(1) + ' ' + volume.partValue
);

// Where a volume starts in a list of a book's pages: its first page, and its name
export type VolumeMarker = {
  pageId: number,
  printedPageNumber: string,
  citedByCount: null,
  isVolume: true,
};

// Every page of a book, in order, with a marker before the first page of each volume (a page
// starting two volumes, the one ending there going on to it, gets a marker for each), named by
// nameOf
export const pagesWithVolumeMarkers = <P extends { pageId: number }>(
  pages: P[], volumes: Volume[], nameOf: (volume: Volume) => string = volumeName,
): (P | VolumeMarker)[] => {
  const startingAt = new Map<number, Volume[]>();
  for (const v of volumes) {
    const first = v.pageIds[0];
    if (first !== undefined) {
      startingAt.set(first, [...(startingAt.get(first) ?? []), v]);
    }
  }

  return pages.flatMap((page) => [
    ...(startingAt.get(page.pageId) ?? []).map((v): VolumeMarker => ({
      pageId: page.pageId, printedPageNumber: nameOf(v), citedByCount: null, isVolume: true,
    })),
    page,
  ]);
};
