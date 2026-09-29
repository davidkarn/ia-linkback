import { useRef, createElement as __, useState } from 'react'
import { useNavigate } from 'react-router'
import type { PageOrderEntry } from '../api'
import "./book_pager.scss"

const BookPager = ({pages, hrefForPage}: {
  pages: PageOrderEntry[],
  hrefForPage: (pageId: number) => string,
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
      )
    )
  );
};

export default BookPager;
