// Build a Book (see types.ts) from one book's surya OCR results.json plus the footnotes/citations that
// extract_footnotes.ts found for it.
//
// Usage (from src/):
//   npx tsx extract_footnotes.ts <book>           # writes output/footnotes.partial.json
//   npx tsx build_book.ts --book <book> --title "<title>" --author "<author>" [--url <url>] \
//     [--results <results.json>] [--footnotes output/footnotes.partial.json] [--out output/<book>.book.json]
//
// Conventions:
//   - Page.pageNumber and Citation.source.footnotePage are the 1-based scan (PDF) page (`page` in
//     results.json): unique per book. Page.printedPageNumber is the number printed on the page ("123",
//     front matter "xii"), or '' when the page shows none.
//   - Blocks are kept in reading order. The five PageBlock labels pass through; other text-bearing surya
//     labels (ListGroup, TableOfContents, Table, Equation, Caption, ...) become "Text"; image-only blocks
//     (Picture, Figure, Diagram) and blocks with no text are dropped.
//   - Each footnote's citations are attached to the Footnote block the footnote starts in.
//   - locationsCited groups: a new group starts at "; / also / cf. / see", or when a locator type that is
//     already in the current group (and is not its last entry) comes round again; the new group inherits
//     the entries above that level ("I, q. 2, a. 3, q. 5" -> [I, q2, a3], [I, q5]).
import fs from 'node:fs';
import path from 'node:path';
import { citation_locations } from './citation_locations';
import type { Book, Citation, CitationLocation, Page, PageBlock } from './types';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args: Record<string, string> = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  args[a.slice(2)] = process.argv[i + 1];
  i++;
}
const bookId = args.book;
if (!bookId || !args.title || !args.author) {
  console.error('usage: tsx build_book.ts --book <id> --title <title> --author <author> [--url] [--results] [--footnotes] [--out]');
  process.exit(1);
}
const resultsPath = args.results ?? path.join('../scholshelf/results/surya', bookId, 'results.json');
const footnotesPath = args.footnotes ?? 'output/footnotes.partial.json';
const outPath = args.out ?? path.join('output', `${bookId}.book.json`);

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&nbsp;': ' ',
};
const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|nbsp|#x27|#39);/g, m => ENTITIES[m]);
const strip_tags = (html: string) => decode(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''));
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// ---------------------------------------------------------------------------
// Pages and blocks
// ---------------------------------------------------------------------------

type SuryaBlock = { label: string, html: string, reading_order: number, bbox: number[] };
type SuryaPage = { blocks: SuryaBlock[], page: number };

const LABELS = new Set<PageBlock['label']>(['SectionHeader', 'Text', 'PageHeader', 'PageFooter', 'Footnote']);
const IMAGE_LABELS = new Set(['Picture', 'Figure', 'Diagram']);
const stats = { blocks: 0, relabelled: {} as Record<string, number>, dropped: {} as Record<string, number> };

const to_block = (b: SuryaBlock): PageBlock | null => {
  const text = squash(strip_tags(b.html ?? ''));
  const drop = (why: string) => { stats.dropped[why] = (stats.dropped[why] ?? 0) + 1; return null; };
  if (IMAGE_LABELS.has(b.label)) return drop(b.label);
  if (!text) return drop(`empty ${b.label}`);
  let label = b.label as PageBlock['label'];
  if (!LABELS.has(label)) {
    stats.relabelled[b.label] = (stats.relabelled[b.label] ?? 0) + 1;
    label = 'Text';
  }
  const [x0, y0, x1, y1] = b.bbox;
  stats.blocks++;
  return { bbox: [x0, y0, x1, y1], label, html: b.html, citations: [] };
};

const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const suryaPages: SuryaPage[] = data[Object.keys(data)[0]];

