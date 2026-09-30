import { createElement as __, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { match } from 'ts-pattern'
import type { ContentsEntry, VolumeSummary } from '../api'
import { entryLabel, keysAlong, pathKey, pathToPageInVolume, volumeOfEntry } from '../core/contents'
import './table_of_contents.scss'

// The whole book's table of contents, the page open's entries expanded. For a book with volumes,
// its top-level entries are the volumes, and an entry goes to its page in its own volume.
export function TableOfContents({contents, volumes, volume, pageId, hrefForPage}: {
  contents: ContentsEntry[],
  volumes: VolumeSummary[],
  volume: number,
  pageId: number,
  hrefForPage: (pageId: number, volume?: number) => string,
}) {
  const navigate                = useNavigate();
  const current                 = pathToPageInVolume(contents, pageId, volumes, volume);
  const [expanded, setExpanded] = useState(() => new Set(keysAlong(current)));

  const toggle = (key: string) => (
    expanded.has(key) ? unexpand(key) : expand(key)
  );

  const expand = (key: string) => setExpanded(new Set([...expanded, key]));
  const unexpand = (key: string) => setExpanded(new Set([...expanded].filter(k => k !== key)));

  // entryVolume: the volume of the entries' top-level ancestor (undefined at the top level, or
  // for a book without volumes)
  const list = (
    entries: ContentsEntry[], path: number[], entryVolume?: number
  ): React.ReactElement => (
    __('ul', {className: 'contents-list'},
      entries.map((entry, i) => {
        const at       = [...path, i];
        const key      = pathKey(at);
        const isOpen   = expanded.has(key);
        const isHere   = pathKey(current) === key;
        const printed  = entry.printedPageNumber;
        const inVolume = entryVolume ?? volumeOfEntry(volumes, entry);
        const href     = hrefForPage(entry.pageId, inVolume);

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
              to: href,
              className: 'contents-link',
              onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                expand(key);
                navigate(href);
              }
            },
              __('span', {className: 'contents-label'}, entryLabel(entry)),
              printed.length > 0 && __('span', {className: 'contents-page'}, printed)
            )
          ),
          isOpen && entry.childEntries.length > 0 && list(entry.childEntries, at, inVolume)
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
