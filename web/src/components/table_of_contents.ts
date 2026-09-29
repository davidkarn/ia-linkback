import { createElement as __, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { match } from 'ts-pattern'
import type { ContentsEntry, PageOrderEntry } from '../api'
import { entryLabel, keysAlong, pathKey, pathToPage } from '../core/contents'
import './table_of_contents.scss'

export function TableOfContents({contents, pageOrder, pageId, hrefForPage}: {
  contents: ContentsEntry[],
  pageOrder: PageOrderEntry[],
  pageId: number,
  hrefForPage: (pageId: number) => string,
}) {
  const navigate                = useNavigate();
  const current                 = pathToPage(contents, pageId);
  const [expanded, setExpanded] = useState(() => new Set(keysAlong(current)));
  const labels                  = new Map(
    pageOrder.map((p) => [p.pageId, p.printedPageNumber])
  );

  const toggle = (key: string) => (
    expanded.has(key) ? unexpand(key) : expand(key)
  );

  const expand = (key: string) => setExpanded(new Set([...expanded, key]));
  const unexpand = (key: string) => setExpanded(new Set([...expanded].filter(k => k !== key)));

  const list = (entries: ContentsEntry[], path: number[]): React.ReactElement => (
    __('ul', {className: 'contents-list'},
      entries.map((entry, i) => {
        const at      = [...path, i];
        const key     = pathKey(at);
        const isOpen  = expanded.has(key);
        const isHere  = pathKey(current) === key;
        const printed = labels.get(entry.pageId);

        return __('li', {key, className: 'contents-entry' + (isHere ? ' current' : '')},
          __('div', {className: 'contents-row'},
            match(entry.childEntries.length > 0)
              .with(true, () => __('button', {
                  type:            'button',
                  className:       'contents-toggle' + (isOpen ? ' open' : ''),
                  'aria-expanded': isOpen,
                  'aria-label':    (isOpen ? 'Collapse ' : 'Expand ') + entryLabel(entry),
                  onClick:         () => toggle(key),
                },
                __(ChevronRight, {})
              ))
              .otherwise(() => __('span', {className: 'contents-toggle-space'})),
            __(Link, {
              to: hrefForPage(entry.pageId),
              className: 'contents-link',
              onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                expand(key);
                navigate(hrefForPage(entry.pageId));
              }
            },
              __('span', {className: 'contents-label'}, entryLabel(entry)),
              printed && __('span', {className: 'contents-page'}, printed)
            )
          ),
          isOpen && entry.childEntries.length > 0 && list(entry.childEntries, at)
        );
      })
    )
  );

  return (
    __('nav', {className: 'table-of-contents', 'aria-label': 'Table of contents'},
      list(contents, [])
    )
  );
}
