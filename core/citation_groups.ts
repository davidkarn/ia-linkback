// A citation's locations as citation_groups rows: each row one place cited, with up to 8 parts
// (part1_type/part1_value ... part8_type/part8_value), in the order the citation gives them
// ("chapter 1, verse 2"), and the raw label of the locations it came from. A range is a row per
// place: "ch. 1, vv. 2-4" is three rows, chapter 1 with verse 2, 3 and 4, each labelled
// "ch. 1, vv. 2-4". Pure functions; model/books.ts and model/extracted_citations.ts save them.
import type { CitationLocation } from '../types.ts';
import type { CitationPart } from './summa_thml.ts';

export const MAX_GROUP_PARTS = 8;

// citation_groups part values are 32-bit integers
const INT_MIN = -2147483648, INT_MAX = 2147483647;

export type PlaceGroup = { raw: string, parts: CitationPart[] };

// The places one location group cites: a place for each combination of its types' values, the
// types in the order they first appear, each type's values in order without repeats. Values that
// aren't 32-bit integers are left out and counted in `skipped`; a type with none left is dropped,
// as are types past the eighth. A group with no values left cites nothing.
export const placesOf = (group: CitationLocation[]): { places: PlaceGroup[], skipped: number } => {
  const values = new Map<string, number[]>();
  const raws   = new Set<string>();
  let skipped  = 0;

  for (const loc of group) {
    const ok = loc.values.filter((v) => Number.isInteger(v) && v >= INT_MIN && v <= INT_MAX);
    skipped += loc.values.length - ok.length;

    if (ok.length > 0) {
      const seen = values.get(loc.type) ?? [];
      values.set(loc.type, [...seen, ...ok.filter((v) => !seen.includes(v))]);
      raws.add(loc.rawLabel);
    }
  }

  const types  = [...values.keys()].slice(0, MAX_GROUP_PARTS);
  const raw    = [...raws].join(', ');
  const places = types.reduce<CitationPart[][]>(
    (partial, type) => partial.flatMap((parts) => values.get(type)!.map((value) => [...parts, { type, value }])),
    [[]],
  );

  return {
    places: types.length === 0 ? [] : places.map((parts) => ({ raw, parts })),
    skipped,
  };
};

// A citation_groups row's part columns for these parts: part1_type ... part8_value, null past the
// last part
export const partColumns = (parts: CitationPart[]) => Object.fromEntries(
  Array.from({ length: MAX_GROUP_PARTS }, (_, i) => [
    [`part${ i + 1 }_type`, parts[i]?.type ?? null],
    [`part${ i + 1 }_value`, parts[i]?.value ?? null],
  ]).flat(),
);
