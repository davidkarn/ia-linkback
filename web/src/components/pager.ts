import { createElement as __ } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { unique } from '../../../lib/lib';
import "./pager.scss";

const pageNumbers = (page: number, pageCount: number): (number | null)[] => {
  const shown = unique([1, page - 1, page, page + 1, pageCount])
    .filter(n => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b);

  return shown.flatMap((n, i) => {
    const prev = shown[i - 1];
    
    if (prev === undefined || n === prev + 1) {
      return [n];
    }
    else {
      return n === prev + 2
        ? [prev + 1, n]
        : [null, n];
    }
  });
};


export default function Pager({page, pageCount, onPage}: {
  page: number,
  pageCount: number,
  onPage: (page: number) => void
}) {
  if (pageCount <= 1) {
    return null;
  }
  else {
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
    )
  };
}
