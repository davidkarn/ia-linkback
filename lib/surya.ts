// OCR'ing a queued book's PDF with surya (https://github.com/VikParuchuri/surya), for
// process-ocred-books to import. Results go to SURYA_RESULTS_DIR/<ocrFolderName>/results.json.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SURYA_RESULTS_DIR, ocrFolderName, pdfPath, suryaResultsPath } from '../core/book_files.ts';

// SURYA_OCR_BIN, else surya's pipx install, else surya_ocr on the PATH
const SURYA_DEFAULT = path.join(os.homedir(), '.local/bin/surya_ocr');

const suryaCommand = async() => (
  process.env.SURYA_OCR_BIN
    ?? await fs.access(SURYA_DEFAULT).then(() => SURYA_DEFAULT, () => 'surya_ocr')
);

// Whether file holds complete OCR results (a run that died part way leaves none, or invalid JSON)
const hasValidResults = async(file: string) => {
  try {
    const results = JSON.parse(await fs.readFile(file, 'utf8'));
    return Object.values(results).some((pages) => Array.isArray(pages) && pages.length > 0);
  }
  catch {
    return false;
  }
};

// Run command, showing its output; resolves when it exits 0
const run = (command: string, args: string[]) => new Promise<void>((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  child.on('error', reject);
  child.on('exit', (code, signal) => (
    code === 0 ? resolve() : reject(new Error(`${ command } exited with ${ signal ?? code }`))
  ));
});

// OCR the downloaded PDF at pdfUrl, unless it has valid results already. Returns the results'
// path. Throws if the PDF isn't downloaded yet or surya fails. surya is left running
// (--keep_server), so the next book doesn't wait ~1-2 minutes for the model to load.
export const ocrWithSurya = async(pdfUrl: string): Promise<string> => {
  const pdf     = pdfPath(pdfUrl);
  const results = suryaResultsPath(pdfUrl);

  if (await hasValidResults(results)) {
    return results;
  }
  else if (!await fs.access(pdf).then(() => true, () => false)) {
    throw new Error(`PDF not downloaded yet: ${ pdf }`);
  }
  else {
    // surya names its output folder after the input file's name up to the first ".": give it a
    // link named after ocrFolderName, which has none
    const tmp  = await fs.mkdtemp(path.join(os.tmpdir(), 'surya-'));
    const link = path.join(tmp, ocrFolderName(pdfUrl) + '.pdf');
    try {
      await fs.symlink(path.resolve(pdf), link);
      await run(await suryaCommand(), [
        link, '--output_dir', path.resolve(SURYA_RESULTS_DIR), '--keep_server',
      ]);
    }
    finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }

    if (!await hasValidResults(results)) {
      throw new Error(`surya finished but left no valid results at ${ results }`);
    }
    else {
      return results;
    }
  }
};
