import { createElement as __ } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { match } from 'ts-pattern';
import { authorsQuery } from '../queries'
import { assertCond, useDocumentTitle } from '../lib';
import { Header } from '../components/header';
import Pager from '../components/pager';
import { SearchBox, useSearchQuery } from '../components/search_box';
import './home.scss';
import './authors.scss';

export const authorPath = (authorId: string) => '/authors/' + encodeURIComponent(authorId);

const PAGE_LENGTH = 25

// The authors with books in the collection, a card each, by name; searchable (?q=) by any of the
// names they go by, and paged (?page=), PAGE_LENGTH a page. A card opens the author's books
// (AuthorPage).
export default function AuthorsPage() {
  const navigate                        = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query                           = useSearchQuery();
  const page                            = Math.max(1, Number(searchParams.get('page')) || 1);

  const result  = useQuery({
    ...authorsQuery({offset: (page - 1) * PAGE_LENGTH, length: PAGE_LENGTH, query}),
    placeholderData: keepPreviousData,
  });
  const authors = result.data ?? null;
  const error   = result.error?.message ?? null;

  useDocumentTitle('Tela Lucis - By author');

  const pageCount = authors ? Math.ceil(authors.meta.count / PAGE_LENGTH) : 0;
  const goToPage  = (n: number) => {
    setSearchParams(query ? {q: query, page: String(n)} : {page: String(n)});
    window.scrollTo({top: 0});
  };

  return (
    __('main', {className: 'home authors'},
      __(Header, {}),
      __('section', {className: 'page-body' + (result.isFetching && authors ? ' loading' : '')},
        __('section', {className: 'home-library'},
          __('div', {className: 'library-header'},
            __('h1', {}, 'By author'),
            __('div', {className: 'library-toolbar'},
              __(SearchBox, {label: 'Search authors'}),
              __('div', {className: 'spacer'}),
              authors && __('div', {className: 'showing-info'},
                match<boolean, string>(true)
                  .with(authors.meta.count === 0, () => (
                    query ? 'No authors match “' + query + '”.' : 'No authors.'
                  ))
                  .with(authors.items.length === 0, () => 'No authors on this page.')
                  .otherwise(() => (
                    'Showing ' + ((page - 1) * PAGE_LENGTH + 1)
                      + '–' + ((page - 1) * PAGE_LENGTH + authors.items.length)
                      + ' of ' + authors.meta.count
                      + (query ? ' authors matching “' + query + '”.' : ' authors.')
                  ))
              )
            ),
          ),
          match<boolean, React.ReactElement>(true)
            .with(!!error, () => __('p', {className: "error"}, "Couldn't load authors: ", error))
            .with(!authors, () => __('p', {className: "muted"}, 'Loading'))
            .otherwise(() => (
              assertCond(authors !== null),
              __('ol', {className: 'author-cards'},
                authors.items.map((author) => (
                  __('li', {
                    key:       author.id,
                    className: 'author-card',
                    onClick:   () => navigate(authorPath(author.id)),
                  },
                    __(Link, {className: 'author-name', to: authorPath(author.id)}, author.name),
                    __('div', {className: 'spacer'}),
                    __('hr', {}),
                    __('div', {className: 'author-stats'},
                      __('div', {className: 'stat'},
                        __('div', {className: 'stat-label'}, 'books'),
                        __('span', {}, author.bookCount)
                      ),
                      __('div', {className: 'stat'},
                        __('div', {className: 'stat-label'}, 'cited by'),
                        __('span', {}, author.citedByCount)
                      ),
                    )
                  )
                ))
              )
            )),
          __(Pager, {page, pageCount, onPage: goToPage})
        )
      )
    )
  );
}
