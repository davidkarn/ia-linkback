export type Book = {
  id: string,
  title: string,
  author: string,
  url?: string, // url to internet archive 
  pages: Page[]
}

export type Page = {
  pageNumber: number,
  printedPageNumber: string,
  blocks: PageBlock[],
}

export type PageBlock = {
  bbox: [number, number, number, number],
  label: "SectionHeader"|"Text"|"PageHeader"|"PageFooter"|"Footnote",
  html: string,
  citations: Citation[]
};

export type Citation = {
  source: {
    bookId: string,
    footnoteIdentifier: string,
    footnotePage: number,
  },
  referenceBookId: string|null,
  author: string,
  title: string,
  location: string,
  raw: string,
  /**
   * LocationsCited is a list of all locations.
   * 
   * For example, "Bk II Vol IV ch 1-3, also Bk III Vol 1 ch 5, 8-9" would
   * parse to the locationsCited:
   *
   * [
   *  [
   *    {rawLabel: "Bk II", type: 'book', values: [2]},
   *    {rawLabel: "Vol IV", type: 'volume', values: [4]},
   *    {rawLabel: "ch 1-3", type: 'chapter', values: [1, 2, 3]},
   *  ],
   *  [
   *    {rawLabel: "Bk III", type: 'book', values: [3]},
   *    {rawLabel: "Vol 1", type: 'volume', values: [1]},
   *    {rawLabel: "ch 5, 8-9", type: 'chapter', values: [5, 8, 9]},
   *  ],
   * ]
   */
  locationsCited: CitationLocation[][]
};

export type CitationLocation = {
  rawLabel: string,
  type: 'page'|'chapter'|'book'|'volume'|'question'|'article'|'lecture'|'position'|'verse'|'part',
  values: number[]
};

export type QueuedBookImport = {
  importedBookId: number;
  author: string;
  title: string;
  archiveUrl: string;
  pdfUrl: string;
  status: 'pending'|'imported'|'inProgress';
}

