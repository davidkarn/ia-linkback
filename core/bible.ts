// The books of the Bible in the Catholic (Douay) canon, and how sources name them. A Bible
// citation's "book" location is the book's position in DOUAY_CANON (1-73).

// The id Bible citations reference: not a book itself, but an alternate id of the Bibles in the
// collection (the alternate_ids table: douay-rheims)
export const BIBLE_BOOK_ID = 'bible';

// Whether a book with these alternate ids is a Bible (a translation of it):
// citations of the Bible point at it
export const isBible = (alternateIds: string[]): boolean => alternateIds.includes(BIBLE_BOOK_ID);

// Lower case, in canonical order
export const DOUAY_CANON = [
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'josue', 'judges', 'ruth',
  '1 kings', '2 kings', '3 kings', '4 kings', '1 paralipomenon', '2 paralipomenon', '1 esdras',
  '2 esdras', 'tobias', 'judith', 'esther', 'job', 'psalms', 'proverbs', 'ecclesiastes',
  'canticles', 'wisdom', 'ecclesiasticus', 'isaias', 'jeremias', 'lamentations', 'baruch',
  'ezechiel', 'daniel', 'osee', 'joel', 'amos', 'abdias', 'jonas', 'micheas', 'nahum', 'habacuc',
  'sophonias', 'aggeus', 'zacharias', 'malachias', '1 machabees', '2 machabees', 'matthew', 'mark',
  'luke', 'john', 'acts', 'romans', '1 corinthians', '2 corinthians', 'galatians', 'ephesians',
  'philippians', 'colossians', '1 thessalonians', '2 thessalonians', '1 timothy', '2 timothy',
  'titus', 'philemon', 'hebrews', 'james', '1 peter', '2 peter', '1 john', '2 john', '3 john',
  'jude', 'apocalypse',
];

// A book's name for display: "1 Kings", "Apocalypse"
export const bookName = (bookNumber: number): string => (
  (DOUAY_CANON[bookNumber - 1] ?? '').replace(/\b[a-z]/g, (c) => c.toUpperCase())
);

const numberOf = (name: string) => DOUAY_CANON.indexOf(name) + 1;

// OSIS book codes as CCEL's ThML uses them (scripRef parsed="vul|John|14|6|0|0"), for the Vulgate.
// Its 1Kgs and 2Kgdms are the Douay 1 and 2 Kings (1 and 2 Samuel), 1Esd and 2Esd the Douay 1 and 2
// Esdras (Ezra and Nehemiah).
const OSIS: Record<string, string> = {
  Gen:      'genesis',
  Exod:     'exodus',
  Lev:      'leviticus',
  Num:      'numbers',
  Deut:     'deuteronomy',
  Josh:     'josue',
  Judg:     'judges',
  Ruth:     'ruth',
  '1Sam':   '1 kings',
  '2Sam':   '2 kings',
  '1Kgs':   '1 kings',
  '2Kgs':   '2 kings',
  '1Kgdms': '1 kings',
  '2Kgdms': '2 kings',
  '3Kgdms': '3 kings',
  '4Kgdms': '4 kings',
  '1Chr':   '1 paralipomenon',
  '2Chr':   '2 paralipomenon',
  Ezra:     '1 esdras',
  Neh:      '2 esdras',
  '1Esd':   '1 esdras',
  '2Esd':   '2 esdras',
  Tob:      'tobias',
  Jdt:      'judith',
  Esth:     'esther',
  Job:      'job',
  Ps:       'psalms',
  Prov:     'proverbs',
  Eccl:     'ecclesiastes',
  Song:     'canticles',
  Wis:      'wisdom',
  Sir:      'ecclesiasticus',
  Isa:      'isaias',
  Jer:      'jeremias',
  Lam:      'lamentations',
  Bar:      'baruch',
  Ezek:     'ezechiel',
  Dan:      'daniel',
  Hos:      'osee',
  Joel:     'joel',
  Amos:     'amos',
  Obad:     'abdias',
  Jonah:    'jonas',
  Mic:      'micheas',
  Nah:      'nahum',
  Hab:      'habacuc',
  Zeph:     'sophonias',
  Hag:      'aggeus',
  Zech:     'zacharias',
  Mal:      'malachias',
  '1Macc':  '1 machabees',
  '2Macc':  '2 machabees',
  Matt:     'matthew',
  Mark:     'mark',
  Luke:     'luke',
  John:     'john',
  Acts:     'acts',
  Rom:      'romans',
  '1Cor':   '1 corinthians',
  '2Cor':   '2 corinthians',
  Gal:      'galatians',
  Eph:      'ephesians',
  Phil:     'philippians',
  Col:      'colossians',
  '1Thess': '1 thessalonians',
  '2Thess': '2 thessalonians',
  '1Tim':   '1 timothy',
  '2Tim':   '2 timothy',
  Titus:    'titus',
  Phlm:     'philemon',
  Heb:      'hebrews',
  Jas:      'james',
  '1Pet':   '1 peter',
  '2Pet':   '2 peter',
  '1John':  '1 john',
  '2John':  '2 john',
  '3John':  '3 john',
  Jude:     'jude',
  Rev:      'apocalypse',
};

