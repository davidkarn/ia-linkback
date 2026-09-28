// Citations of the Summa Theologiae in other books: recognizing them, and reading book, question and
// article from their raw text, in the part types of book_pages_to_citations (see summaCitationParts
// in core/summa_thml.ts). Pure functions; book_importers/summa_update_incoming_citations.ts applies
// them to the database.
//
// The raw text comes in many forms: "St. Thomas, Summa Theol., 2a 2ae, qu. 186, art. 7.",
// "S. Theol., 1a, qu. 3, art. 7.", "Sum. theol., ii-ii, 184, 3.", "Summa Theologica, 1a: XLIX: 2.",
// "Summa Theol., Supplement., qu. 95, art. 2.", "Ibid., q. 90, a. 1.", and OCR misreadings of these
// ("ia zae", "Ia IIac", "1-11").
import type { CitationPart } from './summa_thml.ts';

// A citation of the Summa by its title and author: "Summa Theologica" (or "Summa Theo- logica",
// broken over a line) by Thomas Aquinas. Other Summae ("Summa Contra Gentiles", "Summa Philosophica",
// "Summa Theol. Mor.") and commentaries "in Summam" are not.
export const isSummaCitation = (title: string, author: string): boolean => (
  /^summa\s+theol(?:ogica|ogiae)?\.?$/i.test(title.replace(/-\s+/g, '').trim())
    && /thomas|aquinas/i.test(author)
);

// The parts of the Summa as written, with the book numbers of book_pages_to_citations (I = 1,
// I-II = 2, II-II = 3, III = 4, Supplement = 5). Two-part forms first, so "1a 2ae" isn't read as "1a".
// OCR misreadings: "zae", "IIac", "Ilae", and "12", "18" for "1a" and "38" for "3a" before "qu."
const SECOND                         = '(?:2ae|2ac|2a|zae|iiae|iiac|ilae|ii|secundae)';
const PART_FORMS: [RegExp, number][] = [
  [/\bsuppl(?:ement(?:um)?)?\b\.?/iy, 5],
  [new RegExp(`\\b(?:1a|ia|i|prima)\\b[\\s,.]*-?[\\s,.]*${ SECOND }\\b|\\b12\\s*-?\\s*${ SECOND }\\b`, 'iy'), 2],
  [new RegExp(`\\b1-11\\b|\\b1-${ SECOND }\\b`, 'iy'), 2],
  [new RegExp(`\\b(?:2ae|2a|iia|ila|ii|secunda)\\b[\\s,.]*-?[\\s,.]*${ SECOND }\\b`, 'iy'), 3],
  [new RegExp(`\\b2-2\\b|\\b2-${ SECOND }\\b`, 'iy'), 3],
  [/\b(?:3a|iiia|iii|tertia)\b|\b3[28](?=\s*[,.]\s*qu?\b)/iy, 4],
  [/\b(?:1a|ia|i|prima)\b|\b(?:1[248]|1am)(?=\s*[,.]\s*qu?\b)/iy, 1],
];

// Parts written as bare numbers ("Sum. theol., 1, 86, 3."), with OCR's "12" for "1a" and "111" for
// "iii": read only right after the title and before two more numbers, as they'd be a question
// anywhere else
const NUMBER_FORMS: [RegExp, number][] = [
  [/\b(?:1|12)(?=\s*[,:]\s*[\divxlc]+\s*[,:]\s*[\divxlc]+\b)/iy, 1],
  [/\b2(?=\s*[,:]\s*[\divxlc]+\s*[,:]\s*[\divxlc]+\b)/iy, 3],
  [/\b(?:3|111)(?=\s*[,:]\s*[\divxlc]+\s*[,:]\s*[\divxlc]+\b)/iy, 4],
];

// The part written at position `at` of `text`, and where it ends; with `numbers`, a bare number too
const partAt = (text: string, at: number, numbers = false): { book: number, end: number } | null => {
  for (const [form, book] of numbers ? [...PART_FORMS, ...NUMBER_FORMS] : PART_FORMS) {
    form.lastIndex = at;
    const m        = form.exec(text);
    if (m) {
      return { book, end: at + m[0].length };
    }
  }
  return null;
};

const ROMAN                                = /^(?=[ivxlc])(?:c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/;
const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };

// "13", "xiii", "XLIX" as a number; null for anything else
const numberOf = (token: string): number | null => {
  const t = token.toLowerCase();
  if (/^\d+$/.test(t)) {
    return Number(t);
  }
  else if (ROMAN.test(t)) {
    return [...t].reduce((n, ch, i) => {
      const v    = ROMAN_VALUES[ch]!;
      const next = ROMAN_VALUES[t[i + 1] ?? ''] ?? 0;
      return n + (v < next ? -v : v);
    }, 0);
  }
  else {
    return null;
  }
};

const QUESTION = /^(?:q|qu|qq|quaest|quaestio|question)$/i;
const ARTICLE  = /^(?:a|art|article|articulus)$/i;
const REPLY    = /^ad$/i;

