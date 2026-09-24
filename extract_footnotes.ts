// Extract every footnote from the surya OCR books, locate where each footnote is
// referenced, and pull out any citations (author / title / location) the footnote makes.
//
// Usage (from src/):  npx tsx extract_footnotes.ts [book-folder ...]
// Output:             output/footnotes.json, output/citations.csv, output/summary.json
import fs from 'node:fs';
import path from 'node:path';
import { add_citation_locations } from './citation_locations';
import type { CitationLocation } from './types';

const SURYA_DIR = '../scholshelf/results/surya';
const PDF_DIR = '../scholshelf';
const OUT_DIR = 'output';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SuryaBlock = { label: string, html: string, reading_order: number, bbox: number[] };
type SuryaPage = { blocks: SuryaBlock[], page: number };

type Citation = {
  author: string | null,
  title: string | null,
  location: string | null,
  parts: Record<string, string>,
  kind: 'bible' | 'titled' | 'known' | 'ibid' | 'op_cit',
  confidence: 'high' | 'medium',
  // set when author/title were inherited from an earlier citation (Ibid., op. cit.)
  resolved_from?: { footnote_number: string | null, page: number | null },
  raw: string,
  citationLocations: CitationLocation[],   // see citation_locations.ts
};

type Footnote = {
  book: string,
  book_filename: string | null,
  footnote_number: number | null,
  marker: string | null,
  footnote_page: number | null,          // printed page number
  footnote_scan_page: number,            // page index in the results.json (1-based)
  footnote_end_scan_page?: number,       // set when the footnote runs onto later pages
  reference_page: number | null,         // printed page on which the footnote is referenced
  reference_scan_page: number | null,
  reference_method: string,
  reference_context: string | null,
  text: string,
  has_citation: boolean,
  citations: Citation[],
};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&nbsp;': ' ',
};
const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|nbsp|#x27|#39);/g, m => ENTITIES[m]);
const strip_tags = (html: string) => decode(html.replace(/<[^>]+>/g, ''));
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

// Keep <i> (italics are our best title signal); flatten everything else to text.
const to_working = (html: string): string => squash(decode(
  html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(?:p|div|center|b|em|strong|sup|sub|span|u|small)[^>]*>/gi, m => /^<\/?(?:em)/i.test(m) ? (m[1] === '/' ? '</i>' : '<i>') : '')
    .replace(/<(?!\/?i>)[^>]+>/gi, '')
)).replace(/<\/i>\s*<i>/g, ' ');

// ---------------------------------------------------------------------------
// Printed page numbers
// ---------------------------------------------------------------------------

const page_candidates = (page: SuryaPage): number[] => {
  const out: number[] = [];
  for (const b of page.blocks) {
    if (b.label !== 'PageHeader' && b.label !== 'PageFooter') continue;
    const t = squash(strip_tags(b.html));
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(\d{1,4})$/))) out.push(+m[1]);
    else {
      if ((m = t.match(/^(\d{1,4})\s+\D/))) out.push(+m[1]);
      if ((m = t.match(/\D\s+(\d{1,4})$/))) out.push(+m[1]);
    }
  }
  return out;
};

// Printed number = scan index + offset. The offset is the consensus of the header/footer
// numbers found on neighbouring pages, so pages whose header OCR failed still get a number.
const printed_pages = (pages: SuryaPage[]): (number | null)[] => {
  const cands = pages.map(page_candidates);
  const W = 10;
  return pages.map((page, i) => {
    const counts = new Map<number, number>();
    for (let j = Math.max(0, i - W); j <= Math.min(pages.length - 1, i + W); j++) {
      if (j === i) continue;
      for (const c of cands[j]) {
        const off = c - pages[j].page;
        counts.set(off, (counts.get(off) ?? 0) + 1);
      }
    }
    const own = cands[i].map(c => c - page.page).find(off => (counts.get(off) ?? 0) >= 1);
    if (own !== undefined) return page.page + own;
    const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    if (n < 2) return null;
    const printed = page.page + best;
    return printed >= 1 ? printed : null;
  });
};

// ---------------------------------------------------------------------------
// Footnote parsing
// ---------------------------------------------------------------------------

type RawFootnote = { marker: string | null, number: number | null, body: string, page_index: number };

const MARKER_SYMBOLS = '*†‡•';