// The book number for an OSIS code, or null
export const osisBookNumber = (code: string): number | null => (
  OSIS[code] ? numberOf(OSIS[code]) : null
);

// Abbreviations as printed ("Ecclus.", "3 Kings", "Apoc."), lower case without the period, for
// references that come without a parsed form. A leading number is part of the name ("3 kings").
const ABBREVIATIONS: Record<string, string> = {
  gn:       'genesis',
  gen:      'genesis',
  ex:       'exodus',
  exod:     'exodus',
  lev:      'leviticus',
  num:      'numbers',
  dt:       'deuteronomy',
  deut:     'deuteronomy',
  jos:      'josue',
  josh:     'josue',
  joshua:   'josue',
  judg:     'judges',
  paral:    'paralipomenon',
  para:     'paralipomenon',
  esdr:     'esdras',
  esdra:    'esdras',
  esd:      'esdras',
  tob:      'tobias',
  jdt:      'judith',
  esth:     'esther',
  ps:       'psalms',
  psalm:    'psalms',
  prov:     'proverbs',
  eccles:   'ecclesiastes',
  eccl:     'ecclesiastes',
  cant:     'canticles',
  wis:      'wisdom',
  ecclus:   'ecclesiasticus',
  is:       'isaias',
  isa:      'isaias',
  isaiah:   'isaias',
  jer:      'jeremias',
  jeremiah: 'jeremias',
  lam:      'lamentations',
  bar:      'baruch',
  ezech:    'ezechiel',
  ezek:     'ezechiel',
  dan:      'daniel',
  os:       'osee',
  hos:      'osee',
  abd:      'abdias',
  jon:      'jonas',
  mich:     'micheas',
  hab:      'habacuc',
  soph:     'sophonias',
  agg:      'aggeus',
  zach:     'zacharias',
  mal:      'malachias',
  mach:     'machabees',
  macc:     'machabees',
  mt:       'matthew',
  mat:      'matthew',
  matt:     'matthew',
  mk:       'mark',
  lk:       'luke',
  luc:      'luke',
  jn:       'john',
  rom:      'romans',
  cor:      'corinthians',
  gal:      'galatians',
  eph:      'ephesians',
  phil:     'philippians',
  col:      'colossians',
  thess:    'thessalonians',
  tim:      'timothy',
  tit:      'titus',
  philem:   'philemon',
  heb:      'hebrews',
  jas:      'james',
  pet:      'peter',
  apoc:     'apocalypse',
  rev:      'apocalypse',
};

// The book number for a book as printed ("3 Kings", "Ecclus", "1 Cor"), or null
export const printedBookNumber = (printed: string): number | null => {
  const m = printed.trim().toLowerCase().replace(/\.$/, '').match(/^(?:([1-4])\s*)?([a-z]+)$/);

  if (!m) {
    return null;
  }
  else {
    const name = ABBREVIATIONS[m[2]!] ?? m[2]!;
    const book = numberOf(m[1] ? `${ m[1] } ${ name }` : name);
    return book > 0 ? book : null;
  }
};