// ---------------------------------------------------------------------------
// Printed page numbers
// ---------------------------------------------------------------------------
// printed = scan page + offset, where the offset is constant over long runs and changes only where the scan
// has unnumbered inserts (plates, blanks, part titles) or missing pages. The offset for every page is chosen
// with a Viterbi pass over the numbers read from page headers/footers:
//   - a header number equal to scan + offset scores +2; one OCR digit confusion away (3/8, 5/6, 1/7, 0/8/9)
//     scores +1, so a run of "884, 885, 887" misread for 384-387 still follows the true offset;
//   - a page whose header numbers all disagree scores -1; a page with no number scores 0;
//   - changing the offset by a little (<= 12) costs 4, a big jump costs 30;
//   - two-page spread scans (headers "8" and "9" on one scan) are numbered two per scan and stored as "8-9".
// Pages whose own header supports the chosen offset are anchors. Any other page gets scan + offset only when
// that number lies strictly between the nearest anchors on both sides (so unnumbered inserts get ''), and
// front matter falls back to a lone Roman numeral in its header ("xii"). Otherwise ''.

// brackets/dashes around a page number are dropped: "[ 43 ]", "— 12 —", "(7)" -> "43", "12", "7"
const header_texts = (page: SuryaPage) => page.blocks
  .filter(b => b.label === 'PageHeader' || b.label === 'PageFooter')
  .map(b => squash(strip_tags(b.html).replace(/[\[\](){}\u2014\u2013]|^\s*-+|-+\s*$/g, ' ')));

const arabic_candidates = (page: SuryaPage): number[] => {
  const out: number[] = [];
  for (const t of header_texts(page)) {
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(\d{1,4})$/))) out.push(+m[1]);
    else {
      if ((m = t.match(/^(\d{1,4})\s+\D/))) out.push(+m[1]);
      if ((m = t.match(/\D\s+(\d{1,4})$/))) out.push(+m[1]);
    }
  }
  return out;
};

const ROMAN_PAGE = /^(?=[ivxlc])(?:c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/;
const roman_candidate = (page: SuryaPage): string | null => {
  for (const t of header_texts(page)) {
    const m = t.match(/^\[?([ivxlcIVXLC]{1,7})\.?\]?$|^([ivxlc]{1,7})\s+\D|\D\s+([ivxlc]{1,7})$/);
    const r = m && (m[1] ?? m[2] ?? m[3]);
    if (r && ROMAN_PAGE.test(r.toLowerCase())) return r;
  }
  return null;
};

const CONFUSABLE = new Set(['38', '83', '56', '65', '17', '71', '08', '80', '09', '90', '68', '86']);
const ocr_close = (read: number, expected: number): boolean => {
  const a = String(read), b = String(expected);
  if (a.length !== b.length) return false;
  let diffs = 0;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k] && (++diffs > 1 || !CONFUSABLE.has(a[k] + b[k]))) return false;
  return diffs === 1;
};

// Two-page spreads (each scan shows printed pages n and n+1, headers "8" ... "9"): numbering runs two per
// scan, and the page's printed number is stored as "8-9".
const is_spread_scan = (cands: number[][]) => {
  const pairs = cands.filter(cs => cs.some(c => cs.includes(c + 1))).length;
  const withNumbers = cands.filter(cs => cs.length).length;
  return withNumbers >= 10 && pairs / withNumbers >= 0.4;
};

