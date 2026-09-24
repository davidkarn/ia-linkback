// Turn a citation's free-text `location` (e.g. "qu. 13, art. 9", "pp. 1-3, 5", "II, 13, 97b") into
// the CitationLocation list defined in types.ts: one {type, value} record per cited item, in the order the
// items appear, with ranges expanded ("pp. 1-3, 5" -> page 1, 2, 3, 5).
//
// Conventions (values must be numbers, so):
//   - Roman numerals are converted to integers.
//   - Bible: `book` is the book's position in the Catholic (Douay) canon, 1-73; then `chapter`, `verse`s.
//   - Aristotle / Plato (Bekker / Stephanus refs like "981b 28", "29d"): `position` records for the page
//     number, the column letter (a=1 ... e=5) and the line number, in that order.
//   - Summa Theologica parts: `volume`, Dominican 5-vol numbering: I=1, I-II=2, II-II=3, III=4, Suppl.=5.
//   - Locators with no matching type: § / n. / thes. / col. / ad / obj. -> `position`;
//     disputation / dissertation -> `question`; sectio / dubium -> `article`; tractatus -> `book`;
//     distinctio -> `chapter`; Part -> `volume`.
import type { CitationLocation } from './types';

type LocType = CitationLocation['type'];
export type CitationForLocations = {
  author: string | null,
  title: string | null,
  location: string | null,
  kind?: string,
};

// A range larger than this is almost certainly a mis-read (or a whole-work span); keep only its endpoints.
const MAX_RANGE = 250;

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const ROMAN_VALID = /^(?=[ivxlcdm])m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/;
const ROMAN_DIGITS: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

// Strict Roman numeral -> integer (null when not a numeral). Mixed case and the single lowercase letters
// c/l/d/m (abbreviations far more often than numerals) are rejected.
export const roman_value = (s: string): number | null => {
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return null;
  const t = s.toLowerCase();
  if (t.length === 1 && 'cldm'.includes(t)) return null;
  if (!ROMAN_VALID.test(t)) return null;
  let total = 0;
  for (let i = 0; i < t.length; i++) {
    const v = ROMAN_DIGITS[t[i]!]!;
    total += v < (ROMAN_DIGITS[t[i + 1] ?? ''] ?? 0) ? -v : v;
  }
  return total;
};

const num_value = (s: string): number | null => /^\d+$/.test(s) ? parseInt(s, 10) : roman_value(s);

// Values a..b inclusive. "112-14" means 112..114 and "231-2" means 231..232.
const expand_range = (a: number, b: number, arabic: boolean): number[] => {
  if (arabic && b < a) {
    const as = String(a), bs = String(b);
    if (bs.length < as.length) b = parseInt(as.slice(0, as.length - bs.length) + bs, 10);
  }
  if (b < a) return [a];
  if (b - a + 1 > MAX_RANGE) return [a, b];
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
};

// ---------------------------------------------------------------------------
// Bible
// ---------------------------------------------------------------------------

const DOUAY_CANON = [
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'josue', 'judges', 'ruth',
  '1 kings', '2 kings', '3 kings', '4 kings', '1 paralipomenon', '2 paralipomenon', '1 esdras', '2 esdras',
  'tobias', 'judith', 'esther', 'job', 'psalms', 'proverbs', 'ecclesiastes', 'canticles', 'wisdom',
  'ecclesiasticus', 'isaias', 'jeremias', 'lamentations', 'baruch', 'ezechiel', 'daniel', 'osee', 'joel',
  'amos', 'abdias', 'jonas', 'micheas', 'nahum', 'habacuc', 'sophonias', 'aggeus', 'zacharias', 'malachias',
  '1 machabees', '2 machabees', 'matthew', 'mark', 'luke', 'john', 'acts', 'romans', '1 corinthians',
  '2 corinthians', 'galatians', 'ephesians', 'philippians', 'colossians', '1 thessalonians', '2 thessalonians',
  '1 timothy', '2 timothy', 'titus', 'philemon', 'hebrews', 'james', '1 peter', '2 peter', '1 john', '2 john',
  '3 john', 'jude', 'apocalypse',
];
const BIBLE_ALIASES: Record<string, string> = {
  joshua: 'josue', jos: 'josue', judg: 'judges', tob: 'tobias', tobit: 'tobias', ps: 'psalms', psalm: 'psalms',
  cant: 'canticles', 'song of songs': 'canticles', wis: 'wisdom', ecclus: 'ecclesiasticus', sirach: 'ecclesiasticus',
  isaiah: 'isaias', isa: 'isaias', jeremiah: 'jeremias', jer: 'jeremias', ezekiel: 'ezechiel', ezek: 'ezechiel',
  hosea: 'osee', hos: 'osee', obadiah: 'abdias', jonah: 'jonas', jon: 'jonas', micah: 'micheas', mich: 'micheas',
  habakkuk: 'habacuc', zephaniah: 'sophonias', haggai: 'aggeus', zechariah: 'zacharias', malachi: 'malachias',
  bar: 'baruch', dan: 'daniel', ezra: '1 esdras', nehemiah: '2 esdras', nehemias: '2 esdras',
  revelation: 'apocalypse', apoc: 'apocalypse',
  chronicles: 'paralipomenon', maccabees: 'machabees',
  // 1 Kings..4 Kings are Douay names for 1-2 Samuel, 1-2 Kings; "1 Chronicles" is "1 Paralipomenon", etc.
  '1 chronicles': '1 paralipomenon', '2 chronicles': '2 paralipomenon',
  '1 maccabees': '1 machabees', '2 maccabees': '2 machabees',
  '3 acts': 'acts',
};
// An unnumbered "Corinthians", "Peter", "Kings"... is taken to be the first.
const UNNUMBERED_DEFAULTS = ['kings', 'paralipomenon', 'esdras', 'machabees', 'corinthians', 'thessalonians', 'timothy', 'peter', 'john'];

