import { createElement as __ } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react';
import "./Pager.scss";

// Page numbers to show: the first, the last, and the current one with a neighbour on each side;
// null where pages are skipped. (page 7 of 20 -> 1 … 6 7 8 … 20)
const pageNumbers = (page: number, pageCount: number): (number | null)[] => {
  const shown = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter(n => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b);

  return shown.flatMap((n, i) => {
    const prev = shown[i - 1];
    if (prev === undefined || n === prev + 1) return [n];
    // a gap of exactly one page shows the page rather than "…"
    return n === prev + 2 ? [prev + 1, n] : [null, n];
  });
};

// Previous / numbered pages / next. page is 1-based.
export default function Pager({page, pageCount, onPage}: {
  page: number,
  pageCount: number,
  onPage: (page: number) => void
}) {
  if (pageCount <= 1) return null;

  return (
    __('nav', {className: 'pager', 'aria-label': 'Pages'},
      __('button', {
          disabled: page <= 1,
          onClick: () => onPage(page - 1),
          'aria-label': 'Previous page',
        },
        __(ChevronLeft, {size: 18, 'aria-hidden': true})
      ),
      pageNumbers(page, pageCount).map((n, i) => (
        n === null
          ? __('span', {key: 'gap' + i, className: 'gap'}, '…')
          : __('button', {
              key: n,
              className: n === page ? 'current' : '',
              'aria-current': n === page ? 'page' : undefined,
              onClick: () => onPage(n),
            }, n)
      )),
      __('button', {
          disabled: page >= pageCount,
          onClick: () => onPage(page + 1),
          'aria-label': 'Next page',
        },
        __(ChevronRight, {size: 18, 'aria-hidden': true})
      ),
    )
  );
}
