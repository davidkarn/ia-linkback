import type { ContentsEntry, VolumeSummary } from '../api';

const LABELS: Record<string, string> = {
  book: 'Book', chapter: 'Chapter', question: 'Question', article: 'Article', part: 'Part',
  lecture: 'Lecture', volume: 'Volume', verse: 'Verse', page: 'Page', appendix: 'Appendix',
};

// An entry as the table of contents shows it: "Question 2", "Chapter 13"
export const entryLabel = (entry: Pick<ContentsEntry, 'partType' | 'partValue'>): string => (
  (LABELS[entry.partType] ?? entry.partType[0]!.toUpperCase() + entry.partType.slice(1)) + ' ' + entry.partValue
);

// The positions of the entries leading to the page, outermost first: at each level the last entry
// starting at or before it (an entry's pageId is where it starts, in page order), so a page with no
// entry of its own falls under the one before it. [] when it comes before every entry.
export const pathToPage = (entries: ContentsEntry[], pageId: number): number[] => {
  const i = entries.findLastIndex((e) => e.pageId <= pageId);
  return i < 0 ? [] : [i, ...pathToPage(entries[i]!.childEntries, pageId)];
};

// The volume a top-level entry is, for a book with volumes (undefined for one without)
export const volumeOfEntry = (
  volumes: VolumeSummary[], entry: ContentsEntry
): number | undefined => (
  volumes.find((v) => v.partType === entry.partType && v.partValue === entry.partValue)?.volume
);

// pathToPage within the volume open, for a book with volumes: under that volume's top-level entry,
// so a page where one volume ends and the next starts is found in the one open
export const pathToPageInVolume = (
  entries: ContentsEntry[], pageId: number, volumes: VolumeSummary[], volume: number
): number[] => {
  const i = entries.findIndex((e) => volumeOfEntry(volumes, e) === volume);
  return i < 0 ? pathToPage(entries, pageId) : [i, ...pathToPage(entries[i]!.childEntries, pageId)];
};

// A key for an entry by its position: "0.3.2"
export const pathKey = (path: number[]): string => path.join('.');

// The keys of the entries along a path, outermost first: [0, 3, 2] -> "0", "0.3", "0.3.2"
export const keysAlong = (path: number[]): string[] => path.map((_, i) => pathKey(path.slice(0, i + 1)));