// Question, article and reply (ad) from the words after a part: labelled ("qu. 13, art. 9, ad 3") or
// bare, the first number the question and the second the article ("59, 2", ": XLIX: 2"). Reading
// stops at a word that is neither a label nor a number (the text going on).
const readLocation = (text: string): { question?: number, article?: number, ad?: number } => {
  const found: { question?: number, article?: number, ad?: number } = {};
  let label: 'question' | 'article' | 'ad' | null                   = null;

  for (const token of text.split(/[\s,.:;()"“”]+/).filter(Boolean)) {
    // the first of a range ("179-80")
    const n = numberOf(token.replace(/^([^-]+)-[^-]+$/, '$1'));

    if (QUESTION.test(token)) {
      label = 'question';
    }
    else if (ARTICLE.test(token)) {
      label = 'article';
    }
    else if (REPLY.test(token)) {
      label = 'ad';
    }
    else if (n !== null && label) {
      if (found[label] === undefined) {
        found[label] = n;
      }
      label = null;
    }
    else if (n !== null && found.question === undefined) {
      found.question = n;
    }
    else if (n !== null && found.article === undefined) {
      found.article = n;
    }
    else if (/^c$/i.test(token)) {
      // "c." for the body of the article (corpus)
      continue;
    }
    else {
      break;
    }
  }

  return found;
};

// Where the Summa is named in a raw citation, and where its title ends
const TITLE = /(?:summa[m]?|sum\.?|s\.)\s*theol(?:ogica|ogiae)?\.?,?|summa\b\.?,?/i;

// The place a citation refers back to with "Ibid.": the last place of the citation before it
export type SummaPlace = { book: number, question: number };

// The location groups of a raw citation of the Summa: one per place cited, each [book, question,
// article?, ad?] (only places with a question). A place whose part isn't written ("Ibid., q. 90,
// a. 1") is in the book of `previous` (the citation before it), and one with only an article
// ("Ibid. a. 6") in its question too; without `previous` it is left out.
export const parseSummaCitation = (raw: string, previous?: SummaPlace): CitationPart[][] => {
  const inheritedBook = previous?.book;
  const title         = raw.match(TITLE);
  // the words after the title, or after "Ibid." when the title isn't repeated
  const text = (title ? raw.slice(title.index! + title[0].length) : raw)
    .replace(/^\W*ibid\b\.?,?/i, '')
    .replace(/[–—]/g, '-');
  // right after a title (the first, or a later one: "Cp. Sum. theol., 111, 16, 1")
  const opening = (at: number) => /(?:^|theol(?:ogica|ogiae)?\.?|summa\b\.?)[\s,]*$/i
    .test(text.slice(0, at));

  // the places cited: each starts at a part, or at the beginning with the inherited part
  const places: { book: number | undefined, from: number, to: number }[] = [];
  let book                                                               = partAt(text, text.search(/\S/), true) ? undefined : inheritedBook;
  let from                                                               = 0;

  for (let at = 0; at < text.length; at++) {
    // a new place starts at a part, but a Roman number that could be a part is the question when
    // the place has none yet ("1a: III: 5") or a label comes before it ("qu. iii")
    const before   = text.slice(from, at);
    const labelled = /\b(?:q|qu|qq|quaest|a|art|ad)\.?\s*$/i.test(before);
    const needed   = book !== undefined && readLocation(before).question === undefined;
    const part     = /[\s,.:;(]/.test(text[at - 1] ?? ' ') && !labelled && !needed
      ? partAt(text, at, opening(at)) : null;
    if (part) {
      places.push({ book, from, to: at });
      book = part.book;
      from = part.end;
      at   = part.end - 1;
    }
  }
  places.push({ book, from, to: text.length });

  // a place may cite several questions of its part ("1a-2a: LXXII: 1, 3. LXXV: 3")
  const segments = places.flatMap((p) => text.slice(p.from, p.to)
    .split(/(?<!\b(?:q|qu|a|art|ad))\.\s+(?=[ivxlc\d]+\s*:\s*[ivxlc\d]+\b)/i)
    .map((words) => ({ book: p.book, words })));

  return segments.flatMap((p) => {
    const read = readLocation(p.words);
    const loc  = read.question === undefined && read.article !== undefined
      && previous && p.book === previous.book
      ? { ...read, question: previous.question }
      : read;

    if (p.book === undefined || loc.question === undefined) {
      return [];
    }
    else {
      return [[
        { type: 'book', value: String(p.book) },
        { type: 'question', value: String(loc.question) },
        ...(loc.article === undefined ? [] : [{ type: 'article', value: String(loc.article) }]),
        ...(loc.ad === undefined ? [] : [{ type: 'ad', value: String(loc.ad) }]),
      ]];
    }
  });
};

// Whether a raw citation refers back to the one before it ("Ibid., q. 90, a. 1.")
export const isIbid = (raw: string): boolean => /^\W*ibid\b/i.test(raw);

// The last place in some location groups, for the citation after them to refer back to
export const lastPlace = (groups: CitationPart[][]): SummaPlace | undefined => {
  const last = groups[groups.length - 1];
  const book = last?.find((p) => p.type === 'book');
  const q    = last?.find((p) => p.type === 'question');
  return book && q ? { book: Number(book.value), question: Number(q.value) } : undefined;
};
