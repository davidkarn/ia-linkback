// The admin panel's Citations tab (/tl-admin/citations): every citation, by author then title,
// searchable by title, author and raw text, and filtered by whether it's matched to the book it
// cites. The search, filter and page are kept in the URL (?q=&matched=&page=).
import { createElement as __, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { match } from 'ts-pattern'
import { Search } from 'lucide-react'
import { useDebouncedCallback } from 'use-debounce'
import type { AdminCitation, AdminCitationList, CitationMatch } from '../api'
import { adminCitationsQuery } from '../queries'
import Pager from './pager'
import './admin_citations.scss'

const PAGE_LENGTH     = 50;
const SEARCH_DELAY_MS = 250;

const MATCH_FILTERS: { value: CitationMatch, label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'matched', label: 'Matched' },
  { value: 'unmatched', label: 'Not matched' },
];

const matchFrom = (raw: string | null): CitationMatch => (
  MATCH_FILTERS.find((f) => f.value === raw)?.value ?? 'all'
);

export function AdminCitations() {
  const [searchParams, setSearchParams] = useSearchParams();

  const query   = searchParams.get('q') ?? '';
  const matched = matchFrom(searchParams.get('matched'));
  const page    = Math.max(1, Number(searchParams.get('page')) || 1);

  const result = useQuery({
    ...adminCitationsQuery({ query, matched, offset: (page - 1) * PAGE_LENGTH, length: PAGE_LENGTH }),
    placeholderData: keepPreviousData,
  });

  // The URL with these changed; a new search or filter starts again at page 1
  const show = (changes: { q?: string, matched?: CitationMatch, page?: number }) => {
    const next = { q: query, matched, page, ...changes };
    setSearchParams({
      ...(next.q.length > 0 ? { q: next.q } : {}),
      ...(next.matched === 'all' ? {} : { matched: next.matched }),
      ...(next.page > 1 ? { page: String(next.page) } : {}),
    }, { replace: changes.page === undefined });
  };

  // the search box's text: the URL's query, unless what's typed is that query already (with
  // spaces still being typed), updated when the URL's query changes (back, forward, a link)
  const [draft, setDraft]       = useState(query);
  const [draftFor, setDraftFor] = useState(query);
  if (query !== draftFor) {
    setDraftFor(query);
    setDraft((d) => (d.trim() === query ? d : query));
  }

  const search = useDebouncedCallback((q: string) => show({ q: q.trim(), page: 1 }), SEARCH_DELAY_MS);

  return (
    __('div', {className: 'admin-citations' + (result.isPlaceholderData ? ' loading' : '')},
      __('h1', {}, 'Citations'),
      __('div', {className: 'citations-toolbar'},
        __('label', {className: 'citations-search'},
          __(Search, {size: 18, 'aria-hidden': true}),
          __('input', {
            type:         'search',
            placeholder:  'Search titles, authors and citation text',
            'aria-label': 'Search titles, authors and citation text',
            value:        draft,
            onChange:     (e: React.ChangeEvent<HTMLInputElement>) => {
              setDraft(e.target.value);
              search(e.target.value);
            },
          })
        ),
        __('div', {className: 'match-filter', role: 'group', 'aria-label': 'Matched to a book'},
          MATCH_FILTERS.map((f) => (
            __('button', {
              key:            f.value,
              type:           'button',
              className:      f.value === matched ? 'active' : '',
              'aria-pressed': f.value === matched,
              onClick:        () => show({ matched: f.value, page: 1 }),
            }, f.label)
          ))
        )
      ),
      match(result)
        .with({status: 'pending'}, () => __('p', {className: 'muted'}, 'Loading'))
        .with({status: 'error'}, (r) => __('p', {className: 'error'}, "Couldn't load the citations: ", r.error.message))
        .otherwise((r) => __(CitationList, {
          list:   r.data,
          page,
          query,
          onPage: (n: number) => {
            show({ page: n });
            window.scrollTo({top: 0});
          },
        }))
    )
  );
}

function CitationList({list, page, query, onPage}: {
  list: AdminCitationList,
  page: number,
  query: string,
  onPage: (page: number) => void,
}) {
  const pageCount = Math.ceil(list.meta.count / PAGE_LENGTH);
  const first     = (page - 1) * PAGE_LENGTH + 1;

  return (
    __('div', {className: 'citation-results'},
      __('p', {className: 'muted'},
        match<boolean, string>(true)
          .with(list.meta.count === 0, () => (
            query.length > 0 ? `No citations match “${ query }”.` : 'No citations.'
          ))
          .with(list.items.length === 0, () => 'No citations on this page.')
          .otherwise(() => (
            `Showing ${ first.toLocaleString() }–${ (first + list.items.length - 1).toLocaleString() } `
              + `of ${ list.meta.count.toLocaleString() } citations`
              + (query.length > 0 ? ` matching “${ query }”.` : '.')
          ))
      ),
      list.items.length > 0 && __('div', {className: 'citation-table-scroll'},
        __('table', {className: 'citation-table'},
          __('thead', {},
            __('tr', {},
              __('th', {scope: 'col'}, 'Author'),
              __('th', {scope: 'col'}, 'Title'),
              __('th', {scope: 'col'}, 'Location'),
              __('th', {scope: 'col'}, 'Citation'),
              __('th', {scope: 'col'}, 'Cited in'),
              __('th', {scope: 'col'}, 'Matched to'),
            )
          ),
          __('tbody', {},
            list.items.map((c) => __(CitationRow, {key: c.id, citation: c}))
          )
        )
      ),
      pageCount > 1 && __(Pager, {page, pageCount, onPage})
    )
  );
}

function CitationRow({citation: c}: {citation: AdminCitation}) {
  return (
    __('tr', {},
      __('td', {className: 'citation-author'},
        c.author.length > 0 ? c.author : __('span', {className: 'muted'}, 'none')
      ),
      __('td', {className: 'citation-title'},
        c.title.length > 0 ? __('cite', {}, c.title) : __('span', {className: 'muted'}, 'none')
      ),
      __('td', {className: 'citation-location'}, c.location),
      __('td', {className: 'citation-raw'}, c.raw),
      __('td', {className: 'citation-source'},
        __(Link, {to: `/books/${ encodeURIComponent(c.sourceBookId) }/pages/${ c.sourceFootnotePage }`},
          c.sourceBookTitle ?? c.sourceBookId
        )
      ),
      __('td', {className: 'citation-reference'},
        match(c)
          .with({referenceBookId: null}, () => __('span', {className: 'unmatched'}, 'Not matched'))
          .with({referenceBookTitle: null}, () => __('code', {}, c.referenceBookId))
          .otherwise(() => (
            __(Link, {to: `/books/${ encodeURIComponent(c.referenceBookId!) }`}, c.referenceBookTitle)
          ))
      )
    )
  );
}
