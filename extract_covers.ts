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
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { PDF_DIR, list_pdfs, pdf_for_book } from './book_pdfs';
import { find_cover_page, render_page } from './spider/cover_images.ts';

const argv = process.argv.slice(2);
const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const ONLY_BOOK = opt('book');
const FORCE = argv.includes('--force');
const PUBLIC_DIR = 'web/public';
const COVERS_DIR = 'covers';
if (!process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=... tsx extract_covers.ts [--book <id>] [--force]');
  process.exit(1);
}

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
