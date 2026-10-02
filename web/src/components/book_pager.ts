import { useRef, createElement as __, useState, memo } from 'react'
import { Link, useNavigate } from 'react-router'
import type { PageOrderEntry, VolumeSummary } from '../api'
import { entryLabel } from '../core/contents'
import { pagesOnly, pageVolumes } from '../core/page_order'
import "./book_pager.scss"

// A line per page of the volume open, between a dot per volume before it and a dot per volume
// after it, which go to that volume's first page. For a book listing every volume's pages (with
// an isVolume entry where each starts), a line per page of the book, and a dot where each volume
// starts.
const BookPager = memo(({pages, volume, volumes, hrefForPage}: {
  pages: PageOrderEntry[],
  volume: number,
  volumes: VolumeSummary[],
  hrefForPage: (pageId: number, volume?: number) => string,
}) => {
  const navigate    = useNavigate();
  const allVolumes  = pages.some((p) => p.isVolume);
  const volumeOf    = pageVolumes(pages, volumes);

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

  const volumeDot = (key: string, href: string, label: string) => (
    __(Link, {key, to: href, className: 'volume-dot-wrapper', title: label, 'aria-label': label},
      __('div', {className: 'volume-dot'},
        __('span', {}, label)
      )
    )
  );

  const volumeDots = (shown: VolumeSummary[]) => (
    !allVolumes && shown.length > 0 && __('div', {className: 'volume-dots'},
      shown.map((v) => volumeDot(String(v.volume), hrefForPage(v.firstPageId, v.volume), entryLabel(v)))
    )
  );

  const line = (page: PageOrderEntry) => {
    const cited = page.citedByCount ?? 0;
    return (
      __('div', {
        key: page.pageId,
        className: 'line' + (
          cited > 0 ? (cited > 4 ? ' with-many-citations' : ' with-citations') : ''
        ),
        onClick: () => navigate(hrefForPage(page.pageId, volumeOf.get(page.pageId)))
      },
        __('span', {},
          page.printedPageNumber
        )
      )
    );
  };

  return (
    __('div', {
        className: 'book-pager-wrapper'
          + (fades.top ? ' fade-top' : '')
          + (fades.bottom ? ' fade-bottom' : ''),
        ref:      wrapper,
        onScroll: updateFades,
      },
      // the edges fade out over lines scrolled out of view above or below
      __('div', {className: 'fade-edge top', 'aria-hidden': true}),
      __('div', {
        className: 'book-pager',
        style: {'--page-count': pagesOnly(pages).length} as React.CSSProperties,
      },
        volumeDots(volumes.filter((v) => v.volume < volume)),
        __('div', {className: 'lines'},
          pages.map((page) => (
            page.isVolume
              ? volumeDot(
                'volume-' + page.pageId + '-' + page.printedPageNumber,
                hrefForPage(page.pageId, volumes.find((v) => v.firstPageId === page.pageId)?.volume),
                page.printedPageNumber,
              )
              : line(page)
          ))
        ),
        volumeDots(volumes.filter((v) => v.volume > volume)),
      ),
      __('div', {className: 'fade-edge bottom', 'aria-hidden': true}),
    )
  );
});

export default BookPager;