const printed_page_numbers = (pages: SuryaPage[]): string[] => {
  const raw = pages.map(arabic_candidates);
  const spread = is_spread_scan(raw);
  // in spread mode work with the left page of each scan: scan s ~ printed 2s + offset
  const pos = pages.map(p => (spread ? 2 * p.page : p.page));
  const cands = spread
    ? raw.map(cs => [...new Set(cs.map(c => (cs.includes(c - 1) ? c - 1 : cs.includes(c + 1) ? c : c)))])
    : raw;
  const offsets = [...new Set(cands.flatMap((cs, i) => cs.map(c => c - pos[i])))].sort((x, y) => x - y);
  const blank = pages.map(p => roman_candidate(p) ?? '');
  if (!offsets.length) return blank;

  // changing the offset by a few pages (a plate, a missing leaf) costs NEAR_SWITCH; a big jump (a new
  // numbering sequence, e.g. ads at the back) costs FAR_SWITCH, so that a run of OCR misreads ("804" for
  // 304) can't pull the numbering hundreds of pages off
  const NEAR = spread ? 24 : 12, NEAR_SWITCH = 4, FAR_SWITCH = 30;
  const emit = (i: number, off: number) => {
    const cs = cands[i];
    if (!cs.length) return 0;
    const want = pos[i] + off;
    if (cs.includes(want)) return 2;
    if (cs.some(c => ocr_close(c, want))) return 1;
    return -1;
  };
  const near = offsets.map(o => offsets.map((p, k) => [p, k] as const).filter(([p]) => p !== o && Math.abs(p - o) <= NEAR).map(([, k]) => k));
  let score = offsets.map(o => emit(0, o));
  const back: number[][] = [];
  for (let i = 1; i < pages.length; i++) {
    const bestAll = score.reduce((bi, v, k) => (v > score[bi] ? k : bi), 0);
    const bp: number[] = [];
    score = offsets.map((o, k) => {
      let best = score[k], from = k;
      for (const j of near[k]) if (score[j] - NEAR_SWITCH > best) { best = score[j] - NEAR_SWITCH; from = j; }
      if (score[bestAll] - FAR_SWITCH > best) { best = score[bestAll] - FAR_SWITCH; from = bestAll; }
      bp.push(from);
      return best + emit(i, o);
    });
    back.push(bp);
  }
  const path = new Array<number>(pages.length);
  path[pages.length - 1] = score.reduce((bi, v, k) => (v > score[bi] ? k : bi), 0);
  for (let i = pages.length - 1; i > 0; i--) path[i - 1] = back[i - 1][path[i]];

  const value = pages.map((_, i) => pos[i] + offsets[path[i]]);
  const anchored = pages.map((_, i) => emit(i, offsets[path[i]]) > 0 && value[i] >= 1);
  const show = (v: number) => (spread ? `${v}-${v + 1}` : String(v));
  const out = pages.map((_, i) => {
    if (anchored[i]) return show(value[i]);
    let prev: number | null = null, next: number | null = null, prevAt = -1, nextAt = -1;
    for (let j = i - 1; j >= 0 && prev === null; j--) if (anchored[j]) { prev = value[j]; prevAt = j; }
    for (let j = i + 1; j < pages.length && next === null; j++) if (anchored[j]) { next = value[j]; nextAt = j; }
    if (prev !== null && next !== null && value[i] > prev && value[i] < next) return show(value[i]);
    // at the start or end of the numbered run, only right next to an anchor (the first text page whose
    // "1" was read as "I", a blank verso after the last numbered page)
    if (prev === null && next !== null && nextAt - i <= 2 && value[i] >= 1 && value[i] < next) return show(value[i]);
    if (next === null && prev !== null && i - prevAt <= 2 && value[i] > prev) return show(value[i]);
    return blank[i];
  });
  // an inferred number that still collides with another page's number is dropped
  const seen = new Map<string, number>();
  out.forEach(v => v && seen.set(v, (seen.get(v) ?? 0) + 1));
  return out.map((v, i) => (v && seen.get(v)! > 1 && !anchored[i] ? blank[i] : v));
};

const printedNumbers = printed_page_numbers(suryaPages);

const pages: Page[] = suryaPages.map((p, i) => ({
  pageNumber: p.page,
  printedPageNumber: printedNumbers[i],
  blocks: [...p.blocks]
    .sort((a, b) => a.reading_order - b.reading_order)
    .map(to_block)
    .filter((b): b is PageBlock => b !== null),
}));
const pageByNumber = new Map(pages.map(p => [p.pageNumber, p]));

// ---------------------------------------------------------------------------
// Grouped citation locations
// ---------------------------------------------------------------------------

type Flat = { type: CitationLocation['type'], value: number };
type CitationIn = {
  author: string | null, title: string | null, location: string | null, kind?: string, raw: string,
};

