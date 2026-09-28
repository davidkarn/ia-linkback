// A book's table of contents, from how its pages are cited (book_pages_to_citations): each page's
// citation parts ("book 1, question 2, article 3") are a path down the tree. Pure functions;
// model/book_pages_to_citations.ts reads the parts.
import type { CitationLocation } from '../types.ts';
import type { CitationPart } from './summa_thml.ts';

// pageId: the page to go to for the entry (a pageId of the book's pageOrder): the page cited by
// exactly its parts (a question's contents page), or else the first page under it
export type ContentsEntry = {
  partType: CitationLocation['type'],
  partValue: string,
  pageId: number,
  childEntries: ContentsEntry[],
};

// The table of contents of pages cited by these parts, given in page order: entries in the order
// they are first reached, a part shared by pages ("book 1") one entry holding the parts under it
export const contentsOf = (pages: { pageId: number, parts: CitationPart[] }[]): ContentsEntry[] => {
  const root: ContentsEntry[] = [];
  // entries whose pageId is a page cited by exactly their parts, which a later page can't replace
  const exact = new Set<ContentsEntry>();

  for (const page of pages) {
    page.parts.reduce((entries, part, i) => {
      const last  = i === page.parts.length - 1;
      const found = entries.find((e) => e.partType === part.type && e.partValue === String(part.value));

      if (found) {
        if (last && !exact.has(found)) {
          found.pageId = page.pageId;
          exact.add(found);
        }
        return found.childEntries;
      }
      else {
        const entry: ContentsEntry = {
          partType:     part.type as CitationLocation['type'],
          partValue:    String(part.value),
          pageId:       page.pageId,
          childEntries: [],
        };
        if (last) {
          exact.add(entry);
        }
        entries.push(entry);
        return entry.childEntries;
      }
    }, root);
  }

  return root;
};
