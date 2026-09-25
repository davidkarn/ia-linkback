// Render each book's cover image from its PDF, for the frontend.
//
// Usage (from src/):
//   DATABASE_URL=postgres://user:pass@localhost:5432/db npx tsx extract_covers.ts [--book <id>] [--force]
//   --book <id>   only this book
//   --force       re-render covers that already exist on disk
//
// The cover is the first page that isn't blank or a scanner's notice: scans start with Google's usage
// notice, blank endpapers, or Digital Library of India pages ("TEXT FLY WITHIN THE BOOK ONLY", a "UNIVERSAL
// LIBRARY" label, an accession stamp, a library card, "THE BOOK WAS DRENCHED"). Pages are checked by their share of dark pixels and by OCR'ing them
// with tesseract. If none of the first MAX_PAGES qualifies, page 1 is used.
//
// Each cover is written to web/public/covers/<book id>.jpg (600px wide) and books.cover_photo_path is set to
// "covers/<book id>.jpg": relative to web/public, so the frontend serves it at /covers/<book id>.jpg.
// Needs ImageMagick (`magick`) with Ghostscript for reading PDFs, and tesseract.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { PDF_DIR, list_pdfs, pdf_for_book } from './book_pdfs';

const argv = process.argv.slice(2);
const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const ONLY_BOOK = opt('book');
const FORCE = argv.includes('--force');
const PUBLIC_DIR = 'web/public';
const COVERS_DIR = 'covers';
const MAX_PAGES = 12;
const MIN_DARK = 0.005;   // pages with less ink than this are blank or nearly so (a half-title alone)
const NOTICES: [RegExp, string][] = [
  [/scanned by Google|Google Book Search/i, 'Google notice'],
  [/TEXT FLY WITHIN/i, 'DLI "text fly" notice'],
  [/UNIVERSAL\s+LIBRARY/i, 'Universal Library label'],
  [/Accession\s+N[oe]/i, 'accession stamp'],
  [/should be returned|OSMAN[IT]A\s+UNIVERSITY/i, 'library card'],
  [/BOOK\s+WAS\s+DRENCHED/i, 'DLI "drenched" notice'],
];
if (!process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=... tsx extract_covers.ts [--book <id>] [--force]');
  process.exit(1);
}

const magick = (args: string[]) =>
  execFileSync('magick', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

// Why page `page` (0-based) of `pdf` isn't a cover, or null if it is one; undefined past the last page.
const not_a_cover = (pdf: string, page: number, tmp: string): string | null | undefined => {
  const png = path.join(tmp, 'page.png');
  try {
    magick(['-density', '100', `${pdf}[${page}]`, '-background', 'white', '-alpha', 'remove', '-colorspace', 'gray', png]);
  } catch {
    return undefined;
  }

  const dark = Number(magick([png, '-threshold', '60%', '-format', '%[fx:1-mean]', 'info:']));
  if (dark < MIN_DARK) return 'blank';

  const text = execFileSync('tesseract', [png, '-'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return NOTICES.find(([re]) => re.test(text))?.[1] ?? null;
};

const find_cover_page = (pdf: string) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-'));
  const skipped: { page: number, reason: string }[] = [];
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const reason = not_a_cover(pdf, page, tmp);
      if (reason === undefined) break;
      if (reason === null) return { page, skipped };
      skipped.push({ page: page + 1, reason });
    }
    return { page: 0, skipped, fallback: true };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

const render_page = (pdf: string, page: number, out: string) => {
  // white background so transparent PDFs don't come out black
  magick([
    '-density', '150', `${pdf}[${page}]`,
    '-background', 'white', '-alpha', 'remove',
    '-resize', '600x>', '-quality', '82', out,
  ]);
};

const main = async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const report = {
    rendered: 0,
    existing: 0,
    // books whose cover isn't page 1, and why the pages before it were skipped
    not_first_page: [] as { book: string, page: number, skipped: string[] }[],
    // books where none of the first MAX_PAGES looked like a cover: page 1 was used
    fell_back_to_first_page: [] as { book: string, skipped: string[] }[],
    no_pdf: [] as string[],
    failed: [] as { book: string, error: string }[],
  };

  try {
    const books: { id: string }[] = (await pool.query(
      `SELECT id FROM books ${ONLY_BOOK ? 'WHERE id = $1' : ''} ORDER BY id`, ONLY_BOOK ? [ONLY_BOOK] : [])).rows;
    if (ONLY_BOOK && !books.length) throw new Error(`book "${ONLY_BOOK}" is not in the database`);

    const pdfs = list_pdfs();
    fs.mkdirSync(path.join(PUBLIC_DIR, COVERS_DIR), { recursive: true });

    for (const book of books) {
      const pdf = pdf_for_book(book.id, pdfs);
      if (!pdf) { report.no_pdf.push(book.id); continue; }

      const coverPath = `${COVERS_DIR}/${path.basename(book.id)}.jpg`;
      const out = path.join(PUBLIC_DIR, coverPath);
      if (fs.existsSync(out) && !FORCE) {
        report.existing++;
      }
      else {
        try {
          const pdfPath = path.join(PDF_DIR, pdf);
          const cover = find_cover_page(pdfPath);
          const skipped = cover.skipped.map(s => `p${s.page}: ${s.reason}`);
          if (cover.fallback) report.fell_back_to_first_page.push({ book: book.id, skipped });
          else if (cover.page > 0) report.not_first_page.push({ book: book.id, page: cover.page + 1, skipped });

          render_page(pdfPath, cover.page, out);
          report.rendered++;
          console.log(`${book.id} -> ${out} (page ${cover.page + 1})`);
        } catch (e) {
          const stderr = (e as { stderr?: Buffer }).stderr?.toString().trim();
          report.failed.push({ book: book.id, error: stderr || (e as Error).message });
          continue;
        }
      }

      await pool.query('UPDATE books SET cover_photo_path = $1 WHERE id = $2', [coverPath, book.id]);
    }
  } finally {
    await pool.end();
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.failed.length) process.exit(1);
};

main().catch(e => { console.error(e); process.exit(1); });
