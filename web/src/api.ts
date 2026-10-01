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
// is the number printed on the page, '' when it has none. citedByCount: citations in other books that cite
// this page (its foreignCitations).
export type PageOrderEntry = { pageId: number, printedPageNumber: string, citedByCount: number };
// A table of contents entry: a part the book's pages are cited by ("question 2"), and the parts
// under it. pageId is the page to go to: the page cited by exactly its parts, or else the first
// page under it, in the volume of its top-level entry (for a book with volumes, maybe not the one
// open), and printedPageNumber that page's printed number. Empty for books cited by printed page
// number.
export type ContentsEntry = {
  partType: string,
  partValue: string,
  pageId: number,
  printedPageNumber: string,
  childEntries: ContentsEntry[],
};
// One of a book's volumes: a distinct first citation part of its pages ("book 2"), numbered from 1
// in page order. firstPageId and lastPageId are the volume's first and last pages.
export type VolumeSummary = {
  volume: number,
  partType: string,
  partValue: string,
  firstPageId: number,
  lastPageId: number,
  pageCount: number,
};
// GET /books/{bookId}: opened to one volume, the pageOrder holding only its pages, and contents
// the whole book's (a volume's entries at its top level). volumes is empty for a book without
// volumes, which is always opened to volume 1.
export type Book = BookSummary & {
  volume: number,
  volumes: VolumeSummary[],
  pageOrder: PageOrderEntry[],
  contents: ContentsEntry[],
};

export type CitationLocation = { type: string, value: number };

export type Citation = {
  id: string,
  // footnotePage is the pageId of the citing page in source.bookId
  source: { bookId: string, footnoteIdentifier: string, footnotePage: string },
  author: string,
  title: string,
  locationsCited: CitationLocation[],
};

// GET /citations/{citationId}/sourcePage: the HTML of the page a citation's footnote is on (its
// blocks' HTML in reading order, one per line, without running headers and footers, and with only
// this citation's footnote)
export type CitationSourcePage = { citationId: string, sourcePageText: string };

export type PageBlock = {
  label: 'SectionHeader' | 'Text' | 'PageHeader' | 'PageFooter' | 'Footnote',
  html: string,
  citations: Citation[],
};

export type BookPage = {
  bookId: string,
  pageNumber: number,
  printedPageNumber: string,
  blocks: PageBlock[],
  foreignCitations: Citation[],  // citations in other books that point to this page
  // the title and author of each book a foreignCitation is in
  foreignCitationTitles: { bookId: string, title: string, author: string }[],
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

// query: search titles and authors
export const fetchBooks = async (opts: { offset?: number, length?: number, query?: string } = {}): Promise<BookList> => {
  const params = new URLSearchParams();
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  if (opts.length !== undefined) params.set('length', String(opts.length));
  if (opts.query) params.set('query', opts.query);

  return getJson(`/books?${params}`);
};

// opened to `volume`, or else to the first volume holding `pageId`, or else to volume 1
export const fetchBook = (
  bookId: string, opts: { volume?: number, pageId?: number } = {}
): Promise<Book> => {
  const params = new URLSearchParams();
  if (opts.volume !== undefined) params.set('volume', String(opts.volume));
  if (opts.pageId !== undefined) params.set('pageId', String(opts.pageId));

  return getJson(`/books/${encodeURIComponent(bookId)}?${params}`);
};

export const fetchPage = (bookId: string, pageId: number): Promise<BookPage> =>
  getJson(`/books/${encodeURIComponent(bookId)}/pages/${pageId}`);

export const fetchCitationSourcePage = (citationId: string): Promise<CitationSourcePage> =>
  getJson(`/citations/${encodeURIComponent(citationId)}/sourcePage`);

// GET /books/{bookId}/pages/{pageId}/insights: what other books in the collection say about a page
export type PageInsights = {
  bookId: string,
  pageId: number,
  printedPageNumber: string,
  overview: string,  // how the citing sources, taken together, treat the page
  sources: {
    bookId: string,
    title: string,
    author: string,
    pageId: number,  // the citing page, a pageId of that book
    printedPageNumber: string,
    footnoteIdentifiers: string[],
    summary: string,  // '' if the model gave none
  }[],
};

// null when nothing in the collection cites the page (the endpoint answers 204, with no body).
// Each call with citations makes an OpenRouter request.
export const fetchPageInsights = async (bookId: string, pageId: number): Promise<PageInsights | null> => {
  const path = `/books/${encodeURIComponent(bookId)}/pages/${pageId}/insights`;
  const res  = await fetch(`/api${path}`);

  if (res.status === 204) {
    return null;
  }
  else if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
  }
  else {
    return res.json();
  }
};

// The admin panel (/tl-admin): the AdminSession, QueueStatus and AdminDashboard schemas in
// ../api.yaml. Signing in sets an HttpOnly session cookie, which the browser sends with these.
export type AdminSession = { signedIn: boolean };

export type QueueStatus =
  'pending' | 'queued' | 'inProgress' | 'processingContents' | 'imported' | 'importedAndCrawled' | 'complete';

export type AdminDashboard = {
  statusCounts: { status: QueueStatus, count: number }[],  // every status, in pipeline order
  nextUp: {  // the next books to be OCR'd
    id: string,
    title: string,
    author: string,
    archiveUrl: string | null,
    pdfUrl: string | null,
    status: QueueStatus,
  }[],
};

// A failed request's HTTP status, for telling a wrong password (401) from the panel being closed
// (503)
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const requestJson = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }),
  });

  if (!res.ok) {
    const message = await res.json().then((b) => b?.message, () => undefined);
    throw new ApiError(res.status, message ?? `${method} ${path} failed: ${res.status} ${res.statusText}`);
  }
  else {
    return res.json();
  }
};

export const fetchAdminSession = (): Promise<AdminSession> => requestJson('GET', '/admin/session');

export const adminLogin = (username: string, password: string): Promise<AdminSession> =>
  requestJson('POST', '/admin/login', { username, password });

export const adminLogout = (): Promise<AdminSession> => requestJson('POST', '/admin/logout');

export const fetchAdminDashboard = (): Promise<AdminDashboard> => requestJson('GET', '/admin/dashboard');