const bible_book_number = (title: string | null): number | null => {
  if (!title) return null;
  let t = title.toLowerCase().replace(/\./g, '').trim();
  t = BIBLE_ALIASES[t] ?? t;
  // "Kings" / "Peter" / ... with no number, or an alias that lost its number ("chronicles")
  const bare = t.replace(/^\d\s+/, '');
  const bare_alias = BIBLE_ALIASES[bare];
  if (bare_alias && !/^\d/.test(t)) t = bare_alias;
  else if (/^\d\s+/.test(t) && bare_alias) t = t.match(/^\d/)![0] + ' ' + bare_alias;
  let idx = DOUAY_CANON.indexOf(t);
  if (idx < 0 && UNNUMBERED_DEFAULTS.includes(t) && t !== 'john') idx = DOUAY_CANON.indexOf('1 ' + t);
  return idx < 0 ? null : idx + 1;
};

// "XIV, 12", "XI, 33", "IV, 4-6", "XIV, 12. 15", "3, 4, 5"
const bible_locations = (title: string | null, location: string | null): CitationLocation[] => {
  const out: CitationLocation[] = [];
  const book = bible_book_number(title);
  if (book !== null) out.push({ type: 'book', value: book });
  if (!location) return out;

  const m = location.replace(/[–—]/g, '-').match(/^\s*([ivxlcIVXLC]+|\d+)\s*(?:[,.:]\s*(.*))?$/);
  if (!m) return out;
  const chapter = num_value(m[1]!);
  if (chapter === null) return out;
  out.push({ type: 'chapter', value: chapter });

  for (const vm of (m[2] ?? '').matchAll(/(\d+)[a-z]?(?:\s*-\s*(\d+)[a-z]?)?/g)) {
    const a = parseInt(vm[1]!, 10);
    const values = vm[2] ? expand_range(a, parseInt(vm[2], 10), true) : [a];
    for (const v of values) out.push({ type: 'verse', value: v });
  }
  return out;
};

// ---------------------------------------------------------------------------
// Which kind of work is this?
// ---------------------------------------------------------------------------

