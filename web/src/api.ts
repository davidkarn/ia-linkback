// The BookSummary schema in ../api.yaml
export type BookSummary = {
  id: string,
  title: string,
  author: string,
  url?: string,
  coverPhotoPath?: string,  // relative to the site root: <img src={`/${coverPhotoPath}`}>
  pageCount: number,
  citedByCount: number,  // citations in other books that reference this one
};

export type BookList = { meta: { count: number }, items: BookSummary[] };

// GET /books/{bookId}: every page in reading order. pageId is the scan's page number; printedPageNumber
// is the number printed on the page, '' when it has none.
export type PageOrderEntry = { pageId: number, printedPageNumber: string };
export type Book = BookSummary & { pageOrder: PageOrderEntry[] };

export type CitationLocation = { type: string, value: number };

export type Citation = {
  id: string,
  // footnotePage is the pageId of the citing page in source.bookId
  source: { bookId: string, footnoteIdentifier: string, footnotePage: string },
  author: string,
  title: string,
  locationsCited: CitationLocation[],
};

export type PageBlock = {
  label: 'SectionHeader' | 'Text' | 'PageHeader' | 'PageFooter' | 'Footnote',
  html: string,
  citations: Citation[],
};

// GET /books/{bookId}/pages/{pageId}
export type BookPage = {
  bookId: string,
  pageNumber: number,
  printedPageNumber: string,
  blocks: PageBlock[],
  foreignCitations: Citation[],  // citations in other books that point to this page
};

const getJson = async <T>(path: string): Promise<T> => {
  const res = await fetch(`/api${path}`);
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
  }
  else {
    return res.json();
  }
};

export const fetchBooks = async (opts: { offset?: number, length?: number } = {}): Promise<BookList> => {
  const params = new URLSearchParams();
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  if (opts.length !== undefined) params.set('length', String(opts.length));

  return getJson(`/books?${params}`);
};

export const fetchBook = (bookId: string): Promise<Book> =>
  getJson(`/books/${encodeURIComponent(bookId)}`);

export const fetchPage = (bookId: string, pageId: number): Promise<BookPage> =>
  getJson(`/books/${encodeURIComponent(bookId)}/pages/${pageId}`);
