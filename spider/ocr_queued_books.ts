import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Selectable } from 'kysely';
import dotenv from 'dotenv';
import type { Database, QueuedBookImportsTable } from '../api/database.js';
import { SURYA_RESULTS_DIR, ocrFolderName, pdfPath, suryaResultsPath } from '../core/book_files.ts';

dotenv.config();

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL
    })
  }),
});

const getNextBook = () => (
  db.selectFrom('queued_book_imports')
    .selectAll()
    .where('status', '=', 'queued')
    .orderBy('id')
    .limit(1)
    .executeTakeFirst()
);

// SURYA_OCR_BIN, else surya's pipx install, else surya_ocr on the PATH (as ocr_queued.sh finds it)
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

// run surya on the downloaded pdf file. Results go to SURYA_RESULTS_DIR/<ocrFolderName>/results.json, where
// process_ocred_books.ts reads them; a book with valid results there already isn't OCR'd again. Throws if the
// PDF isn't downloaded yet or surya fails. surya is left running (--keep_server), so the next book doesn't wait
// ~1-2 minutes for the model to load.
const ocrWithSurya = async(nextBook: Selectable<QueuedBookImportsTable>): Promise<string> => {
  if (!nextBook.pdf_url) {
    throw new Error(`queued book ${ nextBook.id } has no pdf_url`);
  }
  else {
    const pdf     = pdfPath(nextBook.pdf_url);
    const results = suryaResultsPath(nextBook.pdf_url);

    if (await hasValidResults(results)) {
      return results;
    }
    else if (!await fs.access(pdf).then(() => true, () => false)) {
      throw new Error(`PDF not downloaded yet: ${ pdf }`);
    }
    else {
      // surya names its output folder after the input file's name up to the first ".": give it a link named
      // after ocrFolderName, which has none
      const tmp  = await fs.mkdtemp(path.join(os.tmpdir(), 'surya-'));
      const link = path.join(tmp, ocrFolderName(nextBook.pdf_url) + '.pdf');
      try {
        await fs.symlink(path.resolve(pdf), link);
        await run(await suryaCommand(), [link, '--output_dir', path.resolve(SURYA_RESULTS_DIR), '--keep_server']);
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
  }
};

// set the queued books state to 'inProgress' to queue up for process_ocred_books.ts
const markQueuedBookAsInProgress = async(nextBook: Selectable<QueuedBookImportsTable>) => {
  await db.updateTable('queued_book_imports')
    .set({ status: 'inProgress' })
    .where('id', '=', nextBook.id)
    .execute();
};

const main = async() => {
  while (true) {
    const nextBook = await getNextBook();

    if (!nextBook) {
      return;
    }
    else {
      await ocrWithSurya(nextBook);
      await markQueuedBookAsInProgress(nextBook);
    }
  }
};

main();

