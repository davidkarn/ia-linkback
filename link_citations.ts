// Link a loaded book's citations to the books they cite, and queue missing books for import.
//
// Usage (from src/, after output/<book>.sql has been loaded):
//   DATABASE_URL=postgres://user:pass@localhost:5432/db npx tsx link_citations.ts --book <book> [--dry-run] [--no-archive]
//
// For every distinct (author, title) cited by <book> whose citations have no reference_book_id yet:
//   1. a book in `books` by the same author with the same title   -> set citations.reference_book_id
//   2. else a matching row in `queued_book_imports`                -> nothing to do (already queued)
//   3. else search archive.org; an item by that author with that title and a public (non-lending) PDF
//      -> insert a queued_book_imports row (status 'queued', archive_url, pdf_url)
// Then the other direction: citations in other books that cite <book> get reference_book_id = <book>, and a
// queued_book_imports row for <book> (same archive identifier, or same author + title) is marked 'imported'.
//
// "Same author": a surname of the cited author appears among the book's/item's author names.
// "Same title": the normalized titles are equal, one is the other plus a subtitle ("Christian Philosophy: God"
// ~ "Christian philosophy, God; being a contribution ..."), or Jaro-Winkler >= 0.93.
// Citations with no author (and Bible citations) are never matched, queued or searched.
// Multi-volume works: titles are compared without ", Vol. N..."; when we hold volumes of the work, each
// citation goes to the volume named in its title or location ("The Sacraments" + "Vol. II, p. 34"), and one
// that names none is left unlinked (reported as volume_not_stated) unless we hold just one, unnumbered, copy.
//
// archive.org answers are cached in output/archive_cache.json, so re-runs don't search again.
// Requests are spaced ~1s apart.
import fs from 'node:fs';
import { Pool } from 'pg';
import {
  citedTitle, dropArticle, fold, keyNames, sameAuthor, sameTitle, skipCitation, surnames, tokens, volumeOf,
} from './citation_matching';

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
    not_searched: [] as { author: string, title: string }[],   // archive.org was unreachable: re-run to search these
    // citations of a multi-volume work we hold that don't say which volume: left unlinked rather than guessed
    volume_not_stated: [] as { author: string, title: string, citations: number, volumes_held: string[] }[],
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
       WHERE source_book_id = $1 AND reference_book_id IS NULL GROUP BY author, title ORDER BY count(*) DESC`, [bookId])).rows;

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
    let consecutiveFailures = 0, archiveDown = false;
    const setReference = async (variants: { author: string, title: string }[], refId: string) => {
      let n = 0;
      for (const v of variants) {
        const r = await db.query(
          `UPDATE citations SET reference_book_id = $1
           WHERE source_book_id = $2 AND author = $3 AND title = $4 AND reference_book_id IS NULL`,
          [refId, bookId, v.author, v.title]);
        n += r.rowCount ?? 0;
      }
      return n;
    };

    for (const w of byWork.values()) {

      // 1. a book we hold
      const held = books.filter(b => b.id !== bookId && sameAuthor(w.author, b.author) && sameTitle(w.title, b.title));
      if (held.length === 1 && volumeOf(held[0].title) === null) {
        const n = await setReference(w.variants, held[0].id);
        report.linked_to_books.push({ author: w.author, title: w.title, book_id: held[0].id, citations: n });
        continue;
      }
      if (held.length) {
        // a multi-volume work: each citation goes to the volume its title or location names
        const linked: Record<string, number> = {};
        let ambiguous = 0;
        for (const v of w.variants) {
          const rows = (await db.query(
            `SELECT id, title, location FROM citations
             WHERE source_book_id = $1 AND author = $2 AND title = $3 AND reference_book_id IS NULL`,
            [bookId, v.author, v.title])).rows;
          for (const r of rows) {
            const vol = volumeOf(r.title) ?? volumeOf(r.location);
            const target = vol !== null ? held.find(b => volumeOf(b.title) === vol)
              : held.length === 1 ? held[0] : undefined;
            if (!target) { ambiguous++; continue; }
            await db.query(`UPDATE citations SET reference_book_id = $1 WHERE id = $2`, [target.id, r.id]);
            linked[target.id] = (linked[target.id] ?? 0) + 1;
          }
        }
        for (const [id, n] of Object.entries(linked))
          report.linked_to_books.push({ author: w.author, title: w.title, book_id: id, citations: n });
        if (ambiguous) report.volume_not_stated.push({ author: w.author, title: w.title, citations: ambiguous, volumes_held: held.map(b => b.id) });
        continue;   // we hold (part of) the work: don't queue it
      }
      // 2. already queued
      const queued = queue.find(q => sameAuthor(w.author, q.author) && sameTitle(w.title, q.title));
      if (queued) { report.already_queued.push({ author: w.author, title: w.title, queue_id: String(queued.id) }); continue; }
      // 3. archive.org
      if (!ARCHIVE) { report.not_found.push({ author: w.author, title: w.title }); continue; }
      if (archiveDown) { report.not_searched.push({ author: w.author, title: w.title }); continue; }
      let hit: ArchiveHit = null;
      try { hit = await searchArchive(w.author, w.title); consecutiveFailures = 0; }
      catch (e) {
        report.errors.push(`${w.author}, ${w.title}: ${(e as Error).message}`);
        // archive.org unreachable: stop searching for this run instead of retrying every work
        if (++consecutiveFailures >= 5) {
          archiveDown = true;
          console.error('archive.org failed 5 times in a row; not searching the rest (re-run link_citations.ts later)');
        }
        continue;
      }
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
      `SELECT DISTINCT author, title FROM citations WHERE reference_book_id IS NULL AND source_book_id <> $1 AND author <> '' AND title <> ''`,
      [bookId])).rows.filter(c => sameAuthor(c.author, self.author) && sameTitle(citedTitle(c.title) || c.title, self.title));
    const selfVolume = volumeOf(self.title);
    const siblings = books.filter(b => b.id !== bookId && sameAuthor(self.author, b.author) && sameTitle(self.title, b.title));
    for (const c of incoming) {
      const rows = (await db.query(
        `SELECT id, title, location FROM citations WHERE reference_book_id IS NULL AND source_book_id <> $1 AND author = $2 AND title = $3`,
        [bookId, c.author, c.title])).rows;
      for (const r of rows) {
        const vol = volumeOf(r.title) ?? volumeOf(r.location);
        const mine = vol !== null ? vol === selfVolume : siblings.length === 0 && selfVolume === null;
        if (!mine) continue;
        await db.query(`UPDATE citations SET reference_book_id = $1 WHERE id = $2`, [bookId, r.id]);
        report.backfilled_citations_to_this_book++;
      }
    }
    // A queued import of this book is now done
    const done = queue.filter(q => q.status !== 'imported' &&
      (q.archive_url === `https://archive.org/details/${bookId}` ||
        (sameAuthor(self.author, q.author) && sameTitle(self.title, q.title) && volumeOf(q.title) === selfVolume)));
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
    not_found: report.not_found.length, volume_not_stated: report.volume_not_stated.reduce((n, v) => n + v.citations, 0),
    backfilled_citations_to_this_book: report.backfilled_citations_to_this_book,
    queue_rows_marked_imported: report.queue_rows_marked_imported, errors: report.errors.length,
    not_searched: report.not_searched.length,
    report: `output/${bookId}.links.json`,
  }, null, 2));
};

main().catch(e => { console.error(e); process.exit(1); });
