// OCR results -> Pages: block labels and printed page numbers. Used by build_book.ts and
// spider/process_ocred_books.ts.
import type { Page, PageBlock } from './types';

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&nbsp;': ' ',
};
export const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|nbsp|#x27|#39);/g, m => ENTITIES[m]);
export const strip_tags = (html: string) => decode(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''));
export const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
export const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// ---------------------------------------------------------------------------
// Pages and blocks
// ---------------------------------------------------------------------------

export type SuryaBlock = { label: string, html: string, reading_order: number, bbox: number[] };
export type SuryaPage = { blocks: SuryaBlock[], page: number };

const LABELS = new Set<PageBlock['label']>(['SectionHeader', 'Text', 'PageHeader', 'PageFooter', 'Footnote']);
const IMAGE_LABELS = new Set(['Picture', 'Figure', 'Diagram']);
export type BuildStats = { blocks: number, relabelled: Record<string, number>, dropped: Record<string, number> };

const to_block = (b: SuryaBlock, stats: BuildStats): PageBlock | null => {
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

// A book's pages from its surya results: blocks in reading order (see the conventions in build_book.ts)
// and printed page numbers.
export const build_pages = (suryaPages: SuryaPage[]): { pages: Page[], stats: BuildStats } => {
  const stats: BuildStats = { blocks: 0, relabelled: {}, dropped: {} };
  const printedNumbers = printed_page_numbers(suryaPages);

  const pages: Page[] = suryaPages.map((p, i) => ({
    pageNumber: p.page,
    printedPageNumber: printedNumbers[i],
    blocks: [...p.blocks]
      .sort((a, b) => a.reading_order - b.reading_order)
      .map(b => to_block(b, stats))
      .filter((b): b is PageBlock => b !== null),
  }));
  return { pages, stats };
};
