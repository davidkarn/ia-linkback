// Link a loaded book's citations to the books they cite, and queue missing books for import.
//
// Usage (from src/, after output/<book>.sql has been loaded):
//   DATABASE_URL=postgres://user:pass@localhost:5432/db npx tsx link_citations.ts --book <book> [--dry-run] [--no-archive]
//
// For every distinct (author, title) cited by <book> whose citations have no "referenceBookId" yet:
//   1. a book in `books` by the same author with the same title   -> set citations."referenceBookId"
//   2. else a matching row in `queued_book_imports`                -> nothing to do (already queued)
//   3. else search archive.org; an item by that author with that title and a public (non-lending) PDF
//      -> insert a queued_book_imports row (status 'queued', archive_url, pdf_url)
// Then the other direction: citations in other books that cite <book> get "referenceBookId" = <book>, and a
// queued_book_imports row for <book> (same archive identifier, or same author + title) is marked 'imported'.
//
// "Same author": a surname of the cited author appears among the book's/item's author names.
// "Same title": the normalized titles are equal, one is the other plus a subtitle ("Christian Philosophy: God"
// ~ "Christian philosophy, God; being a contribution ..."), or Jaro-Winkler >= 0.93.
// Citations with no author (and Bible citations) are never matched, queued or searched.
//
// archive.org answers are cached in output/archive_cache.json, so re-runs don't search again.
// Requests are spaced ~1s apart.
import fs from 'node:fs';
import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const bookId = opt('book');
const DRY = flag('dry-run');
const ARCHIVE = !flag('no-archive');
const ARCHIVE_BASE = process.env.ARCHIVE_BASE ?? 'https://archive.org';
const CACHE_FILE = 'output/archive_cache.json';
if (!bookId || !process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=... tsx link_citations.ts --book <id> [--dry-run] [--no-archive]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

// also re-joins words broken at a line end by the OCR: "Knowabil- ity" -> "knowability"
const fold = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/(\p{L})[-\u00ad]\s+(\p{Ll})/gu, '$1$2');
// "Christian Philosophy: God, 2nd ed" / ", Chapter XV" / ", vol. II" -> "Christian Philosophy: God"
const citedTitle = (s: string) =>
  s.replace(/,\s*(?:\d+(?:st|nd|rd|th)\s+ed|ed\.|edition|chapter|chap\.|ch\.|vol|vols|book|bk|part|pt|tom|tome|lib|p\.|pp\.)(?![a-z]).*$/i, '').trim();
const tokens = (s: string) => fold(s).replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
// main title: before the first ":" / ";" (subtitle) -- "Christian philosophy, God; being ..." -> "christian philosophy god"
const mainTitle = (s: string) => tokens(s.split(/[:;]|\s[-\u2014]\s|,?\s+by\s+/i)[0]);

const jaro_winkler = (a: string, b: string): number => {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false), bm = new Array(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true; m++; break;
    }
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let l = 0;
  while (l < 4 && a[l] === b[l]) l++;
  return jaro + l * 0.1 * (1 - jaro);
};

const startsWith = (long: string[], short: string[]) => short.length > 0 && short.every((t, i) => long[i] === t);
const contains = (long: string[], short: string[]) => {
  for (let i = 0; i + short.length <= long.length; i++) if (short.every((t, j) => long[i + j] === t)) return true;
  return false;
};
const ARTICLES = new Set(['a', 'an', 'the', 'le', 'la', 'les', 'l', 'der', 'die', 'das', 'il', 'lo', 'el']);
const dropArticle = (t: string[]) => (t.length > 1 && ARTICLES.has(t[0]) ? t.slice(1) : t);

