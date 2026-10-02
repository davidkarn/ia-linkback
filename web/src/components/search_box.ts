import { useEffect, useState, createElement as __ } from 'react'
import { useSearchParams } from 'react-router'
import { Search } from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';

const SEARCH_DELAY_MS = 250

// The page's search: its ?q= parameter, '' when there's none
export const useSearchQuery = (): string => {
  const [searchParams] = useSearchParams();
  return searchParams.get('q') ?? '';
};

// A search box for the page's ?q= parameter (see useSearchQuery): typing sets it after a pause,
// starting again from the first page. Styled by its page (home.scss).
export const SearchBox = ({label}: {label: string}) => {
  const [, setSearchParams] = useSearchParams();
  const query               = useSearchQuery();
  const [draft, setDraft]   = useState(query);

  useEffect(() => {
    setDraft(d => d.trim() === query ? d : query)
  }, [query]);

  const updateQuery = useDebouncedCallback((query: string) => {
    setSearchParams(query.trim() ? {q: query.trim()} : {}, {replace: true});
  }, SEARCH_DELAY_MS);

  return (
    __('div', {className: 'search-box'},
      __('label', {className: 'search'},
        __(Search, {size: 18, 'aria-hidden': true}),
        __('input', {
          type:         'search',
          placeholder:  label,
          'aria-label': label,
          value:        draft,
          onChange:     (e: React.ChangeEvent<HTMLInputElement>) => {
            setDraft(e.target.value);
            updateQuery(e.target.value);
          },
        })
      ),
    )
  );
};
