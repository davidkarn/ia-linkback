// Where a queued book's files live: its PDF in ../scholshelf/ (as downloaded by the find-and-queue-cited-books
// command and link_citations.ts) and its surya OCR results in ../scholshelf/results/surya/<folder>/results.json.
// SCHOLSHELF_DIR overrides ../scholshelf, e.g. for testing.
import fs from 'node:fs/promises';
import path from 'node:path';

export const SCHOLSHELF = process.env.SCHOLSHELF_DIR ?? '../scholshelf';
export const SURYA_RESULTS_DIR = path.join(SCHOLSHELF, 'results', 'surya');

// The PDF's file name: the last part of pdf_url, as is (still URL-encoded), as surya's output folder is named after it (see lib/surya.ts)
export const pdfFileName = (pdfUrl: string) => (
  new URL(pdfUrl).pathname.split('/').pop() ?? ''
);

export const pdfPath = (pdfUrl: string) => path.join(SCHOLSHELF, pdfFileName(pdfUrl));

// The OCR results folder, which is also the book's id: the file name without ".pdf", with any other "." made
// "_". surya names its folder after the input's name up to the first ".", so books like
// "2015.932.Types-Of-Philosophy-1929.pdf" are OCR'd through a link with this dot-free name (see ocrWithSurya)
// instead of all writing to results/surya/2015/.
export const ocrFolderName = (pdfUrl: string) => folderForFile(pdfFileName(pdfUrl));

const folderForFile = (fileName: string) => fileName.replace(/\.pdf$/i, '').replace(/\./g, '_');

export const suryaResultsPath = (pdfUrl: string) => (
  path.join(SURYA_RESULTS_DIR, ocrFolderName(pdfUrl), 'results.json')
);

// The PDF in SCHOLSHELF whose OCR folder name (and so book id) is bookId, or undefined if there is none
export const pdfForBookId = async(bookId: string) => {
  const files = await fs.readdir(SCHOLSHELF);
  const file  = files.find((f) => /\.pdf$/i.test(f) && folderForFile(f) === bookId);
  return file ? path.join(SCHOLSHELF, file) : undefined;
};