const sameTitle = (cited: string, other: string): boolean => {
  const c = dropArticle(tokens(cited)), o = dropArticle(tokens(other));
  if (!c.length || !o.length) return false;
  if (c.join(' ') === o.join(' ')) return true;
  const cm = dropArticle(mainTitle(cited)), om = dropArticle(mainTitle(other));
  // one is the other plus a subtitle; a single shared word ("Logic") isn't enough on its own
  // (a truncated two-word title like "God: His" doesn't match a seven-word one)
  const prefixOk = (short: string[], long: string[]) => short.length >= 3 || long.length <= short.length + 2;
  if (c.length >= 2 && startsWith(o, c) && prefixOk(c, om)) return true;
  if (om.length >= 2 && startsWith(c, om) && prefixOk(om, c)) return true;
  if (cm.length >= 2 && cm.join(' ') === om.join(' ')) return true;
  // "De Deo Creante et Elevante" in "Tractatus de Deo creante et elevante": a run of 3+ words covering most of it
  if (c.length >= 3 && contains(om, c) && c.length / om.length >= 0.6) return true;
  return c.join(' ').length >= 12 && jaro_winkler(c.join(' '), o.join(' ')) >= 0.93;
};

const NAME_NOISE = new Set(['st', 'saint', 'rev', 'fr', 'dr', 'prof', 'mgr', 'card', 'cardinal', 'bp', 'bishop', 'pope',
  'sj', 'op', 'osb', 'ofm', 'de', 'di', 'du', 'del', 'della', 'des', 'von', 'van', 'der', 'den', 'le', 'la', 'da', 'of', 'and', 'the', 'ed', 'tr', 'trans']);
// "Pohle-Preuss" -> [pohle, preuss]; "J. T. Driscoll" -> [driscoll]; "Thomas Aquinas" -> [thomas, aquinas]
const surnames = (author: string): string[] =>
  tokens(author).filter(t => t.length > 2 && !NAME_NOISE.has(t) && !/^\d+$/.test(t));
// The names that must match: "Pohle-Preuss" -> both parts; "Driscoll, John T. (John Thomas), 1866-" -> the part
// before the comma; "J. T. Driscoll" -> the last name.
const keyNames = (author: string): string[] => {
  if (author.includes(',')) return surnames(author.split(',')[0]);
  if (/\p{L}-\p{L}/u.test(author)) return surnames(author);
  const last = surnames(author).pop();
  return last ? [last] : [];
};
const sameAuthor = (cited: string, other: string): boolean => {
  const keys = keyNames(cited), o = new Set(surnames(other));
  return keys.length > 0 && keys.some(k => o.has(k));
};

const skipCitation = (author: string, title: string) =>
  !author.trim() || !title.trim() || /^bible$/i.test(author.trim()) || tokens(title).join('').length < 4;

// ---------------------------------------------------------------------------
// archive.org
// ---------------------------------------------------------------------------

type ArchiveHit = { identifier: string, title: string, creator: string, pdf: string } | null;
const cache: Record<string, ArchiveHit> = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
const saveCache = () => { fs.mkdirSync('output', { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1)); };

let lastRequest = 0;
const getJson = async (url: string): Promise<any> => {
  const wait = lastRequest + 1000 - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequest = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'references-citation-linker/1.0' } });
      if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 5000 * (attempt + 1))); continue; }
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
};
const one = (v: unknown) => (Array.isArray(v) ? v.join('; ') : typeof v === 'string' ? v : '');
const queryWords = (s: string, max: number) =>
  tokens(s).filter(t => t.length > 2 && !['the', 'and', 'for', 'with', 'from'].includes(t)).slice(0, max);

