// How the open books' columns share the page's width (see pages/book_view.ts):
// the main column, which shows its page's citations (the rightmost, unless
// another has been expanded), is wider than the others, and when it would be
// narrower than MAIN_MIN_REM the others collapse to a slim strip showing only
// their book's title, the leftmost first, until it isn't or none is left to
// collapse.
import { match } from 'ts-pattern';
import { range } from '../lib';

// the main column's width to the others'
export const MAIN_WEIGHT = 1.35;
// the narrowest the main column is before others collapse
export const MAIN_MIN_REM = 35;
// a collapsed column's width
export const COLLAPSED_COLUMN_REM = 2.5;

// The main column's width (rem) in a page `widthRem` wide, with `collapsed`
// of the `columns` collapsed
const mainWidth = (widthRem: number, columns: number, collapsed: number): number => {
  const shared = widthRem - collapsed * COLLAPSED_COLUMN_REM;
  return shared * MAIN_WEIGHT / (columns - 1 - collapsed + MAIN_WEIGHT);
};

// Which columns to collapse in a page `widthRem` wide, `main` the main
// column: the fewest of the others, from the leftmost, that leave the main
// column MAIN_MIN_REM, else every other one. A flag per column.
export const collapsedColumns = (
  widthRem: number, columns: number, main: number
): boolean[] => {
  const others = Math.max(columns - 1, 0);
  const count  = range(others + 1)
    .find((c) => mainWidth(widthRem, columns, c) >= MAIN_MIN_REM) ?? others;

  const folded = new Set(
    range(columns)
      .filter((i) => i !== main)
      .slice(0, count)
  );

  return range(columns).map(i => folded.has(i));
};

// The grid's columns (grid-template-columns): the collapsed ones slim, the
// others sharing what's left, the main one MAIN_WEIGHT times as wide
export const gridColumns = (main: number, collapsed: boolean[]): string => {
  if (collapsed.length <= 1) {
    return 'minmax(0, 1fr)';
  }
  else {
    return collapsed.map((folded, i) => match({ folded, isMain: i === main })
      .with({ isMain: true }, () => `minmax(0, ${ MAIN_WEIGHT }fr)`)
      .with({ folded: true }, () => `${ COLLAPSED_COLUMN_REM }rem`)
      .otherwise(() => 'minmax(0, 1fr)')
    ).join(' ');
  }
};
