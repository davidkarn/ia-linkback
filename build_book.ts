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
import { build_pages, norm, squash, strip_tags, type SuryaPage } from './book_pages';
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

const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const suryaPages: SuryaPage[] = data[Object.keys(data)[0]];
const { pages, stats } = build_pages(suryaPages);
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
