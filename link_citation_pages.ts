// Link every citation in the database to the book it cites, when we hold that book and it has the cited page.
//
// Usage (from src/):
//   DATABASE_URL=postgres://user:pass@localhost:5432/db npx tsx link_citation_pages.ts [--dry-run]
//
// For each citation with at least one "page" location:
//   1. candidates: books other than the citing one by the same author with the same title (citation_matching.ts);
//      when the citation's title or location names a volume ("Vol. II, p. 34") and we hold numbered volumes,
//      only that volume
//   2. keep the candidates with a printed page number equal to one of the cited pages
//   3. exactly one left -> set citations.reference_book_id to it
// A citation with more than one candidate left (the page exists in several volumes and none is named) is
// left alone and reported as ambiguous. Citations with no page location, or no match, are left as they are:
// this never clears a reference_book_id.
//
// Report: output/citation_pages.links.json
import fs from 'node:fs';
import { Pool } from 'pg';
import { citedTitle, keyNames, sameAuthor, sameTitle, skipCitation, tokens, volumeOf } from './citation_matching';

const DRY = process.argv.includes('--dry-run');
const REPORT_FILE = 'output/citation_pages.links.json';
if (!process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=... tsx link_citation_pages.ts [--dry-run]');
  process.exit(1);
}

type Book = { id: string, title: string, author: string };

const main = async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = await pool.connect();
  const report = {
    dry_run: DRY,
    citations_with_pages: 0,
    skipped_no_author: 0,          // no author, Bible, or no title
    no_book_held: 0,               // no book we hold matches the author and title
    // we hold the book, but none of the cited pages is a printed page number in it
    page_not_found: [] as { citation_id: string, source_book_id: string, author: string, title: string, pages: number[], books: string[], linked_to: string | null }[],
    already_linked: 0,             // reference_book_id was already the matching book
    linked: [] as { citation_id: string, source_book_id: string, author: string, title: string, pages: number[], book_id: string, was: string | null }[],
    ambiguous: [] as { citation_id: string, source_book_id: string, author: string, title: string, pages: number[], books: string[] }[],
  };

  try {
    await db.query('BEGIN');
    const books: Book[] = (await db.query('SELECT id, title, author FROM books')).rows;

    const printedPages = new Map<string, Set<string>>();
    for (const r of (await db.query(`SELECT book_id, printed_page_number FROM pages WHERE printed_page_number <> ''`)).rows) {
      const set = printedPages.get(r.book_id) ?? new Set<string>();
      set.add(r.printed_page_number.trim());
      printedPages.set(r.book_id, set);
    }

    const citations: {
      id: string, source_book_id: string, author: string, title: string, location: string,
      reference_book_id: string | null, pages: number[],
    }[] = (await db.query(
      `SELECT c.id, c.source_book_id, c.author, c.title, c.location, c.reference_book_id,
              array_agg(DISTINCT l.value ORDER BY l.value) AS pages
       FROM citations c JOIN citation_locations l ON l.citation_id = c.id AND l.type = 'page'
       GROUP BY c.id
       ORDER BY c.id`)).rows;
    report.citations_with_pages = citations.length;

    // The same (author, title) is cited many times: match it against the books once.
    const heldCache = new Map<string, Book[]>();
    const heldFor = (author: string, title: string) => {
      const key = `${keyNames(author).join(' ')}|${tokens(citedTitle(title) || title).join(' ')}`;
      let held = heldCache.get(key);
      if (!held) {
        held = books.filter(b => sameAuthor(author, b.author) && sameTitle(citedTitle(title) || title, b.title));
        heldCache.set(key, held);
      }
      return held;
    };

    const updates: { id: string, book_id: string }[] = [];
    for (const c of citations) {
      if (skipCitation(c.author, c.title)) { report.skipped_no_author++; continue; }

      let candidates = heldFor(c.author, c.title).filter(b => b.id !== c.source_book_id);
      if (!candidates.length) { report.no_book_held++; continue; }

      // "Vol. I, p. 33" of a work we hold as one unnumbered book still goes to that book
      const volume = volumeOf(c.title) ?? volumeOf(c.location);
      if (volume !== null && candidates.some(b => volumeOf(b.title) !== null)) {
        candidates = candidates.filter(b => volumeOf(b.title) === volume);
      }

      const withPage = candidates.filter(b => c.pages.some(p => printedPages.get(b.id)?.has(String(p))));
      const entry = { citation_id: String(c.id), source_book_id: c.source_book_id, author: c.author, title: c.title, pages: c.pages };
      if (withPage.length === 0) {
        report.page_not_found.push({ ...entry, books: candidates.map(b => b.id), linked_to: c.reference_book_id });
        continue;
      }
      if (withPage.length > 1) { report.ambiguous.push({ ...entry, books: withPage.map(b => b.id) }); continue; }

      const target = withPage[0]!;
      if (c.reference_book_id === target.id) { report.already_linked++; continue; }
      updates.push({ id: String(c.id), book_id: target.id });
      report.linked.push({ ...entry, book_id: target.id, was: c.reference_book_id });
    }

    if (updates.length) {
      await db.query(
        `UPDATE citations c SET reference_book_id = u.book_id
         FROM unnest($1::bigint[], $2::text[]) AS u(id, book_id)
         WHERE c.id = u.id`,
        [updates.map(u => u.id), updates.map(u => u.book_id)]);
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
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({
    dry_run: DRY,
    citations_with_pages: report.citations_with_pages,
    skipped_no_author: report.skipped_no_author,
    no_book_held: report.no_book_held,
    page_not_found: report.page_not_found.length,
    already_linked: report.already_linked,
    linked: report.linked.length,
    relinked: report.linked.filter(l => l.was !== null).length,   // pointed at a different book before
    ambiguous: report.ambiguous.length,
    report: REPORT_FILE,
  }, null, 2));
};

main().catch(e => { console.error(e); process.exit(1); });