const ANCIENT_AUTHOR = /\b(?:Augustine|Aquinas|Aristotle|Plato|Cicero|Boethius|Anselm|Bonaventure|Scotus|Suarez|Bellarmine|Lugo|Billuart|Petavius|Gregory|Chrysostom|Jerome|Ambrose|Cyprian|Tertullian|Origen|Athanasius|Basil|Cyril|Hilary|Irenaeus|Justin|Lactantius|Damascen[e]?|Eusebius|Epiphanius|Lombard|Alvarez|Gotti|Ruiz|Lessius|Vasquez|Molina|Cajetan|Capreolus|Sylvester|Albert|Hugh|Peter|Leo|Cassian|Fulgentius|Vincent|Optatus|Theodoret|Nazianz|Nyss|Thom)\w*/i;
const LATINISH_TITLE = /^(?:De|In|Contra|Contr|Ad|Adv|Epist|Ep|Serm|Sermones|Hom|Homil|Tract|Quaest|Quaestiones|Opusc|Comment|Comm|Sent|Instit|Praelect|Theol|Disp|Confess|Haer|Apol|Enarr|Catech|Or|Hist|Sess|Conc|Supplement|Resp|Lib|Liber|Summa|Metaph|Metaphys|Phys|Ethic|Polit|Anal|Categ|Rhet|Poet|Mem|Rep|Laws|Rem)\b/i;
const PLATO_TITLE = /^(?:Rep(?:ublic|\.)?|Phaedo|Phaedrus|Gorgias|Laws|Apol(?:ogy)?|Crito|Meno|Theaetetus|Timaeus|Sophist|Symposium|Parmenides|Philebus|Protagoras|Euthyphro|Cratylus|Statesman|Politicus|Charmides|Laches|Lysis|Euthydemus|Critias|Ion)\b/i;
const ARISTOTLE_TITLE = /^(?:Metaph(?:ysics|ys)?|Met|Phys(?:ics)?|Nic(?:omachean)?|Eth(?:ics|ic)?|Polit(?:ics)?|De\s+(?:Anima|Caelo|Gen)|Anal(?:ytics)?|Posterior|Prior|Categ(?:ories)?|Rhet(?:oric)?|Poet(?:ics)?|Topics|Soph)/i;

// ---------------------------------------------------------------------------
// Tokenising a location string
// ---------------------------------------------------------------------------

type Item =
  | { kind: 'labelled', type: LocType, values: number[] }
  | { kind: 'bare', values: number[], roman: boolean, upper: boolean }
  | { kind: 'fixed', locs: CitationLocation[] };

// label word (lowercase, no period) -> [type, may be followed by more bare numbers ("pp. 4, 5")]
const LABELS: Record<string, [LocType, boolean]> = {
  p: ['page', true], pp: ['page', true], page: ['page', true], pages: ['page', true],
  vol: ['volume', false], vols: ['volume', false], volume: ['volume', false], tom: ['volume', false],
  t: ['volume', false], v: ['volume', false], part: ['volume', false], pars: ['volume', false], pt: ['volume', false],
  lib: ['book', false], libri: ['book', false], book: ['book', false], bk: ['book', false], liv: ['book', false],
  livre: ['book', false], tr: ['book', false], tract: ['book', false],
  ch: ['chapter', false], chap: ['chapter', false], chaps: ['chapter', true], chapter: ['chapter', false],
  chapters: ['chapter', true], cap: ['chapter', false], caput: ['chapter', false], c: ['chapter', false],
  dist: ['chapter', false],
  q: ['question', false], qq: ['question', true], qu: ['question', false], quest: ['question', false],
  question: ['question', false], questions: ['question', true],
  disp: ['question', false], disputatio: ['question', false], diss: ['question', false], dissert: ['question', false],
  art: ['article', false], article: ['article', false], a: ['article', false], aa: ['article', true],
  articles: ['article', true], sect: ['article', false], sectio: ['article', false], sec: ['article', false],
  dub: ['article', false], dubium: ['article', false],
  lect: ['lecture', false], lectio: ['lecture', false], lec: ['lecture', false],
  '§': ['position', true], '§§': ['position', true], n: ['position', true], nn: ['position', true],
  no: ['position', true], nos: ['position', true], thes: ['position', false], thesis: ['position', false],
  col: ['position', true], cols: ['position', true], can: ['position', false], sess: ['position', false],
  prop: ['position', false], ad: ['position', false], obj: ['position', false],
};
// one-letter labels are only labels when written with their period: "c. 5", "a. 2", "n. 10"
const NEEDS_PERIOD = new Set(['p', 't', 'v', 'c', 'a', 'n']);

const LABEL_RE = /(§{1,2}|[A-Za-z]+)(\.?)/y;
const ROMAN_TOKEN = /[ivxlcdmIVXLCDM]+(?![\p{L}\d])/uy;
const ARABIC_TOKEN = /\d+[a-z]?(?![\p{L}\d])|\d+(?=\D|$)/uy;
const SEP = /[\s,;:.()\[\]]+/y;
const LIST_SEP = /\s*(?:,|&|\band\b)\s*/y;
const RANGE_SEP = /\s*-\s*/y;