const HARD_SPLIT = /\s*(?:;|,?\s*\b(?:also|cf|cfr|see|compare)\b\.?)\s*/i;
// split before a label word / number run, keeping the text
const CHUNK_SPLIT = /(?<=^|[\s,:(])(?=(?:§{1,2}|[A-Za-z]{1,12}\.?)\s*(?:\d|[IVXLCivxlc]+\b))/;
const trim_label = (s: string) => s.replace(/^[\s,;:.()]+|^(?:and|&)\s+/gi, '').replace(/(?:[\s,;:.(]|\band$|&$)+$/i, '').trim();

// One locator string (no hard separators) -> ungrouped CitationLocation entries with rawLabels.
const segment_entries = (c: CitationIn, seg: string, explicit_only: boolean): CitationLocation[] => {
  const flat: Flat[] = citation_locations({ ...c, location: seg } as any, { explicit_only }) as any;
  if (!flat.length) return [];

  const count = (ch: string) => (citation_locations({ ...c, location: ch } as any, { explicit_only }) as any[]).length;
  // a chunk that parses to nothing ("Vol. " split off "VIII") is a label: fold it into the next chunk
  const chunks: string[] = [];
  let carry = '';
  for (const ch of seg.split(CHUNK_SPLIT).filter(s => trim_label(s))) {
    if (count(carry + ch) === 0) { carry += ch; continue; }
    chunks.push(carry + ch);
    carry = '';
  }
  if (carry && chunks.length) chunks[chunks.length - 1] += carry;
  const counts = chunks.map(count);
  const aligned = counts.reduce((a, b) => a + b, 0) === flat.length;

  const out: CitationLocation[] = [];
  const push = (rawLabel: string, f: Flat, merge: boolean) => {
    const last = out[out.length - 1];
    if (merge && last && last.type === f.type && last.rawLabel === rawLabel) last.values.push(f.value);
    else out.push({ rawLabel, type: f.type, values: [f.value] });
  };

  if (!aligned) {
    const raw = trim_label(seg);
    for (const f of flat) push(raw, f, true);
    return out;
  }
  let k = 0;
  chunks.forEach((ch, i) => {
    const mine = flat.slice(k, k + counts[i]);
    k += counts[i];
    const raw = trim_label(ch);
    const runs = mine.reduce((n, f, j) => n + (j === 0 || mine[j - 1].type !== f.type ? 1 : 0), 0);
    const tokens = raw.split(/[\s,]+/).filter(Boolean);
    let run = -1;
    mine.forEach((f, j) => {
      const newRun = j === 0 || mine[j - 1].type !== f.type;
      if (newRun) run++;
      const label = runs > 1 && tokens.length === runs ? trim_label(tokens[run]) || tokens[run] : raw;
      push(label, f, !newRun || runs === 1);
    });
  });
  return out;
};

// "qu. 3" -> "qu", "§ 5" -> "§", "II" / "25" -> "" (bare)
const label_word = (rawLabel: string) =>
  (rawLabel.match(/^(§{1,2}|[A-Za-z]+)\.?\s*(?=\d|[IVXLCivxlc]+\b)/)?.[1] ?? '').toLowerCase();
// The hierarchy restarts only when the same type comes round again under the same label word: "q. 2, a. 3,
// q. 5" restarts, but "disp. 23, art. 2, qu. 3" (disp. and qu. are both `question`) stays one group.
const restarts = (group: CitationLocation[], e: CitationLocation) =>
  group.findIndex(p => p.type === e.type && label_word(p.rawLabel) === label_word(e.rawLabel));

const group_entries = (segments: CitationLocation[][]): CitationLocation[][] => {
  const groups: CitationLocation[][] = [];
  let cur: CitationLocation[] = [];
  const start = (e: CitationLocation) => {
    if (cur.length) groups.push(cur);
    const prev = cur.length ? cur : groups[groups.length - 1] ?? [];
    const at = restarts(prev, e);
    cur = at > 0 ? prev.slice(0, at).map(p => ({ ...p, values: [...p.values] })) : [];
    cur.push(e);
  };
  for (const seg of segments) {
    seg.forEach((e, i) => {
      if (i === 0 && cur.length) return start(e);                 // hard separator
      const last = cur[cur.length - 1];
      if (last && last.type === e.type) {                           // "pp. 3, pp. 7" -> one entry
        last.values.push(...e.values);
        if (!last.rawLabel.includes(e.rawLabel)) last.rawLabel += ', ' + e.rawLabel;
      }
      else if (restarts(cur, e) >= 0) start(e);                     // hierarchy restarts
      else cur.push(e);
    });
  }
  if (cur.length) groups.push(cur);
  return groups;
};

const locations_cited = (c: CitationIn): CitationLocation[][] => {
  if (c.kind === 'bible') {
    const flat: Flat[] = citation_locations(c as any) as any;
    // keep the printed numerals ("IV", "3") as rawLabels when the tokens line up with the parsed values
    const tokens = (c.location ?? '').split(/[\s,:.;]+/).filter(t => /^(?:\d+|[IVXLCivxlc]+)$/.test(t));
    const numbered = flat.filter(f => f.type !== 'book');
    let k = 0;
    const entries: CitationLocation[] = flat.map(f => ({
      rawLabel: f.type === 'book' ? (c.title ?? '')
        : tokens.length === numbered.length ? tokens[k++] : String(f.value),
      type: f.type, values: [f.value],
    }));
    return group_entries([entries]);
  }
  let location = c.location?.trim() ?? '';
  let explicit_only = false;
  if (!location && c.title) {
    // same fallback as add_citation_locations: labelled locators after the title in the raw text
    const at = c.raw.toLowerCase().indexOf(c.title.toLowerCase());
    if (at >= 0) { location = c.raw.slice(at + c.title.length); explicit_only = true; }
  }
  if (!location) return [];
  const loc = location.replace(/[–—]/g, '-').replace(/<\/?i>/g, '');
  const segments = loc.split(HARD_SPLIT).map(s => segment_entries(c, s, explicit_only)).filter(s => s.length);
  return group_entries(segments);
};

// ---------------------------------------------------------------------------
// Footnotes -> citations on their Footnote block
// ---------------------------------------------------------------------------

type ExtractedFootnote = {
  marker: string | null, footnote_scan_page: number, text: string, citations: CitationIn[],
};

const extracted = JSON.parse(fs.readFileSync(footnotesPath, 'utf8'));
const entry = extracted.find((b: any) => b.book === bookId);
if (!entry) {
  console.error(`no footnotes for "${bookId}" in ${footnotesPath} (run: npx tsx extract_footnotes.ts ${bookId})`);
  process.exit(1);
}

const unmatched: string[] = [];
let citations = 0, groups = 0, withLocations = 0;

for (const fn of entry.footnotes as ExtractedFootnote[]) {
  if (!fn.citations.length) continue;
  const page = pageByNumber.get(fn.footnote_scan_page);
  const footnoteBlocks = page?.blocks.filter(b => b.label === 'Footnote') ?? [];
  if (!page || !footnoteBlocks.length) {
    unmatched.push(`scan page ${fn.footnote_scan_page} marker ${fn.marker}: no Footnote block`);
    continue;
  }
  const key = norm(fn.text).slice(0, 40);
  let block = footnoteBlocks.find(b => norm(strip_tags(b.html)).includes(key));
  if (!block) {
    const short = key.slice(0, 15);
    block = footnoteBlocks.find(b => short && norm(strip_tags(b.html)).includes(short));
  }
  if (!block) {
    unmatched.push(`scan page ${fn.footnote_scan_page} marker ${fn.marker}: text not found, used first Footnote block`);
    block = footnoteBlocks[0];
  }
  for (const c of fn.citations) {
    const locationsCited = locations_cited(c);
    const citation: Citation = {
      source: { bookId, footnoteIdentifier: fn.marker ?? '', footnotePage: fn.footnote_scan_page },
      referenceBookId: null,
      author: c.author ?? '',
      title: c.title ?? '',
      location: c.location ?? '',
      raw: squash(strip_tags(c.raw)),
      locationsCited,
    };
    block.citations.push(citation);
    citations++;
    groups += locationsCited.length;
    if (locationsCited.length) withLocations++;
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const book: Book = { id: bookId, title: args.title, author: args.author, ...(args.url ? { url: args.url } : {}), pages };
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(book, null, 1));

console.log(JSON.stringify({
  out: outPath,
  pages: pages.length,
  pages_without_printed_number: pages.filter(p => !p.printedPageNumber).length,
  printed_numbers_repeated: pages.length - new Set(pages.map(p => p.printedPageNumber).filter(Boolean)).size
    - pages.filter(p => !p.printedPageNumber).length,
  blocks: stats.blocks,
  relabelled_as_Text: stats.relabelled,
  dropped: stats.dropped,
  footnotes: entry.footnotes.length,
  citations,
  citations_with_locations: withLocations,
  location_groups: groups,
  citations_missing_author: pages.flatMap(p => p.blocks.flatMap(b => b.citations)).filter(c => !c.author).length,
  unmatched_footnotes: unmatched.length,
}, null, 2));
if (unmatched.length) console.log('unmatched (first 20):\n  ' + unmatched.slice(0, 20).join('\n  '));
