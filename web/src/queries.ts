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

// A page of the library, searched by title and author
export const booksQuery = (opts: { offset: number, length: number, query: string }) => queryOptions({
  queryKey: ['books', opts],
  queryFn:  () => fetchBooks(opts),
});

// Every book (up to 100) by id, for naming the books that cite a page
export const bookSummariesQuery = () => queryOptions({
  queryKey:  ['books', 'summaries'],
  queryFn:   async() => new Map((await fetchBooks({ length: 100 })).items.map((b) => [b.id, b])),
  staleTime: Infinity,
});

export const bookQuery = (bookId: string) => queryOptions({
  queryKey: ['book', bookId],
  queryFn:  () => fetchBook(bookId),
});

export const pageQuery = (bookId: string, pageId: number) => queryOptions({
  queryKey: ['book', bookId, 'page', pageId],
  queryFn:  () => fetchPage(bookId, pageId),
});

// null when nothing in the collection cites the page
export const pageInsightsQuery = (bookId: string, pageId: number) => queryOptions({
  queryKey: ['book', bookId, 'page', pageId, 'insights'],
  queryFn:  () => fetchPageInsights(bookId, pageId),
});
