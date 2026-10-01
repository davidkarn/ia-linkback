import { QueryClient, queryOptions } from '@tanstack/react-query'
import {
  fetchAdminBooks, fetchAdminCitationInsights, fetchAdminCitations, fetchAdminDashboard,
  fetchAdminQueuedBooks, fetchAdminSession,
  fetchBook, fetchBooks, fetchCitationSourcePage, fetchPage, fetchPageInsights,
} from './api'

// The app's one QueryClient (see main.tsx). Books and pages don't change while they're open, so
// data stays fresh for a while and isn't refetched when the window regains focus (page insights
// cost an OpenRouter request).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry:                1,
    },
  },
});


export const booksQuery = (
  opts: { offset: number, length: number, query: string }
) => queryOptions({
  queryKey: ['books', opts],
  queryFn:  () => fetchBooks(opts),
});

const bookVolumeKey = (bookId: string, volume: number) => ['book', bookId, 'volume', volume];

// A book opened to `volume`; without one, to the volume holding `pageId` (volume 1 when it's
// undefined too), which is then cached as that volume as well
export const bookQuery = (bookId: string, volume?: number, pageId?: number) => (
  volume !== undefined || pageId === undefined
    ? queryOptions({
      queryKey: bookVolumeKey(bookId, volume ?? 1),
      queryFn:  () => fetchBook(bookId, { volume: volume ?? 1 }),
    })
    : queryOptions({
      queryKey: ['book', bookId, 'volumeOfPage', pageId],
      queryFn:  async() => {
        const book = await fetchBook(bookId, { pageId });
        queryClient.setQueryData(bookVolumeKey(bookId, book.volume), book);
        return book;
      },
    })
);

export const pageQuery = (bookId: string, pageId: number) => queryOptions({
  queryKey: ['book', bookId, 'page', pageId],
  queryFn:  () => fetchPage(bookId, pageId),
});

export const pageInsightsQuery = (bookId: string, pageId: number) => queryOptions({
  queryKey: ['book', bookId, 'page', pageId, 'insights'],
  queryFn:  () => fetchPageInsights(bookId, pageId),
});

// Fetched when a citation is expanded: a much cited page has hundreds of citations, each on a
// page of its own
export const citationSourcePageQuery = (citationId: string) => queryOptions({
  queryKey: ['citation', citationId, 'sourcePage'],
  queryFn:  () => fetchCitationSourcePage(citationId),
});

// The admin panel: fetched again whenever it's opened, as the queue changes while the CLI runs
export const adminSessionQuery = () => queryOptions({
  queryKey:  ['admin', 'session'],
  queryFn:   fetchAdminSession,
  staleTime: 0,
  retry:     false,
});

export const adminDashboardQuery = () => queryOptions({
  queryKey:  ['admin', 'dashboard'],
  queryFn:   fetchAdminDashboard,
  staleTime: 0,
  retry:     false,
});

export const adminCitationInsightsQuery = () => queryOptions({
  queryKey:  ['admin', 'citationInsights'],
  queryFn:   fetchAdminCitationInsights,
  staleTime: 0,
  retry:     false,
});

export const adminCitationsQuery = (
  opts: Parameters<typeof fetchAdminCitations>[0]
) => queryOptions({
  queryKey:  ['admin', 'citations', opts],
  queryFn:   () => fetchAdminCitations(opts),
  staleTime: 0,
  retry:     false,
});

export const adminBooksQuery = (opts: Parameters<typeof fetchAdminBooks>[0]) => queryOptions({
  queryKey:  ['admin', 'books', opts],
  queryFn:   () => fetchAdminBooks(opts),
  staleTime: 0,
  retry:     false,
});

export const adminQueuedBooksQuery = (
  opts: Parameters<typeof fetchAdminQueuedBooks>[0]
) => queryOptions({
  queryKey:  ['admin', 'queuedBooks', opts],
  queryFn:   () => fetchAdminQueuedBooks(opts),
  staleTime: 0,
  retry:     false,
});
