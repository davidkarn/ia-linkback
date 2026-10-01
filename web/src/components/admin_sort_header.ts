// A sortable admin table's column header: a button sorting the table by the column, marked when
// the table is sorted by it. Columns without a sort are plain headers.
import { createElement as __ } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import './admin_sort_header.scss'

// sortBy: the sort the column's button picks; ascending: whether that sort is the least first (a
// title A-Z) rather than the most or latest first; title: the button's tooltip
export function AdminSortHeader<S extends string>({
  label, sortBy, ascending = false, title, sort, onSort, numeric = false,
}: {
  label: string,
  sortBy?: S,
  ascending?: boolean,
  title?: string,
  sort: S,
  onSort: (sort: S) => void,
  numeric?: boolean,
}) {
  const sorted = sortBy !== undefined && sortBy === sort;

  return (
    __('th', {
      scope:       'col',
      className:   'admin-sort-header' + (numeric ? ' numeric' : ''),
      'aria-sort': sorted ? (ascending ? 'ascending' : 'descending') : undefined,
    },
      sortBy === undefined
        ? label
        : __('button', {
          type:      'button',
          className: 'sort-button' + (sorted ? ' sorted' : ''),
          title:     title ?? `Sort by ${ label.toLowerCase() }`,
          onClick:   () => onSort(sortBy),
        },
          label,
          sorted && __(ascending ? ArrowUp : ArrowDown, {size: 14, 'aria-hidden': true})
        )
    )
  );
}
