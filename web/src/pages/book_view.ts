import { useEffect, useMemo, useRef, useState, createElement as __, Fragment } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { match } from 'ts-pattern';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { type PageOrderEntry } from '../api'
import { bookQuery, pageOrderQuery, pageQuery, pageCitationsQuery } from '../queries'
import { assertCond, useDocumentTitle, useWidthInRem } from '../lib';
import "./book_view.scss"
import BookPager from '../components/book_pager';
import { Header } from '../components/header';
import { BookPageView } from '../components/book_page';
import { openBooksPath, parseOpenBooks, withBookClosed, withBookOpened, withPage, type OpenBook } from '../core/open_books';
import { pagesOnly } from '../core/page_order'
import { collapsedColumns, gridColumns } from '../core/column_layout'

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

  const hrefForPageByCol = useMemo(() => (
    books.reduce((acc, _, column) => ({
      ...acc,
      [column]: (pageId: number, volume: number) => (
        openBooksPath(withPage(books, column, pageId, volume))
      )
    }), {})
  ), [books]);

  // the page's title: the leftmost book's title and author (its column's query, already cached)
  const leftmost      = books[0];
  const leftmostQuery = useQuery({
    ...bookQuery(leftmost?.bookId ?? '', leftmost?.volume, leftmost?.pageId),
    enabled: leftmost !== undefined,
  });
  useDocumentTitle(
    leftmostQuery.data === undefined
      ? null
      : `${ leftmostQuery.data.title } - ${ leftmostQuery.data.author }`
  );

  // the main column: the one expanded by clicking it while collapsed, as long
  // as the same books are open, else the rightmost. The others collapse, the
  // leftmost first, while it would be too narrow (core/column_layout.ts).
  const [expanded, setExpanded] = useState<{ key: string, openKeys: string } | null>(null);
  const openKeys                = keys.join('|');
  const expandedColumn          = expanded?.openKeys === openKeys ? keys.indexOf(expanded.key) : -1;
  const main                    = expandedColumn >= 0 ? expandedColumn : books.length - 1;

  const columnsRef = useRef<HTMLElement>(null);
  const width      = useWidthInRem(columnsRef);
  const collapsed  = width > 0
    ? collapsedColumns(width, books.length, main)
    : books.map(() => false);

  return (
    __('main', {className: 'book-view'},
      __(Header, {}),
      __('section', {
          className:           'page-body book-columns',
          ref:                 columnsRef,
          style:               {gridTemplateColumns: gridColumns(main, collapsed)},
        },
        books.length === 0
          ? __('p', {className: 'muted'}, 'No book is open.')
          : books.map((open, column) => (
            __(BookColumn, {
              key: keys[column],
              open,
              active: column === main,
              collapsed: collapsed[column] ?? false,
              expand: () => setExpanded({ key: keys[column]!, openKeys }),
              hrefForPage: hrefForPageByCol[column],
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

function BookColumn({
  open, active, collapsed, expand, hrefForPage, hrefForCitingBook, hrefToClose,
}: {
  open: OpenBook,
  // the main column, which shows its page's citations
  active: boolean,
  // only the book's title, sideways, in a slim column; clicking it expands it
  collapsed: boolean,
  expand: () => void,
  hrefForPage: (pageId: number, volume: number) => string,
  hrefForCitingBook: (bookId: string, pageId: number) => string,
  hrefToClose?: string,
}) {
  const navigate = useNavigate();
  const bookId   = open.bookId;

  const bookResult = useQuery(bookQuery(bookId, open.volume, open.pageId));
  const error      = bookResult.error?.message ?? null;

  // the book's pageOrder comes without citation counts (a placeholder), replaced by the counted
  // one once it loads
  const fetched   = bookResult.data ?? null;
  const counted   = useQuery({
    ...pageOrderQuery(bookId, fetched?.volume ?? 1),
    enabled: fetched !== null,
  });
  const book      = useMemo(() => (
    fetched !== null && counted.data !== undefined
      ? {...fetched, pageOrder: counted.data.pageOrder}
      : fetched
  ), [fetched, counted.data]);

  const pages       = book === null ? [] : pagesOnly(book.pageOrder);
  const pageId      = open.pageId ?? pages[0]?.pageId ?? 1;
  const index       = pages.findIndex(p => p.pageId === pageId);
  const prev        = index > 0 ? pages[index - 1] : undefined;
  const next        = index >= 0 ? pages[index + 1] : undefined;
  const showCitedBy = active;

  const pageResult = useQuery({
    ...pageQuery(bookId, pageId),
    placeholderData: keepPreviousData
  });

  const citationsResult  = useQuery({
    ...pageCitationsQuery(bookId, pageId),
    enabled: showCitedBy
  });  

  return (
    __('div', {className: 'book-column' + (collapsed ? ' collapsed' : '')},
      match<boolean, React.ReactElement>(true)
        .with(collapsed, () => (
          __('button', {
            type:         'button',
            className:    'collapsed-title',
            title:        book?.title ?? '',
            'aria-label': 'Expand ' + (book?.title ?? 'this book'),
            onClick:      expand,
          },
            __('span', {}, book?.title ?? '')
          )
        ))
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
                  pageResult,
                  citationsResult,
                  hrefForCitingBook,
                  hrefToClose,
                  showCitedBy,
                })
              ))
          )
        ))
    )
  );
}
