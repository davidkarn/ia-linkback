// The admin panel's search box: typing searches after a pause, and the box follows the search it's
// given (the URL's, when back, forward or a link changes it)
import { createElement as __, useState } from 'react'
import { Search } from 'lucide-react'
import { useDebouncedCallback } from 'use-debounce'
import './admin_search.scss'

const SEARCH_DELAY_MS = 250;

export function AdminSearch({query, placeholder, onSearch}: {
  query: string,
  placeholder: string,
  onSearch: (query: string) => void,
}) {
  // the box's text: the query, unless what's typed is that query already (with spaces still being
  // typed); updated when the query changes from elsewhere
  const [draft, setDraft]       = useState(query);
  const [draftFor, setDraftFor] = useState(query);
  if (query !== draftFor) {
    setDraftFor(query);
    setDraft((d) => (d.trim() === query ? d : query));
  }

  const search = useDebouncedCallback((q: string) => onSearch(q.trim()), SEARCH_DELAY_MS);

  return (
    __('label', {className: 'admin-search'},
      __(Search, {size: 18, 'aria-hidden': true}),
      __('input', {
        type:         'search',
        placeholder,
        'aria-label': placeholder,
        value:        draft,
        onChange:     (e: React.ChangeEvent<HTMLInputElement>) => {
          setDraft(e.target.value);
          search(e.target.value);
        },
      })
    )
  );
}
