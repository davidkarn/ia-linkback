import { useRef, createElement as __, useState, memo } from 'react'
import { Link, useNavigate } from 'react-router'
import type { PageOrderEntry, VolumeSummary } from '../api'
import { entryLabel } from '../core/contents'
import "./book_pager.scss"

// A line per page of the volume open, between a dot per volume before it and a dot per volume
// after it, which go to that volume's first page
const BookPager = memo(({pages, volume, volumes, hrefForPage}: {
  pages: PageOrderEntry[],
  volume: number,
  volumes: VolumeSummary[],
  hrefForPage: (pageId: number, volume?: number) => string,
}) => {
  const navigate    = useNavigate();

  const wrapper             = useRef<HTMLDivElement>(null);
  const [fades, setFades]   = useState({ top: false, bottom: false });
  const updateFades         = () => {
    const el = wrapper.current;
    if (el) {
      const top    = el.scrollTop > 0;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      setFades((f) => (f.top === top && f.bottom === bottom ? f : { top, bottom }));
    }
  };

  const volumeDots = (shown: VolumeSummary[]) => (
    shown.length > 0 && __('div', {className: 'volume-dots'},
      shown.map((v) => (
        __(Link, {
          key:          v.volume,
          to:           hrefForPage(v.firstPageId, v.volume),
          className:    'volume-dot-wrapper',
          title:        entryLabel(v),
          'aria-label': entryLabel(v),
        },
          __('div', {className: 'volume-dot'},
            __('span', {}, entryLabel(v))
          )
        )
      ))
    )
  );

  return (
    __('div', {
        className: 'book-pager-wrapper'
          + (fades.top ? ' fade-top' : '')
          + (fades.bottom ? ' fade-bottom' : ''),
        ref:      wrapper,
        onScroll: updateFades,
      },
      __('div', {
        className: 'book-pager',
        'data-state': status,
        style: {'--page-count': pages.length} as React.CSSProperties,
      },
        volumeDots(volumes.filter((v) => v.volume < volume)),
        __('div', {className: 'lines'},
          pages.map((page) => (
            __('div', {
              key: page.pageId,
              className: 'line' + (
                page.citedByCount > 0
                  ? (page.citedByCount > 4 ? ' with-many-citations' : ' with-citations')
                  : ''
              ),
            },
              __('span', {onClick: () => navigate(hrefForPage(page.pageId))},
                page.printedPageNumber
              )
            )
          ))
        ),
        volumeDots(volumes.filter((v) => v.volume > volume)),
      )
    )
  );
});

export default BookPager;
