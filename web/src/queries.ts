import { QueryClient, queryOptions } from '@tanstack/react-query'
import { fetchBook, fetchBooks, fetchPage, fetchPageInsights } from './api'

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

export const bookSummariesQuery = () => queryOptions({
  queryKey:  ['books', 'summaries'],
  queryFn:   async() => new Map((await fetchBooks({ length: 100 })).items.map((b) => [b.id, b])),
  staleTime: Infinity,
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
