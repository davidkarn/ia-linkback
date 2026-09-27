import { useEffect, useMemo, useRef, useState, createElement as __, Fragment } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { match } from 'ts-pattern';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchBook, fetchBooks, fetchPage, type Book, type BookPage, type Citation, type PageBlock, type PageCitation, type PageOrderEntry } from '../api'
import { assertCond } from '../lib';
import "./book_view.scss"
import BookPager from '../components/book_pager';
import { Header } from '../components/header';
import { BookPageView } from '../components/book_page';
import { openBooksPath, parseOpenBooks, withBookOpened, withPage, type OpenBook } from '../core/open_books';

// "p. 12" when the page has a printed number, else its position in the scan: "[scan 3]"
const pageLabel = (entry: PageOrderEntry) =>
  entry.printedPageNumber ? 'p. ' + entry.printedPageNumber : '[scan ' + entry.pageId + ']';


// [{page 42}, {page 43}, {page 44}, {chapter 2}] -> "p. 42–44, ch. 2"


// Titles of every book, for naming the books that cite a page. Fetched once.

// Up to MAX_OPEN_BOOKS books side by side, as listed in the URL (see core/open_books.ts). Opening a citing book
// from a column's "Cited by" list puts it to that column's right.
export default function BookView() {
  const location = useLocation();
  const books    = useMemo(() => parseOpenBooks(location.pathname), [location.pathname]);

  // a column is keyed by its book (and which copy of it, if one is open twice), not its position, so the
  // books that stay open keep their state when the leftmost one is dropped
  const seen = new Map<string, number>();
  const keys = books.map((b) => {
    const n = seen.get(b.bookId) ?? 0;
    seen.set(b.bookId, n + 1);
    return b.bookId + '#' + n;
  });

  return (
    __('main', {className: 'book-view'},
      __(Header, {}),
      __('section', {
          className: 'page-body book-columns',
          style: {'--columns': Math.max(books.length, 1)} as React.CSSProperties,
        },
        books.length === 0
          ? __('p', {className: 'muted'}, 'No book is open.')
          : books.map((open, column) => (
            __(BookColumn, {
              key: keys[column],
              open,
              active: column === books.length - 1,
              hrefForPage: (pageId: number) => openBooksPath(withPage(books, column, pageId)),
              hrefForCitingBook: (bookId: string, pageId: number) => (
                openBooksPath(withBookOpened(books, column, { bookId, pageId }))
              ),
            })
          ))
      )
    )
  );
}

// One open book. active: it's the rightmost, so ← / → turn its pages.
function BookColumn({open, active, hrefForPage, hrefForCitingBook}: {
  open: OpenBook,
  active: boolean,
  hrefForPage: (pageId: number) => string,
  hrefForCitingBook: (bookId: string, pageId: number) => string,
}) {
  const navigate = useNavigate();
  const bookId   = open.bookId;

  const [book, setBook]   = useState<Book | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true;
    setBook(null);
    setError(null);
    fetchBook(bookId)
      .then(b => { if (current) setBook(b); })
      .catch((e: Error) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [bookId])

  // No page in the URL: the first page
  const pageId = open.pageId ?? book?.pageOrder[0]?.pageId;
  const index  = book?.pageOrder.findIndex(p => p.pageId === pageId) ?? -1;
  const prev   = book && index > 0 ? book.pageOrder[index - 1] : undefined;
  const next   = book && index >= 0 ? book.pageOrder[index + 1] : undefined;

  // ← / → turn the page of the rightmost book
  useEffect(() => {
    if (!active) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
      const entry = e.key === 'ArrowLeft' ? prev : e.key === 'ArrowRight' ? next : undefined;
      if (entry) navigate(hrefForPage(entry.pageId));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  })

  return (
    __('div', {className: 'book-column'},
      match<boolean, React.ReactElement>(true)
        .with(!!error, () => __('p', {className: "error"}, "Couldn't load this book: ", error))
        .with(!book, () => __('p', {className: "muted"}, 'Loading'))
        .otherwise(() => (
          assertCond(book !== null),
          __('div', {className: 'book-page-view'},

            match<boolean, React.ReactElement>(true)
              .with(book.pageOrder.length === 0, () => (
                __('p', {className: 'muted'}, 'This book has no pages.')
              ))
              .with(index < 0, () => (
                __('p', {className: 'error'}, 'This book has no page ', open.pageId, '.')
              ))
              .otherwise(() => (
                __(BookPageView, {book, pageId: pageId!, index, hrefForPage, hrefForCitingBook})
              ))
          )
        ))
    )
  );
}

function PageView({
  bookId, pageId, allPages
}: {
  bookId: string, pageId: number, allPages: PageOrderEntry[]
}) {
}

// The block's HTML is the OCR output: formatting tags only (p, i, sup, tables, ...).

