import { useEffect, useRef, createElement as __ } from 'react'
import { useNavigate } from 'react-router'
import { useMachine } from '@xstate/react'
import type { PageOrderEntry } from './api'
import { BookPagerMachine } from './BookPagerMachine'
import "./BookPager.scss"

const NEIGHBORS = 2;
const pagerLabel = (entry: PageOrderEntry) => entry.printedPageNumber || '[' + entry.pageId + ']';

// A column with one horizontal line per page. Hovering shows the page numbers around the pointer; clicking
// opens the page under it.
export default function BookPager({pages, bookId}: {pages: PageOrderEntry[], bookId: string}) {
  const navigate = useNavigate();

  // openPage runs from the machine, so it reads the latest props through a ref
  const latest = useRef({pages, bookId, navigate});
  useEffect(() => { latest.current = {pages, bookId, navigate}; });

  const [state, send] = useMachine(BookPagerMachine.provide({
    actions: {
      openPage: (_, {index}) => {
        const {pages, bookId, navigate} = latest.current;
        const page = pages[index];
        navigate('/books/' + encodeURIComponent(bookId) + '/pages/' + page.pageId);
      },
    },
  }));

  // The page under the pointer: lines can be under a pixel tall, so go by position rather than element
  const indexAt = (e: React.PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const index = Math.floor((e.clientY - rect.top) / rect.height * pages.length);
    return Math.min(Math.max(index, 0), pages.length - 1);
  };

  const hovered = state.matches('hovering') ? state.context.hoveredIndex : null;
  const near = (i: number) => hovered !== null && Math.abs(i - hovered) <= NEIGHBORS;
  const shown = hovered === null ? [] : pages
    .map((page, i) => ({page, i}))
    .slice(Math.max(hovered - NEIGHBORS, 0), hovered + NEIGHBORS + 1);

  return (
    __('div', {
        className: 'book-pager',
        'data-state': String(state.value),
        style: {'--page-count': pages.length} as React.CSSProperties,
        onPointerMove: (e: React.PointerEvent<HTMLElement>) => send({type: 'pointer.move', index: indexAt(e)}),
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => send({type: 'pointer.move', index: indexAt(e)}),
        onPointerLeave: () => send({type: 'pointer.leave'}),
        onClick: () => send({type: 'page.click'}),
      },
      __('div', {className: 'lines'},
        pages.map((page, i) => (
          __('div', {
            key: page.pageId,
            className: 'line' + (
              hovered && near(i)
                ? (i > hovered ? ' near near-after' : ' near near-before')
                : ''
            ) + (
              i === hovered ? ' hovered' : ''
            ) + (
              page.citedByCount > 0
                ? (page.citedByCount > 4 ? ' with-many-citations' : ' with-citations')
                : ''
            ),
          })
        ))
      ),

      hovered !== null && (
        __('ol', {
          className: 'labels',
          // the hovered label sits on the hovered line, with --above labels over it
          style: {
            top: ((hovered + 0.5) / pages.length * 100) + '%',
            '--above': hovered - (shown[0]?.i ?? hovered),
          } as React.CSSProperties,
        },
          shown.map(({page, i}) => (
            __('li', {
              key: page.pageId,
              className: (
                i === hovered ? 'hovered' : ''
              ) + (
                page.citedByCount > 0
                  ? (page.citedByCount > 4 ? ' with-many-citations' : ' with-citations')
                  : ''
              )
            },
              pagerLabel(page)
            )
          ))
        )
      )
    )
  );
}
