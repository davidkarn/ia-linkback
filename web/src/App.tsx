import { useEffect, useState, createElement as __, Fragment } from 'react'
import { Link, useSearchParams } from 'react-router'
import { fetchBooks, type BookList } from './api'
import { match } from 'ts-pattern';
import { Search } from 'lucide-react';
import { assertCond } from './lib';
import Pager from './Pager';
import './app.scss';

const PAGE_LENGTH = 20
const SEARCH_DELAY_MS = 250

export default function App() {
  // ?q=<search>&page=<1-based page>, so reloading, sharing and the back button keep your place
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const [books, setBooks] = useState<BookList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // what's typed in the search box; searched once typing pauses
  const [draft, setDraft] = useState(query)

  // the URL's search changed (back button, a link): show it, unless it's what's typed already, give or
  // take spaces at the ends
  useEffect(() => { setDraft(d => d.trim() === query ? d : query) }, [query])

  useEffect(() => {
    if (draft.trim() === query) return;
    const timer = setTimeout(() => {
      // a new search starts on page 1; replace, so each keystroke isn't a history entry
      setSearchParams(draft.trim() ? {q: draft.trim()} : {}, {replace: true});
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, query, setSearchParams])

  useEffect(() => {
    // ignore a slow response to a search or page that's since changed
    let current = true;
    setLoading(true);
    fetchBooks({offset: (page - 1) * PAGE_LENGTH, length: PAGE_LENGTH, query})
      .then(list => { if (current) { setBooks(list); setError(null); } })
      .catch((e: Error) => { if (current) setError(e.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [query, page])

  const pageCount = books ? Math.ceil(books.meta.count / PAGE_LENGTH) : 0;
  const goToPage = (n: number) => {
    setSearchParams(query ? {q: query, page: String(n)} : {page: String(n)});
    window.scrollTo({top: 0});
  };

  return (
    __('main', {className: 'home'},
      __('header', {className: 'page-header'},
        __('h1', {}, 'Aurea Tela'),
        __('div', {className: 'spacer'}),
      ),
      __('section', {className: 'page-body' + (loading && books ? ' loading' : '')},
        match<boolean, React.ReactElement>(true)
          .with(!!error, () => __('p', {className: "error"}, "Couldn't load books: ", error))
          .with(!books, () => __('p', {className: "muted"}, 'Loading'))
          .otherwise(() => (
            assertCond(books !== null),
          __(Fragment, {},
            __('div', {className: 'library-toolbar'},
              __('div', {className: 'search-box'},
                __('label', {className: 'search'},
                  __(Search, {size: 18, 'aria-hidden': true}),
                  __('input', {
                    type: 'search',
                    placeholder: 'Search titles and authors',
                    'aria-label': 'Search titles and authors',
                    value: draft,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => (
                      setDraft(e.target.value)
                    ),
                  })
                ),                
              ),
              __('div', {className: 'spacer'}),
              __('div', {className: 'showing-info'},
                match<boolean, string>(true)
                  .with(books.meta.count === 0, () => (
                    query ? 'No books match “' + query + '”.' : 'No books.'
                  ))
                  .with(books.items.length === 0, () => 'No books on this page.')
                  .otherwise(() => (
                    'Showing ' + ((page - 1) * PAGE_LENGTH + 1)
                      + '–' + ((page - 1) * PAGE_LENGTH + books.items.length)
                      + ' of ' + books.meta.count
                      + (query ? ' books matching “' + query + '”.' : ' books.')
                  ))
              ),
              __(Pager, {page, pageCount, onPage: goToPage})
            ),
            __('ol', {className: "bookshelf"},
              books.items.map(book => (
                __('li', {key: book.id, className: 'book'},
                  __(Link, {to: '/books/' + encodeURIComponent(book.id)},
                    __('img', {
                      className: 'book-cover',
                      src: book.coverPhotoPath && '/' + book.coverPhotoPath,
                      title: 'Cover page'
                    })
                  ),
                  __('div', {className: 'book-details'},
                    __('span', {className: "title"},
                      __(Link, {to: '/books/' + encodeURIComponent(book.id)}, book.title)
                    ),
                    __('span', {className: "author"}, book.author),
                    __('span', {className: "pages"}, book.pageCount, ' pages')
                  )
                )
              ))
            ),
          )
          ))
      )
    )
  );
}
