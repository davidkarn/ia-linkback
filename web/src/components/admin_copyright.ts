// The admin panel's Copyright tab (/tl-admin/copyright): every book with its latest copyright
// status check, by title, or, from a column's header, by status (the most likely in the public
// domain first) or by when it was last checked. Searchable by title and author and filtered by
// status (or never checked); a book's status can be set by hand from its row. Books likely
// copyrighted are left out of the library's searches. The search, filter, sort and page are kept
// in the URL (?q=&status=&sort=&page=).
import { createElement as __ } from 'react'
import { Link, useSearchParams } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { match } from 'ts-pattern'
import {
  COPYRIGHT_STATUSES, setAdminBookCopyright,
  type AdminBookCopyright, type AdminBookCopyrightList, type CopyrightFilter, type CopyrightSort,
  type CopyrightStatus,
} from '../api'
import { adminBookCopyrightsQuery } from '../queries'
import { COPYRIGHT_LABELS, MANUAL_NOTES } from '../core/copyright'
import { formatDateTime } from '../lib'
import Pager from './pager'
import { AdminSearch } from './admin_search'
import { AdminSortHeader } from './admin_sort_header'
import './admin_copyright.scss'

const PAGE_LENGTH = 50;

const FILTERS: CopyrightFilter[] = ['all', 'unchecked', ...COPYRIGHT_STATUSES];

const filterFrom = (raw: string | null): CopyrightFilter => FILTERS.find((f) => f === raw) ?? 'all';

const SORTS: CopyrightSort[] = ['title', 'status', 'checked'];

const sortFrom = (raw: string | null): CopyrightSort => SORTS.find((s) => s === raw) ?? 'title';

const statusFrom = (raw: string): CopyrightStatus | undefined => (
  COPYRIGHT_STATUSES.find((s) => s === raw)
);

export function AdminCopyright() {
  const [searchParams, setSearchParams] = useSearchParams();

  const query  = searchParams.get('q') ?? '';
  const status = filterFrom(searchParams.get('status'));
  const sort   = sortFrom(searchParams.get('sort'));
  const page   = Math.max(1, Number(searchParams.get('page')) || 1);

  const result = useQuery({
    ...adminBookCopyrightsQuery({
      query, status, sort, offset: (page - 1) * PAGE_LENGTH, length: PAGE_LENGTH,
    }),
    placeholderData: keepPreviousData,
  });

  // The URL with these changed; a new search, filter or sort starts again at page 1
  const show = (changes: {
    q?: string, status?: CopyrightFilter, sort?: CopyrightSort, page?: number,
  }) => {
    const next = { q: query, status, sort, page, ...changes };
    setSearchParams({
      ...(next.q.length > 0 ? { q: next.q } : {}),
      ...(next.status === 'all' ? {} : { status: next.status }),
      ...(next.sort === 'title' ? {} : { sort: next.sort }),
      ...(next.page > 1 ? { page: String(next.page) } : {}),
    }, { replace: changes.page === undefined });
  };

  return (
    __('div', {className: 'admin-copyright' + (result.isPlaceholderData ? ' loading' : '')},
      __('h1', {}, 'Copyright'),
      __('p', {className: 'muted'},
        'Books likely copyrighted are left out of the library\'s searches.'
      ),
      __('div', {className: 'copyright-toolbar'},
        __(AdminSearch, {
          query,
          placeholder: 'Search titles and authors',
          onSearch:    (q: string) => show({ q, page: 1 }),
        }),
        __('label', {className: 'status-filter'},
          'Status',
          __('select', {
            value:    status,
            onChange: (e: React.ChangeEvent<HTMLSelectElement>) => (
              show({ status: filterFrom(e.target.value), page: 1 })
            ),
          },
            __('option', {value: 'all'}, 'All'),
            __('option', {value: 'unchecked'}, 'Not checked'),
            COPYRIGHT_STATUSES.map((s) => __('option', {key: s, value: s}, COPYRIGHT_LABELS[s]))
          )
        )
      ),
      match(result)
        .with({status: 'pending'}, () => __('p', {className: 'muted'}, 'Loading'))
        .with({status: 'error'}, (r) => (
          __('p', {className: 'error'}, "Couldn't load the books: ", r.error.message)
        ))
        .otherwise((r) => __(CopyrightTable, {
          list:   r.data,
          page,
          query,
          sort,
          onSort: (s: CopyrightSort) => show({ sort: s, page: 1 }),
          onPage: (n: number) => {
            show({ page: n });
            window.scrollTo({top: 0});
          },
        }))
    )
  );
}

