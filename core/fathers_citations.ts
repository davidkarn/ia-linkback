// Citations of the Church Fathers in other books, and the works of the Ante-Nicene and Nicene and
// Post-Nicene Fathers (book_importers/anf_npnf_thml.ts) they cite: recognizing the work from the
// citation's author and its (Latin, abbreviated) title, and reading the place in it from its
// location, in the part types the work's pages are cited by in book_pages_to_citations. Pure
// functions; book_importers/fathers_update_incoming_citations.ts applies them to the database.
//
// Citations name the works as the Latin tradition does ("De Civ. Dei xiv, 9", "Tract. cv in
// Joan.", "De Fide Orth. iii, 5"), and the CCEL volumes in English ("City of God"), so the works
// are matched by the aliases below rather than by title.
import type { CitationPart } from './summa_thml.ts';
import { numberOf } from './fathers_thml.ts';

// bookId: the imported work. author, title: patterns of the citation's author and title (the
// title with its spacing collapsed). location: a pattern its location must match too, where the
// title alone is ambiguous ("Tract." on John's Gospel or his first Epistle). prefix: parts the
// work's place starts with before the cited ones, for a work the CCEL volume imports as part of
// another (On the Predestination of the Saints is book 1 of its book, On the Gift of Perseverance
// book 2).
export type FatherWork = {
  bookId: string,
  author: RegExp,
  title: RegExp,
  location?: RegExp,
  prefix?: CitationPart[],
};

// Augustine, not "Pseudo-Augustine" or Aemilius de Augustinis
const AUGUSTINE = /^(?:st\.?\s+|saint\s+)?augustin(?:e|us)?\.?(?:\s+of\s+hippo)?$/i;
const DAMASCENE = /^(?:st\.?\s+|saint\s+)?(?:john\s+)?(?:damascene|of\s+damascus)\.?$/i;

