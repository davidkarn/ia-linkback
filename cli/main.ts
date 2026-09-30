// The command line tools (from src/):  npm run cli -- <command> [args]
//   ocr-queued-books               OCR each queued book's PDF with surya
//   process-ocred-books            import the next OCR'd book and its footnotes' citations
//   find-and-queue-cited-books     link the next imported book's citations; queue what it cites
//   consolidate-footnote-insights  merge the footnote extraction insights
//   save-cover <bookId>            save a book's cover image from its PDF
// A book found on archive.org goes through them in that order (see model/queued_book_imports.ts).
// `npm run cli -- --help` lists them; `npm run cli -- <command> --help` describes one.
// DATABASE_URL, OPENROUTER_KEY and SCHOLSHELF_DIR can come from .env.
import 'dotenv/config';
import 'reflect-metadata';
import { CommandFactory } from 'nest-commander';
import { CliModule } from './cli.module.ts';

// Commander ends help, --version and usage errors (an unknown command, a missing argument) with an
// error carrying the exit code, having printed what it has to say already
const isCommanderExit = (error: Error): error is Error & { exitCode: number } => (
  error.name === 'CommanderError'
);

const fail = (error: Error) => {
  if (isCommanderExit(error)) {
    process.exit(error.exitCode);
  }
  else {
    console.error(error);
    process.exit(1);
  }
};

const main = async() => {
  await CommandFactory.run(CliModule, {
    logger:              ['warn', 'error'],
    errorHandler:        fail,
    serviceErrorHandler: fail,
  });
};

main();
