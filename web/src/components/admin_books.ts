// The admin panel's Books tab (/tl-admin/books): every book with the citations to it, the citations
// in its own footnotes, and how many of those aren't matched to the book they cite. Searchable by
// title and author; sorted by title, or, from a column's header, by either count from the book,
// the most first. The search, sort and page are kept in the URL (?q=&sort=&page=).
import { createElement as __ } from 'react'
import { Link, useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { match } from 'ts-pattern'
import { ArrowDown } from 'lucide-react'
import type { AdminBookList, BookSort } from '../api'
import { adminBooksQuery } from '../queries'
import Pager from './pager'
import { AdminSearch } from './admin_search'
import './admin_books.scss'

const PAGE_LENGTH = 50;

const SORTS: BookSort[] = ['title', 'citationsFrom', 'unmatchedFrom'];

const sortFrom = (raw: string | null): BookSort => SORTS.find((s) => s === raw) ?? 'title';

export function AdminBooks() {
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get('q') ?? '';
  const sort  = sortFrom(searchParams.get('sort'));
  const page  = Math.max(1, Number(searchParams.get('page')) || 1);

  const result = useQuery({
    ...adminBooksQuery({ query, sort, offset: (page - 1) * PAGE_LENGTH, length: PAGE_LENGTH }),
    placeholderData: keepPreviousData,
  });

  // The URL with these changed; a new search or sort starts again at page 1
  const show = (changes: { q?: string, sort?: BookSort, page?: number }) => {
    const next = { q: query, sort, page, ...changes };
    setSearchParams({
      ...(next.q.length > 0 ? { q: next.q } : {}),
      ...(next.sort === 'title' ? {} : { sort: next.sort }),
      ...(next.page > 1 ? { page: String(next.page) } : {}),
    }, { replace: changes.page === undefined });
  };

  return (
    __('div', {className: 'admin-books' + (result.isPlaceholderData ? ' loading' : '')},
      __('h1', {}, 'Books'),
      __('div', {className: 'books-toolbar'},
        __(AdminSearch, {
          query,
          placeholder: 'Search titles and authors',
          onSearch:    (q: string) => show({ q, page: 1 }),
        })
      ),
      match(result)
        .with({status: 'pending'}, () => __('p', {className: 'muted'}, 'Loading'))
        .with({status: 'error'}, (r) => __('p', {className: 'error'}, "Couldn't load the books: ", r.error.message))
        .otherwise((r) => __(BookTable, {
          list:   r.data,
          page,
          query,
          sort,
          onSort: (s: BookSort) => show({ sort: s, page: 1 }),
          onPage: (n: number) => {
            show({ page: n });
            window.scrollTo({top: 0});
          },
        }))
    )
  );
}

// A column header: a button sorting by it, when it has a sort
function Header({label, sortBy, sort, onSort, numeric = false}: {
  label: string,
  sortBy?: BookSort,
  sort: BookSort,
  onSort: (sort: BookSort) => void,
  numeric?: boolean,
}) {
  const sorted = sortBy !== undefined && sortBy === sort;

  return (
    __('th', {
      scope:       'col',
      className:   numeric ? 'numeric' : '',
      'aria-sort': sorted ? (sortBy === 'title' ? 'ascending' : 'descending') : undefined,
    },
      sortBy === undefined
        ? label
        : __('button', {
          type:      'button',
          className: 'sort-button' + (sorted ? ' sorted' : ''),
          title:     sortBy === 'title' ? 'Sort by title' : `Sort by ${ label.toLowerCase() }, the most first`,
          onClick:   () => onSort(sortBy),
        },
          label,
          sorted && __(ArrowDown, {size: 14, 'aria-hidden': true})
        )
    )
  );
}

function BookTable({list, page, query, sort, onSort, onPage}: {
  list: AdminBookList,
  page: number,
  query: string,
  sort: BookSort,
  onSort: (sort: BookSort) => void,
  onPage: (page: number) => void,
}) {
  const pageCount = Math.ceil(list.meta.count / PAGE_LENGTH);
  const first     = (page - 1) * PAGE_LENGTH + 1;
  const header    = (label: string, sortBy?: BookSort, numeric = false) => (
    __(Header, {label, sort, onSort, numeric, ...(sortBy === undefined ? {} : {sortBy})})
  );

  return (
    __('div', {className: 'book-results'},
      __('p', {className: 'muted'},
        match<boolean, string>(true)
          .with(list.meta.count === 0, () => (
            query.length > 0 ? `No books match “${ query }”.` : 'No books.'
          ))
          .with(list.items.length === 0, () => 'No books on this page.')
          .otherwise(() => (
            `Showing ${ first }–${ first + list.items.length - 1 } of ${ list.meta.count } books`
              + (query.length > 0 ? ` matching “${ query }”.` : '.')
          ))
      ),
      list.items.length > 0 && __('div', {className: 'book-table-scroll'},
        __('table', {className: 'book-table'},
          __('thead', {},
            __('tr', {},
              header('Title', 'title'),
              header('Author'),
              header('Citations to', undefined, true),
              header('Citations from', 'citationsFrom', true),
              header('Unmatched from', 'unmatchedFrom', true),
            )
          ),
          __('tbody', {},
            list.items.map((b) => (
              __('tr', {key: b.id},
                __('td', {className: 'book-title'},
                  __(Link, {to: `/books/${ encodeURIComponent(b.id) }`}, b.title)
                ),
                __('td', {className: 'book-author'}, b.author),
                __('td', {className: 'numeric'}, b.citationsTo.toLocaleString()),
                __('td', {className: 'numeric'}, b.citationsFrom.toLocaleString()),
                __('td', {className: 'numeric' + (b.unmatchedFrom === 0 ? ' none' : '')},
                  b.unmatchedFrom === 0
                    ? '0'
                    : __(Link, {
                      to:    `/tl-admin/citations?book=${ encodeURIComponent(b.id) }&matched=unmatched`,
                      title: `Show the unmatched citations in ${ b.title }`,
                    }, b.unmatchedFrom.toLocaleString())
                ),
              )
            ))
          )
        )
      ),
      pageCount > 1 && __(Pager, {page, pageCount, onPage})
    )
  );
}
