// Finding and rendering a book's cover from its PDF: the first page that isn't blank or a scanner's notice
// (Google's usage notice, blank endpapers, Digital Library of India pages: "TEXT FLY WITHIN THE BOOK ONLY", a
// "UNIVERSAL LIBRARY" label, an accession stamp, a library card, "THE BOOK WAS DRENCHED"). Pages are checked by
// their share of dark pixels and by OCR'ing them with tesseract; if none of the first MAX_PAGES qualifies, page
// 1 is used. Used by the save-cover command (cli/commands/save_cover.command.ts).
// Needs ImageMagick (`magick`) with Ghostscript for reading PDFs, and tesseract.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_PAGES                   = 12;
const MIN_DARK                    = 0.005;   // pages with less ink than this are blank or nearly so (a half-title alone)
const NOTICES: [RegExp, string][] = [
  [/scanned by Google|Google Book Search/i, 'Google notice'],
  [/TEXT FLY WITHIN/i, 'DLI "text fly" notice'],
  [/UNIVERSAL\s+LIBRARY/i, 'Universal Library label'],
  [/Accession\s+N[oe]/i, 'accession stamp'],
  [/should be returned|OSMAN[IT]A\s+UNIVERSITY/i, 'library card'],
  [/BOOK\s+WAS\s+DRENCHED/i, 'DLI "drenched" notice'],
];

const magick = (args: string[]) =>
  execFileSync('magick', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

// Why page `page` (0-based) of `pdf` isn't a cover, or null if it is one; undefined past the last page.
const not_a_cover = (pdf: string, page: number, tmp: string): string | null | undefined => {
  const png = path.join(tmp, 'page.png');
  try {
    magick(['-density', '100', `${ pdf }[${ page }]`, '-background', 'white', '-alpha', 'remove', '-colorspace', 'gray', png]);
  }
  catch {
    return undefined;
  }

  const dark = Number(magick([png, '-threshold', '60%', '-format', '%[fx:1-mean]', 'info:']));
  if (dark < MIN_DARK) {return 'blank';}

  const text = execFileSync('tesseract', [png, '-'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return NOTICES.find(([re]) => re.test(text))?.[1] ?? null;
};

export const find_cover_page = (pdf: string) => {
  const tmp                                         = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-'));
  const skipped: { page: number, reason: string }[] = [];
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const reason = not_a_cover(pdf, page, tmp);
      if (reason === undefined) {break;}
      if (reason === null) {return { page, skipped };}
      skipped.push({ page: page + 1, reason });
    }
    return { page: 0, skipped, fallback: true };
  }
  finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

export const render_page = (pdf: string, page: number, out: string) => {
  // white background so transparent PDFs don't come out black
  magick([
    '-density', '150', `${ pdf }[${ page }]`,
    '-background', 'white', '-alpha', 'remove',
    '-resize', '600x>', '-quality', '82', out,
  ]);
};
