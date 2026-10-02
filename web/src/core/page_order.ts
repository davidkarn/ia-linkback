// A book's pageOrder (GET /books/{bookId}): for a short book with volumes, every volume's pages,
// with an entry (isVolume) where each volume starts
import type { PageOrderEntry, VolumeSummary } from '../api'

// The pages alone, without the entries marking where volumes start
export const pagesOnly = (pageOrder: PageOrderEntry[]): PageOrderEntry[] => (
  pageOrder.filter((p) => !p.isVolume)
);

// The volume each page listed after a volume's entry is in, by page id: the volume whose entry
// came last before it. Empty when pageOrder has no volume entries.
export const pageVolumes = (
  pageOrder: PageOrderEntry[], volumes: VolumeSummary[]
): Map<number, number> => {
  const byFirstPage = new Map(volumes.map((v) => [v.firstPageId, v.volume]));
  const volumeOf    = new Map<number, number>();
  let current: number | undefined;

  for (const entry of pageOrder) {
    if (entry.isVolume) {
      current = byFirstPage.get(entry.pageId) ?? current;
    }
    else if (current !== undefined) {
      volumeOf.set(entry.pageId, current);
    }
  }

  return volumeOf;
};
