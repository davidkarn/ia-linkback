// A book's table of contents, from how its pages are cited (book_pages_to_citations): each page's
// citation parts ("book 1, question 2, article 3") are a path down the tree. Pure functions;
// model/book_pages_to_citations.ts reads the parts.
import type { CitationLocation } from '../types.ts';
import type { CitationPart } from './summa_thml.ts';

export type ContentsEntry = {
  partType: CitationLocation['type'],
  partValue: string,
  childEntries: ContentsEntry[],
};

// The table of contents of pages cited by these parts, given in page order: entries in the order
// they are first reached, a part shared by pages ("book 1") one entry holding the parts under it
export const contentsOf = (pages: CitationPart[][]): ContentsEntry[] => {
  const root: ContentsEntry[] = [];

  for (const parts of pages) {
    parts.reduce((entries, part) => {
      const found = entries.find((e) => e.partType === part.type && e.partValue === part.value);
      if (found) {
        return found.childEntries;
      }
      else {
        const entry = {
          partType:     part.type as CitationLocation['type'],
          partValue:    part.value,
          childEntries: [],
        };
        entries.push(entry);
        return entry.childEntries;
      }
    }, root);
  }

  return root;
};
