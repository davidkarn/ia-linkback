// Citations of Boethius's Consolation of Philosophy and Aquinas's Summa Contra Gentiles (imported
// by book_importers/consolation_gutenberg.ts and single_thml.ts): the aliases citedFatherWork
// matches them by (see core/fathers_citations.ts), for
// book_importers/fathers_update_incoming_citations.ts --works boethius|contra-gentiles.
import type { FatherWork } from './fathers_citations.ts';

const BOETHIUS = /^(?:st\.?\s+)?boethius\.?$/i;

// "Thomas Aquinas", "St. Thomas", "S. Thom.", "Aquinas"
const AQUINAS = /^(?:(?:st\.?|s\.|saint)\s+)?(?:thom(?:as|\.)?(?:\s+(?:of\s+)?aquinas)?|aquinas)\.?$/i;

// The Consolation, cited by book, and by prose section ("iii, 11": book 3, prose 11, the scholastics
// numbering its prose sections); its pages are its prose sections and metres (poems), so the
// places cited are read as book and prose
export const BOETHIUS_WORKS: FatherWork[] = [
  {
    bookId: 'boethius-consolation-of-philosophy',
    author: BOETHIUS,
    title:  /^de\s*consol/i,
    types:  ['book', 'prose'],
  },
];

// The Summa Contra Gentiles by Aquinas, not Athanasius's Contra Gentes (its "C. Gentes" too). Its
// page numbers in Rickaby's "Of God and His Creatures" ("p. 57") aren't the chapters' pages here,
// and aren't read.
export const CONTRA_GENTILES_WORKS: FatherWork[] = [
  {
    bookId: 'summa-contra-gentiles',
    author: AQUINAS,
    title:  /^(?:summa\s*)?(?:contra|cont\.?|c\.)\s*gent/i,
  },
];
