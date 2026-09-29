import { useEffect, useMemo, useRef, createElement as __, Fragment } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { match } from 'ts-pattern';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query'
import { type PageOrderEntry } from '../api'
import { bookQuery } from '../queries'
import { assertCond } from '../lib';
import "./book_view.scss"
import BookPager from '../components/book_pager';
import { Header } from '../components/header';
import { BookPageView } from '../components/book_page';
import { openBooksPath, parseOpenBooks, withBookClosed, withBookOpened, withPage, type OpenBook } from '../core/open_books';

const pageLabel = (entry: PageOrderEntry) =>
  entry.printedPageNumber ? 'p. ' + entry.printedPageNumber : '[scan ' + entry.pageId + ']';

export default function BookView() {
  const location = useLocation();
  const books    = useMemo(() => parseOpenBooks(location.pathname), [location.pathname]);

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
              hrefForPage: (pageId: number, volume: number) => (
                openBooksPath(withPage(books, column, pageId, volume))
              ),
              hrefForCitingBook: (bookId: string, pageId: number) => (
                openBooksPath(withBookOpened(books, column, { bookId, pageId }))
              ),
              hrefToClose: books.length > 1
                ? openBooksPath(withBookClosed(books, column))
                : undefined,
            })
          ))
      )
    )
  );
}

function BookColumn({open, active, hrefForPage, hrefForCitingBook, hrefToClose}: {
  open: OpenBook,
  active: boolean,
  hrefForPage: (pageId: number, volume: number) => string,
  hrefForCitingBook: (bookId: string, pageId: number) => string,
  hrefToClose?: string,
}) {
  const navigate = useNavigate();
  const bookId   = open.bookId;

  const bookResult = useQuery(bookQuery(bookId, open.volume, open.pageId));
  const book       = bookResult.data ?? null;
  const error      = bookResult.error?.message ?? null;

  const pageId = open.pageId ?? book?.pageOrder[0]?.pageId;
  const index  = book?.pageOrder.findIndex(p => p.pageId === pageId) ?? -1;
  const prev   = book && index > 0 ? book.pageOrder[index - 1] : undefined;
  const next   = book && index >= 0 ? book.pageOrder[index + 1] : undefined;

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
                __('p', {className: 'error'},
                  book.volumes.length > 0 ? `Volume ${book.volume} of this book` : 'This book',
                  ' has no page ', open.pageId, '.'
                )
              ))
              .otherwise(() => (
                __(BookPageView, {
                  book,
                  pageId: pageId!,
                  index,
                  // a page of the volume open, or of another
                  hrefForPage: (pageId: number, volume: number = book.volume) => (
                    hrefForPage(pageId, volume)
                  ),
                  hrefForCitingBook,
                  hrefToClose,
                  showCitedBy: active,
                })
              ))
          )
        ))
    )
  );
}
