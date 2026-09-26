import { useEffect, useState, createElement as __, Fragment } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { match } from 'ts-pattern';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchBook, fetchBooks, fetchPage, type Book, type BookPage, type Citation, type PageBlock, type PageOrderEntry } from './api'
import { assertCond } from './lib';
import "./BookView.scss"
import BookPager from './BookPager';

// "p. 12" when the page has a printed number, else its position in the scan: "[scan 3]"
const pageLabel = (entry: PageOrderEntry) =>
  entry.printedPageNumber ? 'p. ' + entry.printedPageNumber : '[scan ' + entry.pageId + ']';

const LOCATION_LABELS: Record<string, string> = {
  page: 'p.', chapter: 'ch.', book: 'bk.', volume: 'vol.', question: 'q.', article: 'a.',
  lecture: 'lect.', position: '§', verse: 'v.', part: 'pt.',
};

// [{page 42}, {page 43}, {page 44}, {chapter 2}] -> "p. 42–44, ch. 2"
const formatLocations = (locations: Citation['locationsCited']): string => {
  const groups: { type: string, values: number[] }[] = [];
  for (const loc of locations) {
    const last = groups[groups.length - 1];
    if (last && last.type === loc.type) last.values.push(loc.value);
    else groups.push({ type: loc.type, values: [loc.value] });
  }

  return groups.map(g => {
    const ranges: string[] = [];
    for (let i = 0; i < g.values.length; i++) {
      let j = i;
      while (j + 1 < g.values.length && g.values[j + 1] === g.values[j]! + 1) j++;
      ranges.push(j > i ? g.values[i] + '–' + g.values[j] : String(g.values[i]));
      i = j;
    }
    return (LOCATION_LABELS[g.type] ?? g.type) + ' ' + ranges.join(', ');
  }).join(', ');
};

// Titles of every book, for naming the books that cite a page. Fetched once.
let bookTitles: Promise<Map<string, string>> | null = null;
const useBookTitles = () => {
  const [titles, setTitles] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    bookTitles ??= fetchBooks({ length: 100 })
      .then(list => new Map(list.items.map(b => [b.id, b.title])));
    bookTitles.then(setTitles).catch(() => {});
  }, []);

  return titles;
};

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
      __('header', {className: 'page-header'},
        __(Link, {
          className: 'back-icon', to: '/',
          'aria-label': 'All books',
          title: 'All books'
        },
          __(ArrowLeft, {size: '1em', 'aria-hidden': true})
        ),
        book && (
          __('div', {className: 'header-with-subheader'},
            __('h1', {}, book?.title),
            __('div', {className: 'subheading'}, book.author)
          ) 
        ),
        __('div', {className: 'spacer'}),
        __(Link, {className: 'site-name', to: '/'}, 'Aurea tela'),
      ),
      __('section', {className: 'page-body'},

      match<boolean, React.ReactElement>(true)
        .with(!!error, () => __('p', {className: "error"}, "Couldn't load this book: ", error))
        .with(!book, () => __('p', {className: "muted"}, 'Loading'))
        .otherwise(() => (
          assertCond(book !== null),
          __('div', {className: 'book-page-view'},
            __(BookPager, {pages: book.pageOrder, bookId: book.id}),

            match<boolean, React.ReactElement>(true)
              .with(book.pageOrder.length === 0, () => (
                __('p', {className: 'muted'}, 'This book has no pages.')
              ))
              .with(index < 0, () => (
                __('p', {className: 'error'}, 'This book has no page ', params.pageId, '.')
              ))
              .otherwise(() => (
                __(PageView, {bookId, pageId: pageId!, allPages: book.pageOrder})
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
  const [page, setPage] = useState<BookPage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // ignore a slow response for a page we've already turned past
    let current = true;
    setError(null);
    fetchPage(bookId, pageId)
      .then(p => { if (current) setPage(p); })
      .catch((e: Error) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [bookId, pageId])

  // keep showing the previous page, dimmed, until the next one arrives
  const loading = !page || page.bookId !== bookId || page.pageNumber !== pageId;

  const headerBlocks = page?.blocks.filter((block) => block.label === 'PageHeader') ?? [];
  const bodyBlocks   = page?.blocks.filter((block) => block.label !== 'PageHeader') ?? [];

  const thisPageIndex = allPages.findIndex(p => p.pageId === pageId);
  const nextPage = thisPageIndex && thisPageIndex < allPages.length - 1 && (
    '/books/' + encodeURIComponent(bookId) + '/pages/' + allPages[thisPageIndex + 1].pageId
  );
  const prevPage = thisPageIndex && thisPageIndex > 0 && (
    '/books/' + encodeURIComponent(bookId) + '/pages/' + allPages[thisPageIndex - 1].pageId 
  );

  return (
    match<boolean, React.ReactElement>(true)
      .with(!!error, () => __('p', {className: "error"}, "Couldn't load this page: ", error))
      .with(!page, () => __('p', {className: "muted"}, 'Loading'))
      .otherwise(() => (
        assertCond(page !== null),
        
        __('div', {className: 'page-layout' + (loading ? ' loading' : '')},
          __('article', {className: 'page'},
            __('div', {className: 'page-header'},
              headerBlocks.map((block) => (
                __('div', {className: 'page-header-item'},
                  __('div', {dangerouslySetInnerHTML: {__html: block.html}}),
                )
              )),
              __('div', {className: 'spacer'}),
              __('div', {className: 'pager-buttons'},
                prevPage && (
                  __('div', {className: 'pager-button'},
                    __(Link, {to: prevPage}, __(ChevronLeft, {}))
                  )
                ),
                nextPage && (
                  __('div', {className: 'pager-button'},
                    __(Link, {to: nextPage}, __(ChevronRight, {}))
                  )
                )
              ),
            ),
            page.blocks.length === 0
              ? __('p', {className: 'muted'}, 'No text on this page.')
              : bodyBlocks.map((block, i) => __(Block, {key: i, block}))
          ),
          __('aside', {className: 'cited-by'},
            __('h2', {}, 'Cited by'),
            page.foreignCitations.length === 0
              ? __('p', {className: 'muted'}, 'No other books in the collection cite this page.')
              : __('ul', {}, page.foreignCitations.map(c => __(CitedBy, {key: c.id, citation: c})))
          )
        )
      ))
  );
}

// The block's HTML is the OCR output: formatting tags only (p, i, sup, tables, ...).
function Block({block}: {block: PageBlock}) {
  return (
    __('div', {className: 'block block-' + block.label},
      __('div', {dangerouslySetInnerHTML: {__html: block.html}}),
      block.citations.length > 0 && __('ul', {className: 'citations'},
        block.citations.map(c => (
          __('li', {key: c.id},
            c.author && __('span', {className: 'author'}, c.author, ', '),
            __('cite', {}, c.title),
            c.locationsCited.length > 0 && ', ' + formatLocations(c.locationsCited)
          )
        ))
      )
    )
  );
}

function CitedBy({citation}: {citation: Citation}) {
  const titles = useBookTitles();
  const source = citation.source;

  return (
    __('li', {},
      __(Link, {to: '/books/' + encodeURIComponent(source.bookId) + '/pages/' + source.footnotePage},
        __('cite', {}, titles.get(source.bookId) ?? source.bookId)
      ),
      __('div', {className: 'muted'},
        'footnote ' + source.footnoteIdentifier,
        citation.locationsCited.length > 0 && ' · cites ' + formatLocations(citation.locationsCited)
      )
    )
  );
}