// Each alias's title pattern is tried in this order, so a longer title comes before one it starts
// with ("De Fide et Symbolo" before "De Symbolo")
export const FATHER_WORKS: FatherWork[] = [
  { bookId: 'npnf103-on-the-holy-trinity', author: AUGUSTINE, title: /^de trin/i },
  { bookId: 'npnf102-city-of-god', author: AUGUSTINE, title: /^(?:de civ|city of god)/i },
  // "Tract. in Ep. Joan.", "In prim. canon. Joan. Tract.": the homilies on the first Epistle
  {
    bookId: 'npnf107-ten-homilies-on-the-first-epistle-of-john',
    author: AUGUSTINE,
    title:  /^(?:in (?:prim|i|1)\b.*joan|tract\.? in (?:i\.? |1 |prim\.? )?ep)/i,
  },
  // "Tract. in Joan.", "Super Joan., Tract.", "In Joan. Tract."
  {
    bookId: 'npnf107-lectures-or-tractates-on-the-gospel-according-to-st-john',
    author: AUGUSTINE,
    title:  /^(?:(?:super |in )?(?:joan|ioa)[a-z]*\.?,? tract|tract\.? (?:in|super) (?:joan|ioa))/i,
  },
  // a bare "Tract." only when its location names John: his first Epistle ("ix in Ep. i Joan.") or
  // else his Gospel ("cv in Joan.")
  {
    bookId:   'npnf107-ten-homilies-on-the-first-epistle-of-john',
    author:   AUGUSTINE,
    title:    /^tract\.?$/i,
    location: /\bep(?:ist)?\b.*\b(?:joan|ioa|john)/i,
  },
  {
    bookId:   'npnf107-lectures-or-tractates-on-the-gospel-according-to-st-john',
    author:   AUGUSTINE,
    title:    /^tract\.?$/i,
    location: /\b(?:joan|ioa|john)/i,
  },
  { bookId: 'npnf102-on-christian-doctrine', author: AUGUSTINE, title: /^de doctr/i },
  { bookId: 'npnf101-the-confessions', author: AUGUSTINE, title: /^confess/i },
  { bookId: 'npnf104-reply-to-faustus-the-manich-an', author: AUGUSTINE, title: /^con(?:tra|t)?\.? faust/i },
  { bookId: 'npnf103-the-enchiridion', author: AUGUSTINE, title: /^enchir/i },
  { bookId: 'npnf106-our-lord-s-sermon-on-the-mount', author: AUGUSTINE, title: /^de serm\.? dom/i },
  // by their Benedictine numbers, as the CCEL volume numbers them
  { bookId: 'npnf101-letters-of-st-augustin', author: AUGUSTINE, title: /^ep(?:ist)?\.?(?: ad\b.*)?$/i },
  { bookId: 'npnf103-on-the-good-of-marriage', author: AUGUSTINE, title: /^de bono conj/i },
  { bookId: 'npnf103-on-the-good-of-widowhood', author: AUGUSTINE, title: /^de bono vid/i },
  { bookId: 'npnf103-on-care-to-be-had-for-the-dead', author: AUGUSTINE, title: /^de cura/i },
  { bookId: 'npnf107-two-books-of-soliloquies', author: AUGUSTINE, title: /^soliloq/i },
  { bookId: 'npnf103-of-the-work-of-monks', author: AUGUSTINE, title: /^de oper/i },
  { bookId: 'npnf106-the-harmony-of-the-gospels', author: AUGUSTINE, title: /^de cons(?:ens(?:u)?)?\.? evang/i },
  { bookId: 'npnf104-on-the-morals-of-the-catholic-church', author: AUGUSTINE, title: /^de mor(?:ibus|ib)?\.? eccl/i },
  { bookId: 'npnf104-on-the-morals-of-the-manich-ans', author: AUGUSTINE, title: /^de mor(?:ibus|ib)?\.? manich/i },
  { bookId: 'npnf103-of-holy-virginity', author: AUGUSTINE, title: /^de (?:sanct(?:a)?\.? )?virg/i },
  { bookId: 'npnf103-on-continence', author: AUGUSTINE, title: /^de contin/i },
  { bookId: 'npnf103-on-patience', author: AUGUSTINE, title: /^de patient/i },
  { bookId: 'npnf105-a-treatise-on-nature-and-grace', author: AUGUSTINE, title: /^de nat(?:ura)?\.? et grat/i },
  {
    bookId: 'npnf105-a-treatise-on-the-predestination-of-the-saints',
    author: AUGUSTINE,
    title:  /^de pr(?:a|ae)ed(?:est)?\.? sanct/i,
    prefix: [{ type: 'book', value: 1 }],
  },
  {
    bookId: 'npnf105-a-treatise-on-the-predestination-of-the-saints',
    author: AUGUSTINE,
    title:  /^de (?:dono )?persev/i,
    prefix: [{ type: 'book', value: 2 }],
  },
  { bookId: 'npnf105-on-marriage-and-concupiscence', author: AUGUSTINE, title: /^de nupt?\.? et concup/i },
  { bookId: 'npnf104-concerning-the-nature-of-good-against-the-manich-ans', author: AUGUSTINE, title: /^de nat(?:ura)?\.? boni/i },
  { bookId: 'npnf103-against-lying', author: AUGUSTINE, title: /^contra mend/i },
  { bookId: 'npnf103-on-lying', author: AUGUSTINE, title: /^(?:lib\.? )?de mend/i },
  { bookId: 'npnf105-a-treatise-on-the-spirit-and-the-letter', author: AUGUSTINE, title: /^de spir(?:itu)?\.? et lit/i },
  { bookId: 'npnf104-on-two-souls-against-the-manich-ans', author: AUGUSTINE, title: /^de duab(?:us)?\.? anim/i },
  { bookId: 'npnf105-a-treatise-concerning-man-s-perfection-in-righteousness', author: AUGUSTINE, title: /^de perf(?:ect)?\.? just/i },
  { bookId: 'npnf105-a-treatise-on-rebuke-and-grace', author: AUGUSTINE, title: /^de cor(?:r|rep)\.? et grat/i },
  { bookId: 'npnf105-a-treatise-on-the-merits-and-forgiveness-of-sins-and-on-the', author: AUGUSTINE, title: /^de pecc(?:at(?:orum)?)?\.? merit/i },
  { bookId: 'npnf105-a-treatise-on-the-grace-of-christ-and-on-original-sin', author: AUGUSTINE, title: /^de grat(?:ia)?\.? christ/i },
  { bookId: 'npnf105-a-treatise-on-the-soul-and-its-origin', author: AUGUSTINE, title: /^de anima et/i },
  { bookId: 'npnf105-a-work-on-the-proceedings-of-pelagius', author: AUGUSTINE, title: /^de gest(?:is)?\.? pelag/i },
  { bookId: 'npnf105-a-treatise-against-two-letters-of-the-pelagians', author: AUGUSTINE, title: /^contra duas ep/i },
  { bookId: 'npnf104-on-baptism-against-the-donatists', author: AUGUSTINE, title: /^de bapt/i },
  { bookId: 'npnf104-answer-to-the-letters-of-petilian-the-donatist', author: AUGUSTINE, title: /petil/i },
  { bookId: 'npnf104-against-the-epistle-of-manich-us-called-fundamental', author: AUGUSTINE, title: /^contra ep(?:ist)?\.? fund/i },
  { bookId: 'npnf104-acts-or-disputation-against-fortunatus-the-manich-an', author: AUGUSTINE, title: /fortun/i },
  { bookId: 'npnf103-on-the-catechising-of-the-uninstructed', author: AUGUSTINE, title: /^de catech/i },
  { bookId: 'npnf103-on-the-profit-of-believing', author: AUGUSTINE, title: /^de util/i },
  { bookId: 'npnf103-concerning-faith-of-things-not-seen', author: AUGUSTINE, title: /^de fide rerum/i },
  { bookId: 'npnf103-a-treatise-on-faith-and-the-creed', author: AUGUSTINE, title: /^de fide et symb/i },
  { bookId: 'npnf103-on-the-creed', author: AUGUSTINE, title: /^de symb/i },
  // the psalm, by the Vulgate's numbering, as the CCEL volume numbers it
  { bookId: 'npnf108-expositions-on-the-book-of-psalms', author: AUGUSTINE, title: /^(?:enarr|in ps)/i },
  { bookId: 'npnf209-an-exact-exposition-of-the-orthodox-faith', author: DAMASCENE, title: /^de fide orth/i },
];

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

