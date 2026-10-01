// For the next imported book (queued, status imported): point its citations at the books in the
// collection they cite, and look for the other cited works on archive.org, downloading and queueing
// those found for OCR. Marks it importedAndCrawled. See core/cited_books.ts.
//   npm run cli -- find-and-queue-cited-books
import { Inject } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Command, CommandRunner } from 'nest-commander';
import { DB } from '../../api/database.module.ts';
import type { Database } from '../../api/database.ts';
import { citedTitle, citationShouldBeSkipped } from '../../core/citation_matching.ts';
import { actionsForArchivePlan, matchCitedBooks, planArchiveQueue, type ArchiveCopy } from '../../core/cited_books.ts';
import { searchArchive } from '../../lib/archive_search.ts';
import { log } from '../../lib/lib.ts';
import { BookQueries } from '../../model/books.ts';
import { findCitationsInBook, linkCitations } from '../../model/incoming_citations.ts';
import {
  QueuedBookImportsActions, QueuedBookImportsQueries,
} from '../../model/queued_book_imports.ts';
import { executeActions } from '../../actions/app_actions.ts';

// After this many archive.org searches fail in a row, the rest aren't tried
const MAX_CONSECUTIVE_ARCHIVE_ERRORS = 5;

type CitationRow = Awaited<ReturnType<typeof findCitationsInBook>>[number];

@Command({
  name:        'find-and-queue-cited-books',
  description: "Link the next imported book's citations, and queue the works it cites from archive.org",
})
export class FindAndQueueCitedBooksCommand extends CommandRunner {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {
    super();
  }

  async run(): Promise<void> {
    const book = await QueuedBookImportsQueries.findNextQueuedBook(this.db, 'imported');

    if (!book) {
      console.log('no imported book waiting to be crawled');
    }
    else if (!book.imported_book_id) {
      throw new Error(`queued book ${ book.id } is imported but has no imported_book_id`);
    }
    else {
      const bookId = book.imported_book_id;
      console.log(`${ book.id }: crawling the citations of ${ bookId }`);

      const { referencing, notReferencing } = matchCitedBooks(
        await findCitationsInBook(this.db, bookId),
        await BookQueries.findOtherBookNames(this.db, bookId),
        await QueuedBookImportsQueries.findQueuedBookNames(this.db),
      );

      const archiveCopies = await this.findArchiveCopies(notReferencing);
      const numRefsSaved  = await linkCitations(this.db, referencing);
      const queuedResults = await this.queueArchiveCopies(archiveCopies.found);

      await QueuedBookImportsActions.setQueuedBookStatus(this.db, book.id, 'importedAndCrawled');

      log({ numRefsSaved, queuedResults, archiveSearchFailures: archiveCopies.failed.length });
    }
  }

  // A copy on archive.org of each work cited that has one
  private async findArchiveCopies(citations: CitationRow[]) {
    const found: ArchiveCopy[]                               = [];
    const failed: { citation: CitationRow, error: string }[] = [];
    let consecutiveErrors                                    = 0;

    for (const citation of citations.filter((c) => !citationShouldBeSkipped(c.author, c.title))) {
      if (consecutiveErrors >= MAX_CONSECUTIVE_ARCHIVE_ERRORS) {
        failed.push({ citation, error: 'not searched: archive.org unreachable' });
      }
      else {
        try {
          const hit = await searchArchive(
            citation.author,
            citedTitle(citation.title) || citation.title
          );

          consecutiveErrors = 0;

          if (hit) {
            found.push({
              archiveUrl: 'https://archive.org/details/' + hit.identifier,
              pdfUrl:     hit.pdf,
              title:      hit.title || citation.title,
              author:     hit.creator || citation.author,
            });
          }
        }
        catch (e) {
          consecutiveErrors++;
          failed.push({ citation, error: (e as Error).message ?? String(e) });
        }
      }
    }

    return { found, failed };
  }

  // Download the copies not queued or imported already to the scholshelf folder, and queue them
  private async queueArchiveCopies(copies: ArchiveCopy[]) {
    const plan    = planArchiveQueue(copies, await QueuedBookImportsQueries.findQueuedUrls(this.db), await BookQueries.findBookIds(this.db));
    const actions = actionsForArchivePlan(plan);
    const result  = await executeActions(this.db, actions);

    return result;
  }
}
