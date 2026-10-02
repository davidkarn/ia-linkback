// The proper names of parts of a work (book_part_names): "Isaias" for
// the Douay-Rheims's book 27, "Prima Pars" for the Summa's book 1. Pure
// functions; model/book_part_names.ts reads the rows.
import type { CitationPart } from './summa_thml.ts';

// A part's name, and the citation parts that make it, outermost first
export type PartName = { parts: CitationPart[], name: string };

const partsKey = (parts: CitationPart[]) => (
  parts.map((p) => p.type + '\u0000' + p.value).join('\u0001')
);

// A lookup of the names of a work's parts, by their citation parts: the
// name of exactly those parts, undefined when they have none
export const partNamer = (
  names: PartName[]
): ((parts: CitationPart[]) => string | undefined) => {
  const byParts = new Map(names.map((n) => [partsKey(n.parts), n.name]));
  return (parts) => byParts.get(partsKey(parts));
};