// Bekker / Stephanus: 981b 28, 1029a 26-28, 1037b 8-1038a 35, 29d
const BEKKER = /(\d{1,4})([a-e])(?:\s*(\d{1,3})(?:\s*-\s*(?:(\d{1,4})([a-e])\s*)?(\d{1,3}))?)?(?![\p{L}\d])/uy;
const COLUMN = (letter: string) => letter.charCodeAt(0) - 96;   // a=1

// Summa Theologica parts: 1a, 2a, 3a, 1a-2ae, 2a-2ae, Ia, ia zae, "IIa IIae"; also OCR "12"/"18" for "1a".
const PART_DIGIT = (s: string): number | null => {
  const t = s.toLowerCase();
  if (['1', 'i', 'l'].includes(t)) return 1;
  if (['2', 'ii', 'z'].includes(t)) return 2;
  if (['3', 'iii'].includes(t)) return 3;
  return null;
};
const SUMMA_PART = /(1|2|3|III|II|I|iii|ii|i|l)a(?:\s*[-.,]?\s*(1|2|3|III|II|I|iii|ii|i|z|l)ae?)?(?![\p{L}\d])/uy;
const SUMMA_ROMAN_PAIR = /(II|I)\.\s*IIae?(?![\p{L}\d])/uy;   // "I. IIa" = 1a 2ae, "II. IIae" = 2a 2ae
const SUMMA_OCR_PART = /(12|18)(?=\s*[,:]?\s*(?:qu?\b|q\.|[IVXLC]+\b))/y;
// A lone Roman numeral in front of the question: "i., q. 5" (Prima pars), "III, q. 2" (Tertia pars)
const SUMMA_ROMAN_PART = /(III|II|I|iii|ii|i)[.,]?(?=\s*,?\s*q(?:u|uest)?\b)/y;

const summa_volume = (first: number, second: number | null): number => {
  if (second === null) return first === 3 ? 4 : first;   // 1a=1, 3a=4 (2a alone is unusual: keep 2)
  if (first === 1 && second === 2) return 2;
  if (first === 2 && second === 2) return 3;
  return first;
};

type Ctx = { summa: boolean, greek: boolean, plato: boolean, aristotle: boolean, classical: boolean, series: boolean };

