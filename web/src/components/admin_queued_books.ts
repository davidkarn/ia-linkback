// The admin panel's Queued books tab (/tl-admin/queued-books): the books queued for import, by
// status in the order a book goes through them, or, from a column's header, by when they were
// added or last updated, the latest first; then in queue order. Searchable by title and author,
// and filtered by status. The search, filter, sort and page are kept in the URL
// (?q=&status=&sort=&page=).
import { createElement as __ } from 'react'
import { Link, useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { match } from 'ts-pattern'
import type { AdminQueuedBookList, QueuedBookSort, QueueStatus } from '../api'
import { adminQueuedBooksQuery } from '../queries'
import { QUEUE_STATUSES, STATUS_LABELS } from '../core/queued_books'
import { formatDateTime } from '../lib'
import Pager from './pager'
import { AdminSearch } from './admin_search'
import { AdminSortHeader } from './admin_sort_header'
import './admin_queued_books.scss'
import { LoadingSpinner } from './loading_spinner'

const PAGE_LENGTH = 50;

type StatusFilter = QueueStatus | 'all';

const statusFrom = (raw: string | null): StatusFilter => (
  QUEUE_STATUSES.find((s) => s === raw) ?? 'all'
);

const SORTS: QueuedBookSort[] = ['status', 'created', 'updated'];

const sortFrom = (raw: string | null): QueuedBookSort => SORTS.find((s) => s === raw) ?? 'status';

export function AdminQueuedBooks() {
  const [searchParams, setSearchParams] = useSearchParams();

  const query  = searchParams.get('q') ?? '';
  const status = statusFrom(searchParams.get('status'));
  const sort   = sortFrom(searchParams.get('sort'));
  const page   = Math.max(1, Number(searchParams.get('page')) || 1);

  const result = useQuery({
    ...adminQueuedBooksQuery({
      query, status, sort, offset: (page - 1) * PAGE_LENGTH, length: PAGE_LENGTH,
    }),
    placeholderData: keepPreviousData,
  });

  // The URL with these changed; a new search, filter or sort starts again at page 1
  const show = (changes: {
    q?: string, status?: StatusFilter, sort?: QueuedBookSort, page?: number,
  }) => {
    const next = { q: query, status, sort, page, ...changes };
    setSearchParams({
      ...(next.q.length > 0 ? { q: next.q } : {}),
      ...(next.status === 'all' ? {} : { status: next.status }),
      ...(next.sort === 'status' ? {} : { sort: next.sort }),
      ...(next.page > 1 ? { page: String(next.page) } : {}),
    }, { replace: changes.page === undefined });
  };

  return (
    __('div', {className: 'admin-queued-books' + (result.isPlaceholderData ? ' loading' : '')},
      __('h1', {}, 'Queued books'),
      __('div', {className: 'queued-books-toolbar'},
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
              show({ status: statusFrom(e.target.value), page: 1 })
            ),
          },
            __('option', {value: 'all'}, 'All'),
            QUEUE_STATUSES.map((s) => __('option', {key: s, value: s}, STATUS_LABELS[s]))
          )
        )
      ),
      match(result)
        .with({status: 'pending'}, () => __(LoadingSpinner, {}))
        .with({status: 'error'}, (r) => (
          __('p', {className: 'error'}, "Couldn't load the queued books: ", r.error.message)
        ))
        .otherwise((r) => __(QueuedBookTable, {
          list:   r.data,
          page,
          query,
          sort,
          onSort: (s: QueuedBookSort) => show({ sort: s, page: 1 }),
          onPage: (n: number) => {
            show({ page: n });
            window.scrollTo({top: 0});
          },
        }))
    )
  );
}

function QueuedBookTable({list, page, query, sort, onSort, onPage}: {
  list: AdminQueuedBookList,
  page: number,
  query: string,
  sort: QueuedBookSort,
  onSort: (sort: QueuedBookSort) => void,
  onPage: (page: number) => void,
}) {
  const pageCount = Math.ceil(list.meta.count / PAGE_LENGTH);
  const first     = (page - 1) * PAGE_LENGTH + 1;
  const header    = (label: string, sortBy?: QueuedBookSort, title?: string) => (
    __(AdminSortHeader<QueuedBookSort>, {
      label, sort, onSort,
      ...(sortBy === undefined ? {} : {
        sortBy, ascending: sortBy === 'status', ...(title ? { title } : {}),
      }),
    })
  );

  return (
    __('div', {className: 'queued-book-results'},
      __('p', {className: 'muted'},
        match<boolean, string>(true)
          .with(list.meta.count === 0, () => (
            query.length > 0 ? `No queued books match “${ query }”.` : 'No queued books.'
          ))
          .with(list.items.length === 0, () => 'No queued books on this page.')
          .otherwise(() => (
            `Showing ${ first }–${ first + list.items.length - 1 } of ${ list.meta.count } `
              + 'queued books'
              + (query.length > 0 ? ` matching “${ query }”.` : '.')
          ))
      ),
      list.items.length > 0 && __('div', {className: 'queued-book-table-scroll'},
        __('table', {className: 'queued-book-table'},
          __('thead', {},
            __('tr', {},
              __('th', {scope: 'col', className: 'numeric'}, '#'),
              header('Status', 'status', 'Sort by status, in the order a book goes through them'),
              header('Title'),
              header('Author'),
              header('Imported as'),
              header('Added', 'created', 'Sort by when they were added, the latest first'),
              header('Updated', 'updated', 'Sort by when they last changed, the latest first'),
            )
          ),
          __('tbody', {},
            list.items.map((b) => (
              __('tr', {key: b.id},
                __('td', {className: 'numeric queue-id'}, b.id),
                __('td', {className: 'queue-status'},
                  __('span', {className: 'status-badge status-' + b.status},
                    STATUS_LABELS[b.status]
                  )
                ),
                __('td', {className: 'queued-title'},
                  b.archiveUrl
                    ? __('a', {
                      href:   b.archiveUrl,
                      target: '_blank',
                      rel:    'noreferrer',
                      title:  'On archive.org',
                    }, b.title)
                    : b.title
                ),
                __('td', {className: 'queued-author'}, b.author),
                __('td', {className: 'imported-as'},
                  b.importedBookId === null
                    ? __('span', {className: 'muted'}, '—')
                    : __(Link, {to: `/books/${ encodeURIComponent(b.importedBookId) }`},
                      b.importedBookTitle ?? b.importedBookId
                    )
                ),
                __('td', {className: 'queue-time'},
                  __('time', {dateTime: b.createdAt, title: b.createdAt},
                    formatDateTime(b.createdAt)
                  )
                ),
                __('td', {className: 'queue-time'},
                  __('time', {dateTime: b.updatedAt, title: b.updatedAt},
                    formatDateTime(b.updatedAt)
                  )
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