// The work a citation cites, by its author, title and location; undefined when it is none of them.
// works: the aliases to try (the Fathers', or another author's: core/aristotle_citations.ts)
export const citedFatherWork = (
  author: string, title: string, location: string, works: FatherWork[] = FATHER_WORKS,
): FatherWork | undefined => (
  works.find((w) => (
    w.author.test(collapse(author))
      && w.title.test(collapse(title))
      && (w.location === undefined || w.location.test(location))
  ))
);

// Labels in a location: of a book ("lib. xv", "l. 2", "Book III"), of a chapter ("c. 9", "cap. 16",
// "chap. 9"), and those after which the numbers aren't the work's divisions ("n. 32", "sect. 4",
// "qu. 21", "col. 1247")
const BOOK_LABEL    = /^(?:lib|l|liber|book|bk)$/;
const CHAPTER_LABEL = /^(?:c|cap|caput|chap|chapter|ch)$/;

// Most places one range ("4-6") is read as
const MAX_RANGE = 20;

type Token = { kind: 'book' | 'chapter' | 'end' } | { kind: 'number', values: number[] };

// A location's labels and numbers, in order, up to the first word that is neither (the text going
// on: "in Joan.", "ad Marcell.", "(Migne, P. L., ...)"). A list or range of numbers with no space
// ("3,4", "4-6") is one token of several values.
const tokensOf = (location: string): Token[] => {
  const words           = location.toLowerCase().match(/\d+(?:\s*[-–]\s*\d+|,\d+)*|[a-z]+|\(/g) ?? [];
  const tokens: Token[] = [];

  for (let i = 0; i < words.length; i++) {
    const word    = words[i]!;
    const range   = word.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    const nextIsN = /^\d|^[ivxlc]+$/.test(words[i + 1] ?? '');

    if (range && Number(range[2]) >= Number(range[1])
      && Number(range[2]) - Number(range[1]) < MAX_RANGE) {
      const from = Number(range[1]);
      tokens.push({ kind:   'number',
                    values: Array.from(
                      { length: Number(range[2]) - from + 1 }, (_, k) => from + k,
                    ) });
    }
    else if (/^\d+(?:,\d+)*$/.test(word)) {
      tokens.push({ kind: 'number', values: word.split(',').map(Number) });
    }
    // "c. 9", "l. 2": a label only before a number (else "c" is 100 and "l" 50)
    else if (BOOK_LABEL.test(word) && (word !== 'l' || nextIsN)) {
      tokens.push({ kind: 'book' });
    }
    else if (CHAPTER_LABEL.test(word) && (word !== 'c' || nextIsN)) {
      tokens.push({ kind: 'chapter' });
    }
    else if (numberOf(word) !== null && /^[ivxlcdm]+$|^\d+$/.test(word)) {
      tokens.push({ kind: 'number', values: [numberOf(word)!] });
    }
    else {
      tokens.push({ kind: 'end' });
      break;
    }
  }

  return tokens;
};

// The places a location cites in a work whose pages are cited by parts of these types, outermost
// first (["book", "chapter"], or ["chapter"]): its numbers in order, one per type ("xiv, 9" ->
// book 14, chapter 9), a labelled one in its label's place ("XI, c. 9", "lib. xv. cap. 16"), and
// a list at the last one a place each ("i, 3,4" -> book 1, chapter 3 and book 1, chapter 4).
// Fewer numbers than types cite the outer divisions ("ix" -> book 9); numbers past the last type
// (a paragraph, "IV. 10, 15") are left out. [] when it starts with no number.
export const parseFatherLocation = (location: string, types: string[]): CitationPart[][] => {
  const values: number[][] = [];
  let at                   = 0;
  let label: 'book' | 'chapter' | undefined;

  for (const token of tokensOf(location)) {
    if (token.kind === 'end' || at >= types.length) {
      break;
    }
    else if (token.kind === 'book' || token.kind === 'chapter') {
      label = token.kind;
    }
    else {
      // a labelled number goes to its label's type, where the work has it
      const labelled = label === undefined ? -1 : types.indexOf(label, at);
      const place    = labelled >= 0 ? labelled : at;
      // a list is several places only at the last type; elsewhere its first number
      values[place] = place === types.length - 1 ? token.values : token.values.slice(0, 1);
      at            = place + 1;
      label         = undefined;
    }
  }

  const path = types.slice(0, values.length).map((type, i) => ({ type, values: values[i] }));
  if (path.length === 0 || path.some((p) => p.values === undefined)) {
    return [];
  }
  else {
    return path.reduce<CitationPart[][]>(
      (places, { type, values: vs }) => places.flatMap((parts) => vs!.map((value) => [
        ...parts, { type, value },
      ])),
      [[]],
    );
  }
};

// The part types a work's pages are cited by, from its book_pages_to_citations rows' parts: those
// of its most divided rows (["book", "chapter"]); [] for a work with none
export const divisionTypes = (rows: { parts: CitationPart[] }[]): string[] => (
  rows.reduce<string[]>(
    (deepest, row) => (row.parts.length > deepest.length ? row.parts.map((p) => p.type) : deepest),
    [],
  )
);

// The place as the work's pages have it: itself when it is on a page, else, for a place of a
// division no page is cited by alone (a whole book of the Exact Exposition, whose pages are its
// chapters), the first page under it, as the table of contents goes there (see contentsOf in
// core/contents.ts). undefined when no page is under it. rows: in page order.
export const placeOnPage = (
  place: CitationPart[], rows: { parts: CitationPart[] }[]
): CitationPart[] | undefined => {
  if (isOnSomePage(place, rows)) {
    return place;
  }
  else {
    return rows.find((row) => place.every((p, i) => (
      row.parts[i]?.type === p.type && row.parts[i]?.value === p.value
    )))?.parts;
  }
};

// A place is on a page when every part of one of the page's rows is the place's part in the same
// position (as citedCountsByPage in model/page_insights.ts counts it)
export const isOnSomePage = (place: CitationPart[], rows: { parts: CitationPart[] }[]): boolean => (
  rows.some((row) => row.parts.every((p, i) => (
    place[i]?.type === p.type && place[i]?.value === p.value
  )))
);
