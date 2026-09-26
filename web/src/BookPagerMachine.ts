import { assign, setup } from 'xstate'

export type BookPagerEvent = (
  { type: 'pointer.move', index: number }
| { type: 'pointer.leave' }
| { type: 'page.click' }
);

type BookPagerContext = {
  hoveredIndex: number | null
};

// BookPager's states:
//   inactive  the pointer is elsewhere: every page is just a line
//   hovering  the pointer is over the pager: hoveredIndex (an index into pageOrder)
//             and the two pages on either side of it show their page numbers, and
//             a click opens the hovered page
export const BookPagerMachine = setup({
  types: {
    context: {} as BookPagerContext,
    events: {} as BookPagerEvent
  },
  actions: {
    setHovered: assign({
      hoveredIndex: (_, params: { index: number }) => params.index,
    }),
    clearHovered: assign({ hoveredIndex: null }),
    // supplied by BookPager with .provide(), since opening a page means navigating
    openPage: (_, _params: { index: number }) => {},
  },
}).createMachine({
  id: 'bookPager',
  context: { hoveredIndex: null },
  initial: 'inactive',
  states: {
    inactive: {
      on: {
        'pointer.move': {
          target: 'hovering',
          actions: {
            type: 'setHovered',
            params: ({ event }) => ({ index: event.index })
          },
        },
      },
    },
    hovering: {
      on: {
        'pointer.move': {
          actions: {
            type: 'setHovered',
            params: ({ event }) => ({ index: event.index })
          },
        },
        'pointer.leave': {
          target: 'inactive',
          actions: 'clearHovered',
        },
        'page.click': {
          guard: ({ context }) => context.hoveredIndex !== null,
          actions: {
            type: 'openPage',
            params: ({ context }) => ({ index: context.hoveredIndex! })
          },
        },
      },
    },
  },
})
