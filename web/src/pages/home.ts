import { useEffect, useState, createElement as __, Fragment } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { booksQuery } from '../queries'
import { match } from 'ts-pattern';
import { Search } from 'lucide-react';
import { assertCond } from '../lib';
import Pager from '../components/pager';
import './home.scss';
import { Header } from '../components/header';
import { useDebouncedCallback } from 'use-debounce';

const PAGE_LENGTH = 20
const SEARCH_DELAY_MS = 250

export default function App() {
  const navigate                        = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get('q') ?? '';
  const page  = Math.max(1, Number(searchParams.get('page')) || 1);

  const booksResult = useQuery({
    ...booksQuery({
      offset: (page - 1) * PAGE_LENGTH,
      length: PAGE_LENGTH,
      query
    }),
    placeholderData: keepPreviousData,
  });
  
  const books   = booksResult.data ?? null;
  const error   = booksResult.error?.message ?? null;
  const loading = booksResult.isFetching;

  const [draft, setDraft] = useState(query)

  useEffect(() => {
    setDraft(d => d.trim() === query ? d : query)
  }, [query]);

  const updateQuery = useDebouncedCallback((query: string) => {
    setSearchParams(query.trim() ? {q: query.trim()} : {}, {replace: true});
  }, SEARCH_DELAY_MS);

  const pageCount = books ? Math.ceil(books.meta.count / PAGE_LENGTH) : 0;
  const goToPage = (n: number) => {
    setSearchParams(
      query ? {q: query, page: String(n)} : {page: String(n)}
    );
    
    window.scrollTo({top: 0});
  };

  return (
    __('main', {className: 'home'},
      __(Header, {}),
      __('section', {className: 'page-body' + (loading && books ? ' loading' : '')},
        match<boolean, React.ReactElement>(true)
          .with(!!error, () => __('p', {className: "error"}, "Couldn't load books: ", error))
          .with(!books, () => __('p', {className: "muted"}, 'Loading'))
          .otherwise(() => (
            assertCond(books !== null),
          __('section', {className: 'home-library'},
            __('div', {className: 'library-header'},
              __('h1', {}, 'Library'),
              __('div', {className: 'library-toolbar'},
                __('div', {className: 'search-box'},
                  __('label', {className: 'search'},
                    __(Search, {size: 18, 'aria-hidden': true}),
                    __('input', {
                      type: 'search',
                      placeholder: 'Search titles and authors',
                      'aria-label': 'Search titles and authors',
                      value: draft,
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                        setDraft(e.target.value);
                        updateQuery(e.target.value);
                      },
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
                )
              ),
            ),
            __('ol', {className: "bookshelf"},
              books.items.map(book => (
                __('li', {key: book.id, className: 'book-card', onClick: () => {
                  navigate('/books/' + encodeURIComponent(book.id));
                }},
                  __('div', {className: 'book-details'},
                    __('span', {className: "title"},
                      __(Link, {to: '/books/' + encodeURIComponent(book.id)}, book.title)
                    ),
                    __('span', {className: "author"}, book.author),
                    __('div', {className: 'spacer'}),
                    __('hr', {}),
                    __('div', {className: 'book-stats'},
                      __('div', {className: 'stat'},
                        __('div', {className: 'stat-label'}, 'pages'),
                        __('span', {}, book.pageCount)
                      ),
                      __('div', {className: 'stat'},
                        __('div', {className: 'stat-label'}, 'cited by'),
                        __('span', {}, book.citedByCount)
                      ),
                    )
                  )
                )
              )),
            ),
            __(Pager, {page, pageCount, onPage: goToPage})
          )
          ))
      )
    )
  );
}
