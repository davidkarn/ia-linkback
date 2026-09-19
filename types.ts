export type Book = {
  id: string,
  title: string,
  author: string,
  url?: string,
  pages: Page[]
}

export type Page = {
  pageNumber: number,
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
  author: string,
  title: string,
  location: string,
  raw: string,
  locations: CitationLocation[]
};

export type CitationLocation = {
  type: 'page'|'chapter'|'book'|'volume'|'question'|'article'|'lecture'|'position'|'verse',
  value: number
};
