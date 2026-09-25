// Where each book's scanned PDF is: ../scholshelf/<book id>.pdf, except where the OCR folder name (the
// book id) isn't the PDF's stem. Shared by extract_footnotes.ts and extract_covers.ts.
import fs from 'node:fs';

export const PDF_DIR = '../scholshelf';

export const list_pdfs = (): string[] => fs.existsSync(PDF_DIR) ? fs.readdirSync(PDF_DIR).filter(f => f.endsWith('.pdf')) : [];

// Folder names are PDF stems, truncated at the first "." for the numbered "2015.*" files.
const PDF_OVERRIDES: Record<string, string> = { '2015': '2015.932.Types-Of-Philosophy-1929.pdf' }; // 549 pages, "Types of Philosophy" (Hocking)
export const pdf_for_book = (book: string, pdfs: string[]): string | null => {
  if (PDF_OVERRIDES[book]) return PDF_OVERRIDES[book];
  return pdfs.find(p => p === book + '.pdf') ?? null;
};