function CopyrightTable({list, page, query, sort, onSort, onPage}: {
  list: AdminBookCopyrightList,
  page: number,
  query: string,
  sort: CopyrightSort,
  onSort: (sort: CopyrightSort) => void,
  onPage: (page: number) => void,
}) {
  const pageCount = Math.ceil(list.meta.count / PAGE_LENGTH);
  const first     = (page - 1) * PAGE_LENGTH + 1;
  const header    = (label: string, sortBy?: CopyrightSort, ascending = false, title?: string) => (
    __(AdminSortHeader<CopyrightSort>, {
      label, sort, onSort,
      ...(sortBy === undefined ? {} : { sortBy, ascending, ...(title ? { title } : {}) }),
    })
  );

  return (
    __('div', {className: 'copyright-results'},
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
      list.items.length > 0 && __('div', {className: 'copyright-table-scroll'},
        __('table', {className: 'copyright-table'},
          __('thead', {},
            __('tr', {},
              header('Title', 'title', true, 'Sort by title, A to Z'),
              header('Author'),
              header('Status', 'status', true,
                'Sort by status, the most likely in the public domain first'),
              header('Notes'),
              header('Checked', 'checked', false, 'Sort by when last checked, the latest first'),
              header('In searches'),
            )
          ),
          __('tbody', {},
            list.items.map((book) => __(CopyrightRow, {key: book.bookId, book}))
          )
        )
      ),
      pageCount > 1 && __(Pager, {page, pageCount, onPage})
    )
  );
}

// A book's row; its status is a menu, which sets it by hand
function CopyrightRow({book}: {book: AdminBookCopyright}) {
  const queryClient = useQueryClient();

  const setStatus = useMutation({
    mutationFn: (status: CopyrightStatus) => setAdminBookCopyright(book.bookId, status, MANUAL_NOTES),
    onSuccess:  () => queryClient.invalidateQueries({queryKey: ['admin', 'bookCopyrights']}),
  });

  return (
    __('tr', {className: book.shownInSearches ? '' : 'hidden-from-searches'},
      __('td', {className: 'copyright-title'},
        __(Link, {to: `/books/${ encodeURIComponent(book.bookId) }`}, book.title)
      ),
      __('td', {className: 'copyright-author'}, book.author),
      __('td', {className: 'copyright-status'},
        __('select', {
          value:        book.status ?? '',
          disabled:     setStatus.isPending,
          'aria-label': `Copyright status of ${ book.title }`,
          className:    'status-' + (book.status ?? 'unchecked'),
          onChange:     (e: React.ChangeEvent<HTMLSelectElement>) => {
            const status = statusFrom(e.target.value);
            if (status !== undefined) {
              setStatus.mutate(status);
            }
          },
        },
          book.status === null && __('option', {value: '', disabled: true}, 'Not checked'),
          COPYRIGHT_STATUSES.map((s) => __('option', {key: s, value: s}, COPYRIGHT_LABELS[s]))
        ),
        setStatus.isError && __('p', {className: 'error'}, setStatus.error.message)
      ),
      __('td', {className: 'copyright-notes'},
        book.manual && __('span', {className: 'manual-badge'}, 'Set by hand'),
        book.notes !== null && book.notes !== MANUAL_NOTES && book.notes
      ),
      __('td', {className: 'copyright-time'},
        book.checkedAt === null
          ? __('span', {className: 'muted'}, '—')
          : __('time', {dateTime: book.checkedAt, title: book.checkedAt},
            formatDateTime(book.checkedAt)
          )
      ),
      __('td', {className: 'copyright-shown'}, book.shownInSearches ? 'Yes' : 'No'),
    )
  );
}