const tokenize = (loc: string, ctx: Ctx): Item[] => {
  const items: Item[] = [];
  let pos = 0;
  const at = (re: RegExp): RegExpExecArray | null => { re.lastIndex = pos; return re.exec(loc); };

  // one number (arabic or roman), optionally the start of a range
  const read_number = (): { values: number[], roman: boolean, upper: boolean } | null => {
    let m = at(ARABIC_TOKEN);
    let a: number, roman = false, upper = false, start = pos;
    if (m) { a = parseInt(m[0], 10); pos += m[0].length; }
    else {
      m = at(ROMAN_TOKEN);
      const v = m ? roman_value(m[0]) : null;
      if (!m || v === null) return null;
      a = v; roman = true; upper = m[0] === m[0].toUpperCase(); pos += m[0].length;
    }
    // range?
    const rs = at(RANGE_SEP);
    if (rs) {
      const save = pos;
      pos += rs[0].length;
      const m2 = roman ? at(ROMAN_TOKEN) : at(ARABIC_TOKEN);
      const b = m2 ? (roman ? roman_value(m2[0]) : parseInt(m2[0], 10)) : null;
      if (m2 && b !== null) { pos += m2[0].length; return { values: expand_range(a, b, !roman), roman, upper }; }
      pos = save;
    }
    void start;
    return { values: [a], roman, upper };
  };

  while (pos < loc.length) {
    let m: RegExpExecArray | null;
    if ((m = at(SEP))) { pos += m[0].length; continue; }

    // Summa part
    if (ctx.summa) {
      if ((m = at(SUMMA_ROMAN_PAIR))) {
        items.push({ kind: 'fixed', locs: [{ type: 'volume', value: m[1] === 'I' ? 2 : 3 }] });
        pos += m[0].length; continue;
      }
      if ((m = at(SUMMA_PART))) {
        const first = PART_DIGIT(m[1]!)!, second = m[2] ? PART_DIGIT(m[2]) : null;
        items.push({ kind: 'fixed', locs: [{ type: 'volume', value: summa_volume(first, second) }] });
        pos += m[0].length; continue;
      }
      if ((m = at(SUMMA_ROMAN_PART))) {
        const n = roman_value(m[1]!)!;
        items.push({ kind: 'fixed', locs: [{ type: 'volume', value: n === 3 ? 4 : n }] });
        pos += m[0].length; continue;
      }
      if ((m = at(SUMMA_OCR_PART))) {
        items.push({ kind: 'fixed', locs: [{ type: 'volume', value: 1 }] });
        pos += m[0].length; continue;
      }
      if (/^suppl/i.test(loc.slice(pos))) {
        items.push({ kind: 'fixed', locs: [{ type: 'volume', value: 5 }] });
        pos += (/^suppl\w*\.?/i.exec(loc.slice(pos))![0]).length; continue;
      }
    }

    // Bekker / Stephanus
    if (ctx.greek && (m = at(BEKKER))) {
      const page = parseInt(m[1]!, 10), col = m[2]!;
      // Bekker pages run 71-1462, columns a/b; Stephanus (Plato) pages are 1-3 digits, columns a-e
      const bekker_ok = ('ab'.includes(col) && (m[1]!.length >= 3 || (ctx.aristotle && page >= 71))) || ctx.plato;
      if (bekker_ok) {
        const locs: CitationLocation[] = [{ type: 'position', value: page }, { type: 'position', value: COLUMN(col) }];
        if (m[3]) {
          const line = parseInt(m[3], 10);
          if (m[6] && m[4]) {                       // 1037b 8-1038a 35 : endpoints only
            locs.push({ type: 'position', value: line });
            locs.push({ type: 'position', value: parseInt(m[4], 10) }, { type: 'position', value: COLUMN(m[5]!) },
              { type: 'position', value: parseInt(m[6], 10) });
          }
          else if (m[6]) for (const l of expand_range(line, parseInt(m[6], 10), true)) locs.push({ type: 'position', value: l });
          else locs.push({ type: 'position', value: line });
        }
        items.push({ kind: 'fixed', locs });
        pos += m[0].length; continue;
      }
    }

    // labelled locator: "pp. 4, 5", "qu. 13", "§§ 93 and 94"
    if ((m = at(LABEL_RE))) {
      const save_word = pos;
      const word = m[1]!.toLowerCase(), has_period = m[2] === '.';
      const info = LABELS[word];
      if (info && (has_period || !NEEDS_PERIOD.has(word))) {
        const save = pos;
        pos += m[0].length;
        const ws = at(/\s*/y)!; pos += ws[0].length;
        const first = read_number();
        if (first) {
          const values = [...first.values];
          if (info[1]) {
            // continuation: "pp. 4, 5", "nn. 275 and 276" (arabic only)
            for (;;) {
              const ls = at(LIST_SEP);
              if (!ls) break;
              const before = pos;
              pos += ls[0].length;
              if (!at(/\d/y)) { pos = before; break; }
              const next = read_number();
              if (!next) { pos = before; break; }
              values.push(...next.values);
            }
          }
          items.push({ kind: 'labelled', type: info[0], values });
          continue;
        }
        pos = save;
      }
      // not a locator word: a bare Roman numeral ("II", "xix") or just a word to skip
      pos = save_word;
      const roman = read_number();
      if (roman) { items.push({ kind: 'bare', ...roman }); continue; }
      pos = save_word + (m[0].length || 1);
      continue;
    }

    // bare number
    const start = pos;
    // A bare year ("(1910)", "1902-3") is a publication date, not a location (Patrologia columns aside).
    const year = !ctx.series && at(/(?:1[4-9]\d\d|20\d\d)(?:\s*-\s*\d{1,4})?(?![\p{L}\d])/uy);
    if (year) { pos += year[0].length; continue; }
    const num = read_number();
    if (num) { items.push({ kind: 'bare', ...num }); continue; }
    pos = start + 1;
  }
  return items;
};

// ---------------------------------------------------------------------------
// Typing the bare numbers, then flattening
// ---------------------------------------------------------------------------

const CLASSICAL_SEQ: LocType[] = ['book', 'chapter', 'position', 'position', 'position'];
const SUMMA_SEQ: LocType[] = ['question', 'article', 'position', 'position'];
const SERIES_SEQ: LocType[] = ['volume', 'position', 'position'];

