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

// A book whose volumes have fewer pages than this on average lists all its pages, without
// markers: its volumes are too short to be worth showing (Poetics, its chapters a page each)
export const MIN_AVERAGE_VOLUME_PAGES = 8;

// Which pages a book's pageOrder lists: 'volume', the open volume's (a long book, or one without
// volumes, whose one volume is the book); 'marked', every volume's with a marker where each starts
// (a short book); 'all', every page without markers (short volumes)
export type PageOrderLayout = 'volume' | 'marked' | 'all';

export const pageOrderLayout = (pageCount: number, volumes: Volume[]): PageOrderLayout => {
  if (volumes.length === 0) {
    return 'volume';
  }
  else if (pageCount / volumes.length < MIN_AVERAGE_VOLUME_PAGES) {
    return 'all';
  }
  else if (pageCount < ALL_VOLUMES_UNDER_PAGES) {
    return 'marked';
  }
  else {
    return 'volume';
  }
};

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

// A page as a book's pageOrder lists it (GET /books/{bookId} and its pageOrder): citedByCount, the
// citations in other books of the page, is null in the placeholder pageOrder (not counted yet)
// and for a volume's marker (isVolume)
export type PageOrderEntry = {
  pageId: number, printedPageNumber: string, citedByCount: number | null, isVolume?: true,
};

// The pages a book's pageOrder lists, as pageOrderLayout says (the open volume's, or every page,
// with a marker where each volume starts when they're marked), and whether that's every page.
// citedBy: the citations of each page (pages missing have none); null for the placeholder, its
// counts null. markerName: what a volume's marker is called.
export const pageOrderOf = (opts: {
  pages: { page_number: number, printed_page_number: string }[],
  volumes: Volume[],
  volume: number,
  citedBy: Map<number, number> | null,
  markerName: (volume: Volume) => string,
}): { pageOrder: PageOrderEntry[], allPagesListed: boolean } => {
  const opened = opts.volumes[opts.volume - 1];
  const layout = pageOrderLayout(opts.pages.length, opts.volumes);
  const inOpen = opened === undefined || layout !== 'volume' ? null : new Set(opened.pageIds);
  const listed = opts.pages
    .filter((p) => inOpen === null || inOpen.has(p.page_number))
    .map((p): PageOrderEntry => ({
      pageId:            p.page_number,
      printedPageNumber: p.printed_page_number,
      citedByCount:      opts.citedBy === null ? null : (opts.citedBy.get(p.page_number) ?? 0),
    }));

  return {
    pageOrder:      layout === 'marked'
      ? pagesWithVolumeMarkers(listed, opts.volumes, opts.markerName)
      : listed,
    allPagesListed: inOpen === null,
  };
};
