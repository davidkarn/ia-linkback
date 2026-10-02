// A book's pageOrder (GET /books/{bookId}): for a short book with volumes, every volume's pages,
// with an entry (isVolume) where each volume starts
import type { PageOrderEntry, VolumeSummary } from '../api'

// The pages alone, without the entries marking where volumes start
export const pagesOnly = (pageOrder: PageOrderEntry[]): PageOrderEntry[] => (
  pageOrder.filter((p) => !p.isVolume)
);

// The volume each listed page is in, by page id: the last volume whose pages (firstPageId to
// lastPageId) take it in, as a page where one volume ends and the next starts goes with the next.
// Empty for a book without volumes.
export const pageVolumes = (
  pageOrder: PageOrderEntry[], volumes: VolumeSummary[]
): Map<number, number> => new Map(pagesOnly(pageOrder).flatMap((page) => {
  const volume = volumes.findLast((v) => v.firstPageId <= page.pageId && page.pageId <= v.lastPageId);
  return volume === undefined ? [] : [[page.pageId, volume.volume] as const];
}));
