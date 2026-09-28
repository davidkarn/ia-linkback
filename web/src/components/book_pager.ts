import { useRef, createElement as __, useState } from 'react'
import { useNavigate } from 'react-router'
import type { PageOrderEntry } from '../api'
import "./book_pager.scss"

const BookPager = ({pages, hrefForPage}: {
  pages: PageOrderEntry[],
  hrefForPage: (pageId: number) => string,
}) => {
  const navigate    = useNavigate();
  const [hovered, setHovered] = useState<number|null>(null);

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

  const near = (i: number) => hovered !== null && Math.abs(i - hovered) <= 2;
  
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
          pages.map((page, i) => (
            __('div', {
              key: page.pageId,
              onMouseOver: () => setHovered(i),
              onMouseOut: () => setHovered((val) => val === i ? null : val),
              onClick: () => navigate(hrefForPage(page.pageId)),
              className: 'line' + (
                hovered && hovered !== i && near(i) 
                  ? (Math.abs(i - hovered) === 1
                  ? ' near'
                  : (i > hovered ? ' near near-fafter' : ' near fnear-before')
                  )
                  : ''
              ) + (
                i === hovered ? ' hovered' : ''
              ) + (
                page.citedByCount > 0
                  ? (page.citedByCount > 4 ? ' with-many-citations' : ' with-citations')
                  : ''
              ),
            },
              hovered === i ? page.printedPageNumber : null
            )
          ))
        ),
      )
    )
  );
};

export default BookPager;