// Peel a leading footnote marker off one line of footnote HTML.
const read_marker = (line: string): { marker: string, rest: string } | null => {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^\s*<sup>\s*\(?(\d{1,3}[a-z]?)\)?\s*<\/sup>\s*/)))
    return { marker: m[1], rest: line.slice(m[0].length) };
  if ((m = line.match(/^\s*<sup>\s*([*†‡•])\s*<\/sup>\s*/)))
    return { marker: m[1], rest: line.slice(m[0].length) };
  if ((m = line.match(/^\s*([*†‡•])\)?\s*/)))
    return { marker: m[1], rest: line.slice(m[0].length) };
  // bare number the OCR failed to superscript: "17 Cfr. Ps. XVIII, 1."
  if ((m = line.match(/^\s*(\d{1,3})\s+(?=[A-Z“"'‘(<\[])/)))
    return { marker: m[1], rest: line.slice(m[0].length) };
  return null;
};

const parse_footnote_blocks = (page: SuryaPage, page_index: number): RawFootnote[] => {
  const out: RawFootnote[] = [];
  const blocks = page.blocks
    .filter(b => b.label === 'Footnote')
    .sort((a, b) => a.reading_order - b.reading_order);

  for (const block of blocks) {
    const lines = block.html
      .split(/<\/p>\s*<p>|<br\s*\/?>|<\/?p>|<\/?div>/i)
      .map(l => l.trim())
      .filter(Boolean);
    let first_in_block = true;
    for (const line of lines) {
      const mk = read_marker(line);
      if (mk) {
        out.push({
          marker: mk.marker,
          number: /^\d+/.test(mk.marker) ? parseInt(mk.marker) : null,
          body: mk.rest,
          page_index,
        });
      }
      else if (out.length && out[out.length - 1].page_index === page_index) {
        out[out.length - 1].body += ' ' + line;
      }
      else {
        // no marker and nothing earlier on this page: continuation from a previous page
        out.push({ marker: null, number: null, body: line, page_index });
      }
      first_in_block = false;
    }
  }

  // Two footnotes run together on one line: "<sup>3</sup> WELTON ... <sup>4</sup> <i>ibid.</i>"
  const split: RawFootnote[] = [];
  for (const fn of out) {
    let cur = fn;
    for (;;) {
      if (cur.number === null) break;
      const next = cur.number + 1;
      const m = cur.body.match(new RegExp(`\\s<sup>\\s*${next}\\s*</sup>\\s+`));
      if (!m || m.index === undefined) break;
      const rest = cur.body.slice(m.index + m[0].length);
      cur.body = cur.body.slice(0, m.index);
      split.push(cur);
      cur = { marker: String(next), number: next, body: rest, page_index };
    }
    split.push(cur);
  }
  return split;
};

// ---------------------------------------------------------------------------
// Locating the footnote reference in the running text
// ---------------------------------------------------------------------------

const BODY_LABELS = new Set(['Text', 'ListGroup', 'SectionHeader', 'Table', 'Caption']);

const find_reference = (
  pages: SuryaPage[],
  page_index: number,
  marker: string | null,
  occurrence = 0,        // n-th footnote on the page using this same marker (matters for "*" and "†")
): { page_index: number, method: string, context: string } | null => {
  if (!marker) return null;
  const order = [page_index, page_index - 1, page_index + 1].filter(i => i >= 0 && i < pages.length);
  const symbol = MARKER_SYMBOLS.includes(marker);

  for (const i of order) {
    const blocks = pages[i].blocks
      .filter(b => BODY_LABELS.has(b.label))
      .sort((a, b) => a.reading_order - b.reading_order);
    let seen = 0;
    for (const block of blocks) {
      let context: string | null = null;
      if (symbol) {
        const plain = strip_tags(block.html);
        const chars = marker === '•' ? ['*', '•'] : [marker];
        for (let k = 1; k < plain.length; k++) {
          if (!chars.includes(plain[k])) continue;
          if (seen++ < (i === page_index ? occurrence : 0)) continue;
          context = squash(plain.slice(0, k)).slice(-140);
          break;
        }
      }
      else {
        const re = new RegExp(`<sup>\\s*\\(?\\s*${marker}\\s*\\)?\\s*</sup>`);
        const m = re.exec(block.html);
        if (m) context = squash(strip_tags(block.html.slice(0, m.index))).slice(-140);
      }
      if (context !== null) {
        return {
          page_index: i,
          method: (symbol ? 'symbol' : 'sup') + (i === page_index ? '' : i < page_index ? '_prev_page' : '_next_page'),
          context,
        };
      }
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// Citation extraction
// ---------------------------------------------------------------------------

const ROMAN = '[IVXLCivxlc]{1,7}';
const NUM = `(?:${ROMAN}|\\d{1,4})`;

const BIBLE_FULL = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Josue', 'Joshua', 'Judges', 'Ruth', 'Kings',
  'Paralipomenon', 'Chronicles', 'Esdras', 'Nehemias', 'Nehemiah', 'Tobias', 'Tobit', 'Judith', 'Esther',
  'Job', 'Psalms?', 'Proverbs', 'Ecclesiastes', 'Canticles', 'Wisdom', 'Ecclesiasticus', 'Isaias', 'Isaiah',
  'Jeremias', 'Jeremiah', 'Lamentations', 'Baruch', 'Ezechiel', 'Ezekiel', 'Daniel', 'Osee', 'Hosea', 'Joel',
  'Amos', 'Abdias', 'Obadiah', 'Jonas', 'Jonah', 'Micheas', 'Micah', 'Nahum', 'Habacuc', 'Habakkuk',
  'Sophonias', 'Zephaniah', 'Aggeus', 'Haggai', 'Zacharias', 'Zechariah', 'Malachias', 'Malachi', 'Machabees',
  'Maccabees', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', 'Corinthians', 'Galatians', 'Ephesians',
  'Philippians', 'Colossians', 'Thessalonians', 'Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', 'Peter',
  'Jude', 'Apocalypse', 'Revelation',
];
// abbreviations need their period so that "Is", "Am", "Ex" etc. do not fire on ordinary words
const BIBLE_ABBR = [
  'Gen', 'Ex', 'Exod', 'Lev', 'Num', 'Deut', 'Jos', 'Josh', 'Judg', 'Kgs', 'Par', 'Chron', 'Esd', 'Neh',
  'Tob', 'Job', 'Ez', 'Ps', 'Prov', 'Eccl', 'Eccles', 'Cant', 'Wis', 'Ecclus', 'Sir', 'Is', 'Isa', 'Jer', 'Lam',
  'Bar', 'Ezech', 'Ezek', 'Dan', 'Os', 'Hos', 'Am', 'Abd', 'Jon', 'Mich', 'Mic', 'Hab', 'Soph', 'Zeph',
  'Agg', 'Zach', 'Zech', 'Mal', 'Mach', 'Macc', 'Matth', 'Matt', 'Mt', 'Mk', 'Lk', 'Jn', 'Rom', 'Cor', 'Gal',
  'Eph', 'Phil', 'Philip', 'Col', 'Thess', 'Tim', 'Tit', 'Philem', 'Heb', 'Jas', 'Pet', 'Apoc', 'Rev',
];
const BIBLE_CANON: Record<string, string> = {
  ps: 'Psalms', psalm: 'Psalms', psalms: 'Psalms', matth: 'Matthew', matt: 'Matthew', mt: 'Matthew',
  mk: 'Mark', lk: 'Luke', jn: 'John', apoc: 'Revelation', apocalypse: 'Revelation', rev: 'Revelation',
  rom: 'Romans', cor: 'Corinthians', gal: 'Galatians', eph: 'Ephesians', phil: 'Philippians',
  philip: 'Philippians', col: 'Colossians', thess: 'Thessalonians', tim: 'Timothy', tit: 'Titus',
  heb: 'Hebrews', jas: 'James', pet: 'Peter', gen: 'Genesis', ex: 'Exodus', exod: 'Exodus',
  lev: 'Leviticus', num: 'Numbers', deut: 'Deuteronomy', is: 'Isaiah', isa: 'Isaiah', isaias: 'Isaiah',
  jer: 'Jeremiah', dan: 'Daniel', wis: 'Wisdom', eccl: 'Ecclesiastes', eccles: 'Ecclesiastes',
  ecclus: 'Ecclesiasticus', sir: 'Ecclesiasticus', prov: 'Proverbs', kgs: 'Kings', par: 'Chronicles',
  chron: 'Chronicles', am: 'Amos', os: 'Hosea', hos: 'Hosea', mal: 'Malachi', zach: 'Zechariah',
  zech: 'Zechariah', ezech: 'Ezekiel', ezek: 'Ezekiel', ez: 'Ezekiel', mach: 'Maccabees', macc: 'Maccabees',
};
// Chapter and verse are both required: without a verse, names like "James I" or "Peter Lombard" fire.
const BIBLE_RE = new RegExp(
  '(?<![\\p{L}])((?:[123]|I{1,3})\\s+)?'
  + `(?:(${BIBLE_FULL.join('|')})\\s+|(${BIBLE_ABBR.join('|')})\\.\\s*)`
  + `(${NUM})(?![\\p{L}])\\s*[,.:]\\s*(\\d+[a-z]?(?:\\s*[-–—]\\s*\\d+)?(?:\\s*[,.]\\s*\\d+(?:\\s*[-–—]\\s*\\d+)?)*)`,
  'gu',
);

// Works often cited in abbreviated form. `pattern` is matched against the segment text.
// `weak` entries are abbreviations that other authors also use; they only apply when no author is named.
const KNOWN_WORKS: { pattern: RegExp, author: string, title: string, weak?: boolean }[] = [
  { pattern: /\b(?:Summa\s+contra\s+Gent(?:iles)?|Contr[ao]?\.?\s+Gent(?:iles)?|C\.\s?G\.)/i, author: 'Thomas Aquinas', title: 'Summa Contra Gentiles' },
  { pattern: /\bS\.\s?Th(?:eol)?\b\.?|\b[Ss]umm?a?\.?\s*[Tt]heol(?:ogica|ogiae|\.)?/, author: 'Thomas Aquinas', title: 'Summa Theologica' },
  { pattern: /^Confess(?:ions?|iones)?\.?$/i, author: 'Augustine', title: 'Confessions' },
  { pattern: /^De\s+Civ(?:itate|\.)?\s+Dei\.?$/i, author: 'Augustine', title: 'City of God' },
  { pattern: /^(?:Metaph(?:ysics)?|Met)\.?$/i, author: 'Aristotle', title: 'Metaphysics', weak: true },
  { pattern: /^(?:Nic(?:om)?\.?\s*Eth(?:ics)?|Eth(?:ic)?\.?\s*Nic(?:om)?)\.?$/i, author: 'Aristotle', title: 'Nicomachean Ethics', weak: true },
  { pattern: /^(?:De\s+Anima|De\s+An\.?)$/i, author: 'Aristotle', title: 'De Anima', weak: true },
  { pattern: /^Phys(?:ics|\.)?$/i, author: 'Aristotle', title: 'Physics', weak: true },
  { pattern: /^(?:Polit(?:ics|\.)?)$/i, author: 'Aristotle', title: 'Politics', weak: true },
  { pattern: /^Anal(?:ytica|\.)?\s*(?:Post|Prior|Pr)\.?$/i, author: 'Aristotle', title: 'Analytics', weak: true },
  { pattern: /\bDe\s+Ver(?:it(?:ate)?)?\b\.?/i, author: 'Thomas Aquinas', title: 'De Veritate' },
  { pattern: /^Sum(?:m|ma)?\.?(?:\s*Th(?:eol)?\.?)?$/i, author: 'Thomas Aquinas', title: 'Summa Theologica', weak: true },
  { pattern: /\bDe\s+Pot(?:entia)?\b\.?/i, author: 'Thomas Aquinas', title: 'De Potentia' },
  { pattern: /\bDe\s+Malo\b/i, author: 'Thomas Aquinas', title: 'De Malo' },
  { pattern: /\bQuodlib(?:et)?\.?/i, author: 'Thomas Aquinas', title: 'Quodlibetal Questions' },
  { pattern: /\bDenzinger(?:-Bannwart)?(?:['’]s)?|\bEnchir(?:idion|\.)/i, author: 'Denzinger-Bannwart', title: 'Enchiridion Symbolorum' },
  { pattern: /\bMigne,?\s*P\.\s?G\.|\bP\.\s?G\.,/i, author: 'Migne', title: 'Patrologia Graeca' },
  { pattern: /\bMigne,?\s*P\.\s?L\.|\bP\.\s?L\.,/i, author: 'Migne', title: 'Patrologia Latina' },
];

const STOP_NAME_TOKENS = new Set([
  'cf', 'cfr', 'see', 'also', 'compare', 'the', 'in', 'and', 'for', 'v', 'vide', 'e', 'g', 'i', 'e.g', 'i.e',
  'on', 'of', 'by', 'to', 'with', 'from', 'as', 'or', 'but', 'against', 'thus', 'this', 'that', 'his', 'her',
  'its', 'their', 'especially', 'esp', 'ch', 'chap', 'art', 'vol', 'ibid', 'note', 'notes', 'thus', 'quoted',
  'according', 'ed', 'eds', 'trans', 'transl', 'a', 'an', 'at', 'is', 'it', 'if', 'so', 'no', 'not', 'we',
  'op', 'loc', 'l', 'o', 'id', 'idem', 'sess', 'session', 'can', 'canon', 'cap', 'caput', 'tit', 'sect', 'sec',
  'lib', 'lect', 'disp', 'tr', 'tract', 'q', 'qu', 'qq', 'n', 'nn', 'p', 'pp', 'part', 'tom', 't', 'commentary',
  'comment', 'quoted', 'supra', 'infra',
  // capitalised sentence-openers that are not surnames
  'does', 'do', 'did', 'these', 'those', 'then', 'there', 'here', 'what', 'which', 'when', 'where', 'who', 'why',
  'how', 'he', 'she', 'they', 'you', 'my', 'our', 'some', 'many', 'most', 'all', 'any', 'each', 'every', 'into',
  'without', 'hence', 'however', 'moreover', 'first', 'second', 'third', 'one', 'two', 'three', 'now', 'again',
  'here', 'such', 'both', 'other', 'another', 'whether', 'since', 'because', 'while', 'for', 'yet', 'can', 'may',
]);
const NAME_PARTICLES = new Set(['de', 'di', 'du', 'del', 'della', 'des', 'von', 'van', 'der', 'den', 'le', 'la', 'da', 'y', 'ter', 'of']);
const TITLE_ABBR = /^(?:St|Sts|Dr|Prof|Fr|Rev|Card|Cardinal|Bl|Mgr|Mr|Bp|Bishop|Pope|Canon|S|Abbé|Père)$/i;
const ORDER_SUFFIX = /,?\s*(?:S\.\s?J|O\.\s?P|O\.\s?S\.\s?B|O\.\s?F\.\s?M|C\.\s?SS\.\s?R|S\.\s?T\.\s?D|D\.\s?D|Ph\.\s?D)\.?\s*[,:]?\s*$/;

const INITIALS = /^\p{Lu}\.(?:\p{Lu}\.)?$/u;

const is_name_token = (core: string): boolean => {
  core = core.replace(/^[—–"“(‘]+/, '');
  if (/^[IVXLC]{2,}\.?$/.test(core)) return false;                 // XIV in "Sess. XIV"
  if (INITIALS.test(core)) return true;
  if (STOP_NAME_TOKENS.has(core.toLowerCase().replace(/\.$/, ''))) return false;
  if (TITLE_ABBR.test(core.replace(/\.$/, ''))) return true;
  return /^[\p{Lu}][\p{L}’'\-]+\.?$/u.test(core);
};

const prettify_caps = (name: string) => name.replace(/\b(\p{Lu})(\p{Lu}{2,})\b/gu, (_, a, b) => a + b.toLowerCase());

const AUTHOR_ALIASES: [RegExp, string][] = [
  [/^Conc(?:il|ilium)?\.?\s+Trid(?:ent(?:ine|ini)?)?\.?$/i, 'Council of Trent'],
  [/^Conc(?:il|ilium)?\.?\s+Vat(?:ic(?:an)?)?\.?$/i, 'Vatican Council'],
  [/^(?:St\.?\s+)?Thom(?:as|\.)?$/i, 'Thomas Aquinas'],
  [/^(?:St\.?|S\.?)\s+Thom(?:as|\.)(?:\s+Aquinas)?$|^Aquinas$|^Thomas Aquinas$|^Aquinas, Thomas$/i, 'Thomas Aquinas'],
  [/^(?:St\.?|S\.?)\s+Augustine$/i, 'Augustine'],
];
const HONORIFICS = /^(?:(?:St|Sts|Dr|Prof|Fr|Rev|Card|Cardinal|Bl|Mgr|Mr|Bp|Bishop|Pope|Canon|S|Abbé|Père)\.?\s+)+/i;

const normalize_name = (tokens: string[]): string | null => {
  let name = prettify_caps(tokens.join(' ')).replace(/[,:;]+/g, '');
  for (const [re, canon] of AUTHOR_ALIASES) if (re.test(name)) return canon;
  const stripped = name.replace(HONORIFICS, '');
  name = stripped.length ? stripped : name;
  const real = name.split(/\s+/).filter(t => !INITIALS.test(t) && !TITLE_ABBR.test(t.replace(/\.$/, '')));
  return real.length ? name : null;   // initials alone are not an author
};

// Words that may legitimately sit right before an author's name in a citation.
const BEFORE_NAME = new Set([
  'cf', 'cfr', 'see', 'also', 'compare', 'and', 'by', 'in', 'against', 'with', 'from', 'of', 'per', 'vide', 'v', 'e.g',
  'especially', 'esp', 'as', 'so', 'thus', 'or', 'to', 'wrote', 'writes',
]);

// Walk backwards from the end of `pre` collecting a personal name ("Fr. Garrigou-Lagrange").
const trailing_name = (pre: string): string | null => {
  let t = pre.replace(/<\/?i>/g, '').trim();
  t = t.replace(/\s*\([^)]*\)\s*$/, '').replace(/[\s,:;–—-]+$/, '');
  t = t.replace(ORDER_SUFFIX, '').replace(/[’']s$/, '').replace(/[’']$/, '').replace(/[\s,:;]+$/, '');
  const tokens = t.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = tokens.length - 1;
  for (; i >= 0 && out.length < 6; i--) {
    const tok = tokens[i];
    const core = tok.replace(/[,:;]+$/, '').replace(/^[—–"“(‘]+/, '');
    if (/,$/.test(tok) && i !== tokens.length - 1) {
      // "Weill, G." — surname followed by initials
      if (out.length && out.every(x => INITIALS.test(x)) && is_name_token(core)) {
        out.unshift(...[core].map(x => x));
        const initials = out.slice(1).join(' ');
        return normalize_name([initials, out[0]]);
      }
      break;
    }
    if (is_name_token(core)) out.unshift(core);
    else if (NAME_PARTICLES.has(core.toLowerCase()) && out.length) out.unshift(core);
    else break;
  }
  while (out.length && NAME_PARTICLES.has(out[0].toLowerCase())) out.shift();
  if (!out.length) return null;
  // The name must open the clause or follow a citing word ("see Kluge", "Cf. Ward"), otherwise
  // it is just a capitalised word in a sentence ("the Church <i>has erred</i>").
  if (i >= 0) {
    const before = tokens[i];
    const ok = /[.,;:—–)]$/.test(before) || BEFORE_NAME.has(before.toLowerCase().replace(/[.,]+$/, ''));
    if (!ok) return null;
  }
  return normalize_name(out);
};

// First name in a clause: "Plotinus, Fuller's translation, op. cit., p. 391" -> Plotinus
const leading_name = (clause: string): string | null => {
  const tokens = clause.replace(/<\/?i>/g, '').replace(LEAD_STRIP, '').trim().split(/\s+/);
  const out: string[] = [];
  for (const tok of tokens) {
    const core = tok.replace(/[,:;]+$/, '');
    if (is_name_token(core) || (NAME_PARTICLES.has(core.toLowerCase()) && out.length)) out.push(core);
    else break;
    if (/[,:;]$/.test(tok)) break;
  }
  return out.length ? normalize_name(out) : null;
};

const LOCATION_PART_RES: [string, RegExp][] = [
  ['volume', new RegExp(`\\b(?:Vol\\.?|Tom\\.?|V\\.|T\\.)\\s*(${NUM})\\b`, 'i')],
  ['page', /\b(?:pp?|pages?)\.?\s*(\d+[a-z]?(?:\s*[-–—]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*(?:\s*(?:sqq?|seqq?|ff|f)\b\.?)?)/i],
  ['number', /\bnn?o?s?\.\s*(\d+[a-z]?(?:\s*(?:[-–—,]|and|&)\s*\d+)*)/i],
  ['section', /(?:§+|\bsects?\.|\bsec\.)\s*(\d+)/i],
  ['book', new RegExp(`\\b(?:Lib(?:ri)?\\.?|Book|Bk\\.?|Liv(?:re)?\\.?)\\s*(${NUM})\\b`, 'i')],
  ['part', new RegExp(`\\b(?:Part|Pars|Pt\\.?)\\s*(${NUM}|\\d+a)\\b`, 'i')],
  ['chapter', new RegExp(`\\b(?:Ch(?:ap(?:ter)?)?\\.?|Cap(?:ut)?\\.?|c\\.)\\s*(${NUM})\\b`, 'i')],
  ['question', new RegExp(`\\b(?:q(?:u|uest)?\\.|qq\\.)\\s*(${NUM})`, 'i')],
  ['article', new RegExp(`\\b(?:art(?:icle)?\\.?|a\\.|aa\\.)\\s*(${NUM})`, 'i')],
  ['disputation', new RegExp(`\\b(?:Disp(?:utatio)?\\.?)\\s*(${NUM})\\b`, 'i')],
  ['lecture', new RegExp(`\\b(?:Lect(?:io)?\\.?|Lec\\.)\\s*(${NUM})\\b`, 'i')],
  ['thesis', /\b(?:thes(?:is)?\.?)\s*(\d+)/i],
  ['column', /\b(?:cols?\.)\s*(\d+(?:\s*[-–—]\s*\d+)?)/i],
  ['tract', new RegExp(`\\b(?:tr(?:act)?\\.)\\s*(${NUM})`, 'i')],
  ['dubium', /\b(?:dub(?:ium)?\.|diss(?:ert)?\.)\s*(\d+)/i],
  ['canon', /\b(?:can(?:on)?\.|sess(?:ion)?\.|prop(?:osition)?\.)\s*(\d+)/i],
];

const parse_location_parts = (loc: string): Record<string, string> => {
  const parts: Record<string, string> = {};
  for (const [name, re] of LOCATION_PART_RES) {
    const m = loc.match(re);
    if (m) parts[name] = squash(m[1]);
  }
  return parts;
};

// A location is a run of locator tokens (p. 12, Vol. II, qu. 3, art. 4, ii, 543 ...) joined by
// punctuation.  Everything after the run — publisher, place, year, following prose — is dropped.
const LOC_TOKEN_RES: RegExp[] = [
  ...LOCATION_PART_RES.map(([, re]) => new RegExp(re.source, 'iy')),
  /Migne,?\s*P\.\s?[GL]\.?,?/iy,
  /(?:\d|[Ii]{1,3})[ae]{1,2}\b\.?/y,                                                   // scholastic "1a", "IIae"
  /\d+[a-z]?(?:\s*[-–—]\s*\d+[a-z]?)*(?![\p{L}\d])/uy,                                  // 543, 981b, 4-5
  /[IVXLC]{1,6}(?![\p{L}\d])/uy,                                                         // ii. / IV
  /(?=[ivxlc]+(?![\p{L}]))c{0,3}(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})(?![\p{L}])/uy,
];
const LOC_GAP = /(?:[\s,;:()–—-]|\.(?!\s+\p{Lu}\p{Ll}))*(?:(?:and|&|sqq?|seqq?|ff?|foll|seq|et seq|note|in corp|ad)(?![\p{L}])\.?(?:[\s,;:()–—-]|\.(?!\s+\p{Lu}\p{Ll}))*)*/uy;

const token_at = (t: string, p: number): number => {
  for (const re of LOC_TOKEN_RES) {
    re.lastIndex = p;
    const m = re.exec(t);
    if (m && m[0].length) return m[0].length;
  }
  return 0;
};

const chain_location = (post: string): { text: string, offset: number } | null => {
  const t = post.replace(/<\/?i>/g, '');
  const lead = t.match(/^[\s,.:;)”"’'(–—-]*/)![0].length;
  let start = lead;
  let len = token_at(t, start);
  if (!len) {
    // allow a short word before the locator ("Leçon vii", "Bk. of Sent. ii")
    for (let q = lead + 1; q <= Math.min(t.length - 1, lead + 20) && !len; q++) {
      if (/\p{L}/u.test(t[q - 1]) || !/\S/.test(t[q])) continue;
      len = token_at(t, q);
      if (len) start = q;
    }
    if (!len) return null;
  }
  let end = start + len;
  for (;;) {
    LOC_GAP.lastIndex = end;
    const gap = LOC_GAP.exec(t)![0];
    const next = end + gap.length;
    const nlen = token_at(t, next);
    // a lone capital "I" after a sentence break is the pronoun, not a Roman numeral
    if (!nlen || (t.slice(next, next + nlen) === 'I' && gap.includes('.'))) break;
    end = next + nlen;
  }
  let text = t.slice(start, end).replace(/^[\s,.:;(–—-]+|[\s,;:(–—-]+$/g, '').replace(/\.$/, '');
  // a leading year is the publication date ("(1900-1901)", "1929, 23"), not a location
  const year = text.match(/^(?:1[4-9]\d\d|20\d\d)(?:\s*[-–—]\s*\d{2,4})?\b[\s,;:.]*/);
  if (year) text = text.slice(year[0].length).replace(/^[\s,;:.]+/, '');
  return text || year ? { text, offset: start - lead } : null;
};

const clean_location = (post: string): string | null => chain_location(post)?.text || null;

const NOISE_TITLE = /^(?:ibid|ib|id|idem|cf|cfr|e\.?\s?g|i\.?\s?e|sqq?|seqq?|op|loc|l\.\s?c|supra|infra|ed|vol|art|n|nn|no|p|pp|v|vide|passim|ff|f)\b\.?/i;
const isLatinScript = (s: string) => !/[^\u0000-ɏḀ-ỿ\s]/.test(s.replace(/[“”‘’—–]/g, ''));

type Candidate = { text: string, start: number, end: number, quoted: boolean };

const find_title_candidates = (seg: string): Candidate[] => {
  const out: Candidate[] = [];
  const re = /<i>(.+?)<\/i>|["“]([^"”“]{3,160}?)["”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg))) {
    const text = squash(strip_tags(m[1] ?? m[2])).replace(/[,.:;]+$/, '');
    out.push({ text, start: m.index, end: m.index + m[0].length, quoted: m[2] !== undefined });
  }
  return out;
};

const valid_title = (text: string): boolean => {
  if (text.length < 3 || text.length > 140) return false;
  if (text.split(/\s+/).length > 14) return false;
  if (!isLatinScript(text)) return false;
  if (NOISE_TITLE.test(text)) return false;
  if (!/\p{L}{3}/u.test(text)) return false;
  return true;
};

const LEAD_STRIP = /^\s*(?:(?:cf|cfr|see|also|compare|vide|v|e\.\s?g|and|especially|esp|but|thus|so|in|against|for)\b\.?[\s,:.]*)+/i;

const IBID_RE = /(?<![\p{L}])(?:ibid(?:em)?|ib|idem|loc\.?\s?cit|l\.\s?c|op\.?\s?cit|art\.?\s?cit|o\.\s?c)\b\.?/iu;

type History = { author: string | null, title: string | null, footnote_number: string | null, page: number | null };

const surname = (author: string | null) => author ? author.split(/\s+/).pop()!.toLowerCase().replace(/[^\p{L}]/gu, '') : null;

const finish = (c: Omit<Citation, 'confidence' | 'citationLocations'>): Citation => ({
  ...c,
  citationLocations: [],
  confidence: (c.author && c.title && c.location) ? 'high' : 'medium',
});

const split_segments = (s: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ';' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  // sentence break right after a locator: "p. 245. Cfr. X"
  return out.flatMap(seg => seg.split(/(?<=\d[a-z]?\.|sqq?\.|ff?\.)\s+(?=(?:Cf|Cfr|See|Also|Compare|V\.)\b)/));
};

const extract_citations = (body: string, history: History[], ctx: { footnote_number: string | null, page: number | null }): Citation[] => {
  const citations: Citation[] = [];
  const remember = (c: Citation) => history.push({ author: c.author, title: c.title, ...ctx });

  for (const raw_seg of split_segments(body)) {
    const seg = squash(raw_seg).replace(LEAD_STRIP, '');
    if (!seg) continue;
    const plain = strip_tags(seg);
    const found_here: Citation[] = [];

    // --- Ibid. / op. cit. / loc. cit. / idem -----------------------------------------------
    let ib = IBID_RE.exec(plain);
    let default_author: string | null = null;
    let work_seg = seg;
    if (ib && /^idem/i.test(ib[0])) {
      // "IDEM, De Virginit., cap. 11" — same author as the previous citation, new work
      default_author = [...history].reverse().find(h => h.author)?.author ?? null;
      work_seg = seg.replace(/<i>\s*idem\.?\s*<\/i>|\bidem\b\.?,?/i, '');
      ib = null;
    }
    else if (ib && find_title_candidates(seg).some(c => valid_title(c.text))) {
      ib = null;   // a real title follows the "Ibid.", treat the segment as an ordinary citation
    }
    if (ib) {
      const pre = plain.slice(0, ib.index);
      const post = plain.slice(ib.index + ib[0].length);
      const is_opcit = /^(?:op|loc|art|o\.|l\.\s?c)/i.test(ib[0]);
      const author = trailing_name(pre) ?? (is_opcit && pre.trim() ? leading_name(pre) : null);
      let prior: History | undefined;
      if (author) {
        prior = [...history].reverse().find(h => surname(h.author) === surname(author) && h.title)
          ?? [...history].reverse().find(h => surname(h.author) === surname(author));
      }
      else {
        prior = [...history].reverse().find(h => h.title || h.author);
      }
      if (prior || author) {
        const location = clean_location(post);
        found_here.push(finish({
          author: author ?? prior?.author ?? null,
          title: prior?.title ?? null,
          location,
          parts: location ? parse_location_parts(location) : {},
          kind: is_opcit ? 'op_cit' : 'ibid',
          resolved_from: prior ? { footnote_number: prior.footnote_number, page: prior.page } : undefined,
          raw: squash(plain),
        }));
      }
    }

    // --- Scripture -------------------------------------------------------------------------
    const previous = citations[citations.length - 1];
    const bare_ref = plain.match(new RegExp(`^\\s*(${NUM})\\s*[,.:]\\s*(\\d+[a-z]?(?:\\s*[-–—]\\s*\\d+)?(?:\\s*[,.]\\s*\\d+)*)`));
    if (!ib && bare_ref && previous?.kind === 'bible' && seg.length < 40) {
      found_here.push(finish({
        author: 'Bible', title: previous.title, location: `${bare_ref[1]}, ${bare_ref[2]}`,
        parts: { chapter: bare_ref[1], verse: bare_ref[2] }, kind: 'bible', raw: squash(plain),
      }));
    }
    if (!ib && !found_here.length) {
      for (const m of plain.matchAll(BIBLE_RE)) {
        const prefix = (m[1] ?? '').trim();
        const name = m[2] ?? m[3];
        const canon = BIBLE_CANON[name.toLowerCase()] ?? (name[0].toUpperCase() + name.slice(1).toLowerCase());
        const number_prefix = prefix ? ({ I: 1, II: 2, III: 3 } as Record<string, number>)[prefix] ?? prefix : '';
        const title = `${number_prefix ? number_prefix + ' ' : ''}${canon}`.replace(/Psalms?$/, 'Psalms');
        const location = `${m[4]}, ${m[5]}`;
        found_here.push(finish({
          author: 'Bible',
          title,
          location,
          parts: { chapter: m[4], verse: m[5] },
          kind: 'bible',
          raw: squash(m[0]),
        }));
      }
    }

    // --- Titled works (italics / quotation marks) -----------------------------------------------------
    if (!ib) {
      const cands = find_title_candidates(work_seg).filter(c => valid_title(c.text));
      let prev_end = 0;
      for (let ci = 0; ci < cands.length; ci++) {
        const c = cands[ci];
        const next_start = cands[ci + 1]?.start ?? work_seg.length;
        const pre = work_seg.slice(prev_end, c.start);
        let post = work_seg.slice(c.end, next_start);
        // `"Title," in <i>Journal</i>, pp. 3-4` — location follows the container
        const container = post.match(/^[,.\s]*in\s+$/i) && cands[ci + 1];
        if (container) post = work_seg.slice(cands[ci + 1].end);
        prev_end = container ? cands[ci + 1].end : c.end;
        if (container) ci++;

        const author = trailing_name(pre.replace(LEAD_STRIP, '').replace(/\bin\s*$/i, ''))
          ?? (pre.replace(LEAD_STRIP, '').replace(/[\s,.:]+/g, '') === '' ? default_author : null);
        const loc = chain_location(strip_tags(post));
        const location = loc?.text || null;
        const known = KNOWN_WORKS.find(k => k.pattern.test(k.pattern.source.startsWith('^') ? c.text : pre.slice(-14) + c.text)
          && !(k.weak && author && author !== k.author));
        const starts_lower = /^\p{Ll}/u.test(c.text);

        // Without an author or a known work, only a title with a locator right behind it counts;
        // that keeps emphasis (<i>never</i>) and inline quotations out.
        if (!author && !known && !(loc && loc.offset <= 2)) continue;
        // A lone lowercase italic word after a capitalised word is emphasis, not a title.
        if (!known && !location && starts_lower && c.text.split(/\s+/).length < 2) continue;
        if (!author && !known && (starts_lower || c.text.split(/\s+/).length > 7)) continue;
        if (c.quoted && !known && starts_lower && !author) continue;
        if (!author && !location && !known) continue;

        found_here.push(finish({
          author: known?.author ?? author,
          title: known?.title ?? c.text,
          location,
          parts: location ? parse_location_parts(location) : {},
          kind: known ? 'known' : 'titled',
          raw: squash(strip_tags(work_seg)).slice(0, 300),
        }));
      }

      // Abbreviated standard works cited without italics: "Summa Theol., 1a, qu. 13, art. 9"
      if (!found_here.length) {
        for (const k of KNOWN_WORKS) {
          const m = k.pattern.exec(plain);
          if (!m) continue;
          const location = clean_location(plain.slice(m.index + m[0].length));
          if (!location) continue;
          found_here.push(finish({
            author: k.author,
            title: k.title,
            location,
            parts: parse_location_parts(location),
            kind: 'known',
            raw: squash(plain).slice(0, 300),
          }));
          break;
        }
      }
    }

    for (const c of found_here) { citations.push(c); remember(c); }
  }
  return citations;
};

// ---------------------------------------------------------------------------
// Book processing
// ---------------------------------------------------------------------------

const list_pdfs = (): string[] => fs.existsSync(PDF_DIR) ? fs.readdirSync(PDF_DIR).filter(f => f.endsWith('.pdf')) : [];

// Folder names are PDF stems, truncated at the first "." for the numbered "2015.*" files.
const PDF_OVERRIDES: Record<string, string> = { '2015': '2015.932.Types-Of-Philosophy-1929.pdf' }; // 549 pages, "Types of Philosophy" (Hocking)
const pdf_for_book = (book: string, pdfs: string[]): string | null => {
  if (PDF_OVERRIDES[book]) return PDF_OVERRIDES[book];
  return pdfs.find(p => p === book + '.pdf') ?? null;
};

const process_book = (book: string, pdfs: string[]) => {
  const file = path.join(SURYA_DIR, book, 'results.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const pages: SuryaPage[] = data[Object.keys(data)[0]];
  const printed = printed_pages(pages);
  const book_filename = pdf_for_book(book, pdfs);

  const footnotes: Footnote[] = [];
  const history: History[] = [];
  let unlocated = 0;

  // 1. gather footnotes page by page, folding page-spanning continuations into their parent
  const raws: (RawFootnote & { parent?: number })[] = [];
  pages.forEach((page, i) => {
    for (const fn of parse_footnote_blocks(page, i)) {
      const prev = raws[raws.length - 1];
      if (fn.marker === null && prev) {
        prev.body += ' ' + fn.body;
        (prev as any).end_index = i;
        continue;
      }
      raws.push(fn);
    }
  });

  // 2. build records
  const occurrences = new Map<string, number>();
  for (const raw of raws) {
    const i = raw.page_index;
    const html = raw.body;
    const occ_key = `${i}:${raw.marker}`;
    const occurrence = occurrences.get(occ_key) ?? 0;
    occurrences.set(occ_key, occurrence + 1);
    const ref = find_reference(pages, i, raw.marker, occurrence);
    if (!ref) unlocated++;
    const end_index: number | undefined = (raw as any).end_index;
    const record: Footnote = {
      book,
      book_filename,
      footnote_number: raw.number,
      marker: raw.marker,
      footnote_page: printed[i],
      footnote_scan_page: pages[i].page,
      ...(end_index !== undefined && end_index !== i ? { footnote_end_scan_page: pages[end_index].page } : {}),
      reference_page: ref ? printed[ref.page_index] : null,
      reference_scan_page: ref ? pages[ref.page_index].page : null,
      reference_method: ref?.method ?? 'not_found',
      reference_context: ref?.context ?? null,
      text: strip_tags(html.replace(/<br\s*\/?>/gi, ' ')).replace(/\s+/g, ' ').trim(),
      has_citation: false,
      citations: [],
    };
    const working = to_working(html);
    record.citations = extract_citations(working, history, { footnote_number: raw.marker, page: printed[i] });
    add_citation_locations(record.citations);
    record.has_citation = record.citations.length > 0;
    footnotes.push(record);
  }

  return { book, book_filename, pages: pages.length, footnotes, unlocated };
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const csv_cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const main = () => {
  const only = process.argv.slice(2);
  const pdfs = list_pdfs();
  const all = fs.readdirSync(SURYA_DIR).filter(f => f[0] !== '.').sort();
  const books = all.filter(b => only.length === 0 || only.includes(b));

  const results: ReturnType<typeof process_book>[] = [];
  const skipped: { book: string, reason: string }[] = [];
  for (const book of books) {
    if (!fs.existsSync(path.join(SURYA_DIR, book, 'results.json'))) {
      skipped.push({ book, reason: 'no results.json' });
      continue;
    }
    const r = process_book(book, pdfs);
    results.push(r);
    const cited = r.footnotes.filter(f => f.has_citation).length;
    console.log(`${book.padEnd(42)} pages=${String(r.pages).padStart(4)} footnotes=${String(r.footnotes.length).padStart(5)} with_citations=${String(cited).padStart(5)} ref_not_found=${r.unlocated}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const suffix = only.length ? '.partial' : '';
  fs.writeFileSync(
    `${OUT_DIR}/footnotes${suffix}.json`,
    JSON.stringify(results.map(r => ({
      book: r.book, book_filename: r.book_filename, pages: r.pages, footnotes: r.footnotes,
    })), null, 1),
  );

  const header = [
    'book', 'book_filename', 'footnote_number', 'footnote_page', 'footnote_scan_page', 'reference_page',
    'reference_scan_page', 'author', 'title', 'location', 'kind', 'confidence', 'resolved_from_footnote',
    'resolved_from_page', 'footnote_text',
  ];
  const rows = [header.join(',')];
  for (const r of results) for (const f of r.footnotes) for (const c of f.citations) {
    rows.push([
      f.book, f.book_filename, f.marker, f.footnote_page, f.footnote_scan_page, f.reference_page,
      f.reference_scan_page, c.author, c.title, c.location, c.kind, c.confidence,
      c.resolved_from?.footnote_number, c.resolved_from?.page, f.text,
    ].map(csv_cell).join(','));
  }
  fs.writeFileSync(`${OUT_DIR}/citations${suffix}.csv`, rows.join('\n') + '\n');

  const summary = {
    books_processed: results.length,
    books_skipped: skipped,
    totals: {
      footnotes: results.reduce((n, r) => n + r.footnotes.length, 0),
      footnotes_with_citations: results.reduce((n, r) => n + r.footnotes.filter(f => f.has_citation).length, 0),
      citations: results.reduce((n, r) => n + r.footnotes.reduce((m, f) => m + f.citations.length, 0), 0),
      references_not_located: results.reduce((n, r) => n + r.unlocated, 0),
    },
    per_book: results.map(r => ({
      book: r.book,
      book_filename: r.book_filename,
      pages: r.pages,
      footnotes: r.footnotes.length,
      footnotes_with_citations: r.footnotes.filter(f => f.has_citation).length,
      references_not_located: r.unlocated,
    })),
  };
  fs.writeFileSync(`${OUT_DIR}/summary${suffix}.json`, JSON.stringify(summary, null, 2));
  console.log('\n', summary.totals, skipped.length ? `skipped: ${JSON.stringify(skipped)}` : '');
};

main();