const searchArchive = async (author: string, title: string): Promise<ArchiveHit> => {
  const key = `${fold(author)}|${fold(title)}`;
  if (key in cache) return cache[key];
  const words = queryWords(title, 8), names = surnames(author);
  let hit: ArchiveHit = null;
  if (words.length && names.length) {
    const q = `title:(${words.join(' ')}) AND creator:(${names.join(' OR ')}) AND mediatype:texts`;
    const url = `${ARCHIVE_BASE}/advancedsearch.php?q=${encodeURIComponent(q)}` +
      '&fl[]=identifier&fl[]=title&fl[]=creator&rows=15&output=json';
    const docs: any[] = (await getJson(url))?.response?.docs ?? [];
    const candidates = docs.filter(d => sameTitle(title, one(d.title)) && sameAuthor(author, one(d.creator))).slice(0, 4);
    for (const d of candidates) {
      const meta = await getJson(`${ARCHIVE_BASE}/metadata/${encodeURIComponent(d.identifier)}`);
      if (!meta?.metadata || one(meta.metadata['access-restricted-item']) === 'true') continue;   // lending library only
      const pdfs = (meta.files ?? []).filter((f: any) => /\.pdf$/i.test(f.name) && f.private !== 'true' && f.private !== true);
      const pdf = pdfs.find((f: any) => f.format === 'Text PDF') ?? pdfs.find((f: any) => !/_bw\.pdf$/i.test(f.name)) ?? pdfs[0];
      if (!pdf) continue;
      hit = {
        identifier: d.identifier,
        title: one(meta.metadata.title) || one(d.title),
        creator: one(meta.metadata.creator) || one(d.creator),
        pdf: `${ARCHIVE_BASE.replace(/^http:/, 'https:')}/download/${encodeURIComponent(d.identifier)}/${pdf.name.split('/').map(encodeURIComponent).join('/')}`,
      };
      break;
    }
  }
  cache[key] = hit;
  saveCache();
  return hit;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = await pool.connect();
  const report = {
    book: bookId, dry_run: DRY,
    works_cited: 0,            // distinct works after merging spellings
    skipped_no_author: 0,      // distinct (author, title) spellings with no author, Bible, or no title
    linked_to_books: [] as { author: string, title: string, book_id: string, citations: number }[],
    already_queued: [] as { author: string, title: string, queue_id: string }[],
    queued: [] as { author: string, title: string, archive_url: string, pdf_url: string, archive_title: string, archive_creator: string }[],
    not_found: [] as { author: string, title: string }[],
    backfilled_citations_to_this_book: 0,
    queue_rows_marked_imported: 0,
    errors: [] as string[],
  };
  try {
    const exists = await db.query('SELECT id, title, author FROM books WHERE id = $1', [bookId]);
    if (!exists.rowCount) throw new Error(`book "${bookId}" is not in the database: load output/${bookId}.sql first`);
    const self = exists.rows[0];

    await db.query('BEGIN');
    const books = (await db.query('SELECT id, title, author FROM books')).rows;
    const queue = (await db.query('SELECT id, title, author, archive_url, status FROM queued_book_imports')).rows;
    const works = (await db.query(
      `SELECT author, title, count(*)::int AS n FROM citations
       WHERE source_book_id = $1 AND "referenceBookId" IS NULL GROUP BY author, title ORDER BY count(*) DESC`, [bookId])).rows;

    // One lookup per work: spellings that differ only by case, punctuation, a line-break hyphen or an
    // edition/chapter suffix are the same work.
    const byWork = new Map<string, { author: string, title: string, variants: { author: string, title: string }[] }>();
    for (const w of works) {
      if (skipCitation(w.author, w.title)) { report.skipped_no_author++; continue; }
      const title = citedTitle(w.title) || w.title;
      const key = `${keyNames(w.author).join(' ')}|${dropArticle(tokens(title)).join(' ')}`;
      const entry = byWork.get(key) ?? { author: w.author, title, variants: [] };
      entry.variants.push({ author: w.author, title: w.title });
      byWork.set(key, entry);
    }
    report.works_cited = byWork.size;
    const setReference = async (variants: { author: string, title: string }[], refId: string) => {
      let n = 0;
      for (const v of variants) {
        const r = await db.query(
          `UPDATE citations SET "referenceBookId" = $1
           WHERE source_book_id = $2 AND author = $3 AND title = $4 AND "referenceBookId" IS NULL`,
          [refId, bookId, v.author, v.title]);
        n += r.rowCount ?? 0;
      }
      return n;
    };

    for (const w of byWork.values()) {

      // 1. a book we hold
      const book = books.find(b => b.id !== bookId && sameAuthor(w.author, b.author) && sameTitle(w.title, b.title));
      if (book) {
        const n = await setReference(w.variants, book.id);
        report.linked_to_books.push({ author: w.author, title: w.title, book_id: book.id, citations: n });
        continue;
      }
      // 2. already queued
      const queued = queue.find(q => sameAuthor(w.author, q.author) && sameTitle(w.title, q.title));
      if (queued) { report.already_queued.push({ author: w.author, title: w.title, queue_id: String(queued.id) }); continue; }
      // 3. archive.org
      if (!ARCHIVE) { report.not_found.push({ author: w.author, title: w.title }); continue; }
      let hit: ArchiveHit = null;
      try { hit = await searchArchive(w.author, w.title); }
      catch (e) { report.errors.push(`${w.author}, ${w.title}: ${(e as Error).message}`); continue; }
      if (!hit) { report.not_found.push({ author: w.author, title: w.title }); continue; }

      const archive_url = `https://archive.org/details/${hit.identifier}`;
      // the same archive item reached through a different spelling of the citation
      // ...or another copy/edition of a work already queued, compared under the archive's own title and creator
      const sameItem = queue.find(q => q.archive_url === archive_url
          || (sameAuthor(q.author, hit!.creator) && (sameTitle(q.title, hit!.title) || sameTitle(hit!.title, q.title))))
        ?? (books.some(b => b.id === hit!.identifier) ? { id: `book ${hit.identifier}` } : null);
      if (sameItem) { report.already_queued.push({ author: w.author, title: w.title, queue_id: String(sameItem.id) }); continue; }

      const row = { title: hit.title, author: hit.creator || w.author, archive_url, pdf_url: hit.pdf };
      const ins = await db.query(
        `INSERT INTO queued_book_imports (title, author, archive_url, pdf_url, status) VALUES ($1, $2, $3, $4, 'queued') RETURNING id`,
        [row.title, row.author, row.archive_url, row.pdf_url]);
      queue.push({ id: ins.rows[0].id, ...row, status: 'queued' });
      report.queued.push({ author: w.author, title: w.title, archive_url, pdf_url: hit.pdf, archive_title: hit.title, archive_creator: hit.creator });
    }

    // Other books' citations of this book
    const incoming = (await db.query(
      `SELECT DISTINCT author, title FROM citations WHERE "referenceBookId" IS NULL AND source_book_id <> $1 AND author <> '' AND title <> ''`,
      [bookId])).rows.filter(c => sameAuthor(c.author, self.author) && sameTitle(citedTitle(c.title) || c.title, self.title));
    for (const c of incoming) {
      const r = await db.query(
        `UPDATE citations SET "referenceBookId" = $1 WHERE "referenceBookId" IS NULL AND source_book_id <> $1 AND author = $2 AND title = $3`,
        [bookId, c.author, c.title]);
      report.backfilled_citations_to_this_book += r.rowCount ?? 0;
    }
    // A queued import of this book is now done
    const done = queue.filter(q => q.status !== 'imported' &&
      (q.archive_url === `https://archive.org/details/${bookId}` || (sameAuthor(self.author, q.author) && sameTitle(self.title, q.title))));
    for (const q of done) {
      await db.query(`UPDATE queued_book_imports SET status = 'imported', imported_book_id = $1 WHERE id = $2`, [bookId, q.id]);
      report.queue_rows_marked_imported++;
    }

    await db.query(DRY ? 'ROLLBACK' : 'COMMIT');
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    db.release();
    await pool.end();
  }

  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(`output/${bookId}.links.json`, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({
    book: bookId, dry_run: DRY, works_cited: report.works_cited, skipped_no_author: report.skipped_no_author,
    linked_to_books: report.linked_to_books.length,
    citations_linked: report.linked_to_books.reduce((n, l) => n + l.citations, 0),
    already_queued: report.already_queued.length, newly_queued: report.queued.length,
    not_found: report.not_found.length, backfilled_citations_to_this_book: report.backfilled_citations_to_this_book,
    queue_rows_marked_imported: report.queue_rows_marked_imported, errors: report.errors.length,
    report: `output/${bookId}.links.json`,
  }, null, 2));
};

main().catch(e => { console.error(e); process.exit(1); });
