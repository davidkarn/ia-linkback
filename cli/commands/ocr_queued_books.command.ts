// OCR every queued book's downloaded PDF with surya, one after another, marking each inProgress for
// process-ocred-books to import. Stops at the first book surya fails on.
//   npm run cli -- ocr-queued-books
import { Inject } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Command, CommandRunner } from 'nest-commander';
import { DB } from '../../api/database.module.ts';
import type { Database } from '../../api/database.ts';
import { ocrWithSurya } from '../../lib/surya.ts';
import { findNextQueuedBook, setQueuedBookStatus } from '../../model/queued_book_imports.ts';

@Command({
  name:        'ocr-queued-books',
  description: "OCR each queued book's PDF with surya, marking it inProgress for process-ocred-books",
})
export class OcrQueuedBooksCommand extends CommandRunner {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {
    super();
  }

  async run(): Promise<void> {
    for (let book = await findNextQueuedBook(this.db, 'queued'); book;
      book = await findNextQueuedBook(this.db, 'queued')) {
      if (!book.pdf_url) {
        throw new Error(`queued book ${ book.id } has no pdf_url`);
      }
      else {
        console.log(`${ book.id }: OCR'ing ${ book.title }`);
        await ocrWithSurya(book.pdf_url);
        await setQueuedBookStatus(this.db, book.id, 'inProgress');
      }
    }

    console.log('no more books queued for OCR');
  }
}
