import { useEffect, useMemo, useRef, useState, createElement as __, Fragment } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { match } from 'ts-pattern';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchBook, fetchBooks, fetchPage, type Book, type BookPage, type Citation, type PageBlock, type PageCitation, type PageOrderEntry } from '../api'
import { assertCond } from '../lib';
import "./book_view.scss"
import BookPager from '../components/book_pager';
import { Header } from '../components/header';
import { BookPageView } from '../components/book_page';

// "p. 12" when the page has a printed number, else its position in the scan: "[scan 3]"
const pageLabel = (entry: PageOrderEntry) =>
  entry.printedPageNumber ? 'p. ' + entry.printedPageNumber : '[scan ' + entry.pageId + ']';


// [{page 42}, {page 43}, {page 44}, {chapter 2}] -> "p. 42–44, ch. 2"


// Titles of every book, for naming the books that cite a page. Fetched once.

export default function BookView() {
  const params = useParams();
  const navigate = useNavigate();
  const bookId = params.bookId!;

  const [book, setBook] = useState<Book | null>(null)
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
  const pageId = params.pageId ? Number(params.pageId) : book?.pageOrder[0]?.pageId;
  const index = book?.pageOrder.findIndex(p => p.pageId === pageId) ?? -1;
  const goTo = (entry: PageOrderEntry | undefined) => {
    if (entry) navigate('/books/' + encodeURIComponent(bookId) + '/pages/' + entry.pageId);
  };
  const prev = book && index > 0 ? book.pageOrder[index - 1] : undefined;
  const next = book && index >= 0 ? book.pageOrder[index + 1] : undefined;

  // ← / → turn the page
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowLeft') goTo(prev);
      if (e.key === 'ArrowRight') goTo(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  })

  return (
    __('main', {className: 'book-view'},
      __(Header, {}),
      __('section', {className: 'page-body'},

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
                __('p', {className: 'error'}, 'This book has no page ', params.pageId, '.')
              ))
              .otherwise(() => (
                __(BookPageView, {book, pageId: pageId!, index})
              ))
          )
        ))
      )
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