const type_bare = (items: Item[], ctx: Ctx): void => {
  const bare = items.filter((i): i is Extract<Item, { kind: 'bare' }> => i.kind === 'bare');
  if (!bare.length) return;
  const used = new Set<LocType>();
  for (const i of items) {
    if (i.kind === 'labelled') used.add(i.type);
    if (i.kind === 'fixed') for (const l of i.locs) used.add(l.type);
  }
  const assigned = new Map<Item, LocType>();
  const from_seq = (seq: LocType[]) => {
    const free = seq.filter(t => t === 'position' || !used.has(t));   // skip types already given explicitly
    bare.forEach((b, idx) => assigned.set(b, free[Math.min(idx, free.length - 1)]!));
  };

  if (ctx.series) from_seq(SERIES_SEQ);
  else if (ctx.summa) from_seq(SUMMA_SEQ);
  else {
    // Two or more bare items, or a lowercase-Roman first item ("iii. 11. 17"), are classical citations
    // (book, chapter, section); a lone item depends on the kind of work.
    const classical = ctx.classical || bare.length >= 3 || (bare.length >= 2 && bare[0]!.roman && !bare[0]!.upper);
    if (classical) {
      if (bare.length === 1) {
        const b = bare[0]!;
        const t: LocType = b.roman ? 'book' : (ctx.greek && b.values[0]! >= 100) ? 'position' : 'chapter';
        assigned.set(b, used.has(t) && t !== 'position' ? 'position' : t);
      }
      else from_seq(CLASSICAL_SEQ);
    }
    else {
      // modern work: Roman = volume (then chapter), Arabic = page
      let volume_used = used.has('volume');
      for (const b of bare) {
        if (b.roman) {
          if (!volume_used && b.upper) { assigned.set(b, 'volume'); volume_used = true; }
          else if (!volume_used && bare[0] === b) { assigned.set(b, 'volume'); volume_used = true; }
          else assigned.set(b, 'chapter');
        }
        else assigned.set(b, 'page');
      }
    }
  }
  for (const [item, type] of assigned) (item as any).type = type;
};

const flatten = (items: Item[]): CitationLocation[] => {
  const out: CitationLocation[] = [];
  for (const i of items) {
    if (i.kind === 'fixed') out.push(...i.locs);
    else {
      const type = i.kind === 'labelled' ? i.type : (i as any).type as LocType | undefined;
      if (type) for (const v of i.values) out.push({ type, value: v });
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export const citation_locations = (
  c: CitationForLocations,
  opts: { explicit_only?: boolean } = {},
): CitationLocation[] => {
  if (c.kind === 'bible') return bible_locations(c.title, c.location);
  const location = c.location?.trim();
  if (!location) return [];

  const title = c.title ?? '';
  const author = c.author ?? '';
  const loc = location.replace(/[–—]/g, '-').replace(/<\/?i>/g, '');
  const plato = /\bPlato\b/i.test(author) || PLATO_TITLE.test(title);
  const aristotle = /\bAristotle\b/i.test(author) || ARISTOTLE_TITLE.test(title);
  const ctx: Ctx = {
    summa: /^Summa Theologica$/i.test(title),
    plato,
    aristotle,
    greek: plato || aristotle || /\b\d{3,4}[ab]\d{0,3}\b/.test(loc),
    series: /^Patrologia/i.test(title),
    classical: c.kind === 'known' || ANCIENT_AUTHOR.test(author) || LATINISH_TITLE.test(title) || plato || aristotle,
  };
  let items = tokenize(loc, ctx);
  // Reading loose prose: trust only numbers that carry their own label ("p. 12", "qu. 3").
  if (opts.explicit_only) items = items.filter(i => i.kind === 'labelled');
  type_bare(items, ctx);
  return flatten(items);
};

// ---------------------------------------------------------------------------
// Adding the field to a footnote's citations
// ---------------------------------------------------------------------------

type CitationRecord = CitationForLocations & { raw: string, citationLocations?: CitationLocation[] };

// Sets `citationLocations` on every citation of one footnote. When a citation has no `location`, labelled
// locators are looked for in the `raw` text after its title, but only if that raw text belongs to that
// citation alone (a segment naming several works cannot say which one a locator belongs to).
export const add_citation_locations = (citations: CitationRecord[]): void => {
  const raw_uses = new Map<string, number>();
  for (const c of citations) raw_uses.set(c.raw, (raw_uses.get(c.raw) ?? 0) + 1);

  for (const c of citations) {
    let locations = citation_locations(c);
    if (!c.location && c.kind !== 'bible' && c.title && raw_uses.get(c.raw) === 1) {
      const at = c.raw.toLowerCase().indexOf(c.title.toLowerCase());
      if (at >= 0) {
        locations = citation_locations({ ...c, location: c.raw.slice(at + c.title.length) }, { explicit_only: true });
      }
    }
    c.citationLocations = locations;
  }
};
