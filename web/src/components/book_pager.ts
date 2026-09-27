import { useEffect, useRef, createElement as __, useState } from 'react'
import { useNavigate } from 'react-router'
import { useMachine } from '@xstate/react'
import type { PageOrderEntry } from '../api'
import { BookPagerMachine } from './book_pager_machine'
import "./book_pager.scss"

const NEIGHBORS = 2;
const pagerLabel = (entry: PageOrderEntry) => entry.printedPageNumber || '[' + entry.pageId + ']';

// A column with one horizontal line per page. Hovering shows the page numbers around the pointer; clicking
// opens the page under it, at hrefForPage(pageId) (the URL with this book's column turned to that page).
export default function BookPager({pages, hrefForPage}: {
  pages: PageOrderEntry[],
  hrefForPage: (pageId: number) => string,
}) {
  const navigate = useNavigate();
  const latest   = useRef({pages, hrefForPage, navigate});
  
  useEffect(() => {
    latest.current = {pages, hrefForPage, navigate};
  });

  const [state, send] = useMachine(BookPagerMachine.provide({
    actions: {
      openPage: (_, {index}) => {
        const {pages, hrefForPage, navigate} = latest.current;
        const page = pages[index];
        if (page) {
          navigate(hrefForPage(page.pageId));
        }
      },
    },
  }));

  const hovered = state.matches('hovering') ? state.context.hoveredIndex : null;
  const near = (i: number) => hoveredLine !== null && Math.abs(i - hoveredLine) <= NEIGHBORS;

  const hoveredLine = state.context.hoveredIndex;
  
  return (
    __('div', {className: 'book-pager-wrapper'},
      __('div', {
        className: 'book-pager',
        onMouseOut: () => send({type: 'pointer.leave'}),
        'data-state': String(state.value),
        style: {'--page-count': pages.length} as React.CSSProperties,
      },
        __('div', {className: 'lines'},
          pages.map((page, i) => (
            __('div', {
              key: page.pageId,
              onMouseOver: () => send({type: 'pointer.move', index: i}),
              onClick: () => send({type: 'page.click'}),
              className: 'line' + (
                hoveredLine && hoveredLine !== i && near(i) 
                  ? (Math.abs(i - hoveredLine) === 1
                  ? ' near'
                  : (i > hoveredLine ? ' near near-fafter' : ' near fnear-before')
                  )
                  : ''
              ) + (
                i === hoveredLine ? ' hovered' : ''
              ) + (
                page.citedByCount > 0
                  ? (page.citedByCount > 4 ? ' with-many-citations' : ' with-citations')
                  : ''
              ),
            },
              hoveredLine === i ? page.printedPageNumber : null
            )
          ))
        ),
      )
    )
  );
}
