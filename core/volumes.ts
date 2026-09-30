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
