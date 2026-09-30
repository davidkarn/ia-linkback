// Import the next OCR'd book (queued, status inProgress): its pages and blocks from its surya
// results, then the citations in its footnotes, extracted by an LLM a page at a time (see
// core/footnote_extraction.ts), with the insights the model learned doing it. Marks it imported,
// for find-and-queue-cited-books. Needs OPENROUTER_KEY.
//   npm run cli -- process-ocred-books
import { Inject } from '@nestjs/common';
import fs from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import type { Kysely } from 'kysely';
import { Command, CommandRunner } from 'nest-commander';
import { DB } from '../../api/database.module.ts';
import type { Database } from '../../api/database.ts';
import { build_pages } from '../../core/book_pages.ts';
import { suryaResultsPath } from '../../core/book_files.ts';
import {
  FOOTNOTES_FORMAT, footnoteBlockFor, footnoteHtml, footnotesPrompt, pageCitations,
  removeDuplicateInsights, type PageFootnotes,
} from '../../core/footnote_extraction.ts';
import { arrayToMapOfRecords, log, mapLimited } from '../../lib/lib.ts';
import { makeOpenRouterRequest, parseJsonResponse } from '../../lib/open_router.ts';
import { BookActions } from '../../model/books.ts';
import { findFootnoteBlocks, replaceExtractedCitations } from '../../model/extracted_citations.ts';
import { findInsights } from '../../model/footnote_extraction_insights.ts';
import {
  findNextQueuedBook, markQueuedBookImported, setQueuedBookStatus, type QueuedBook,
} from '../../model/queued_book_imports.ts';
import type { Citation, SuryaBook } from '../../types.ts';

// OpenRouter allows 20 requests a minute
const REQUEST_INTERVAL_MS = 3200;

@Command({
  name:        'process-ocred-books',
  description: 'Import the next OCR\'d book: its pages, and the citations in its footnotes',
})
export class ProcessOcredBooksCommand extends CommandRunner {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {
    super();
  }

  async run(): Promise<void> {
    const book = await findNextQueuedBook(this.db, 'inProgress');

    if (!book) {
      console.log("no OCR'd book waiting to be imported");
    }
    else {
      console.log(`${ book.id }: importing ${ book.title }`);
      log(await this.importBook(book));
    }
  }

  private async importBook(queued: QueuedBook) {
    if (!queued.pdf_url) {
      throw new Error(`queued book ${ queued.id } has no pdf_url`);
    }
    else {
      await setQueuedBookStatus(this.db, queued.id, 'processingContents');

      const surya: SuryaBook     = JSON.parse(await fs.readFile(suryaResultsPath(queued.pdf_url), 'utf8'));
      const [bookId, suryaPages] = Object.entries(surya)[0] ?? [];
      if (!bookId || !suryaPages) {
        throw new Error(`surya results for queued book ${ queued.id } have no pages`);
      }
      else {
        // the book's id is the OCR folder name, surya's key for it
        await BookActions.saveBook(
          this.db,
          { id: bookId, title: queued.title, author: queued.author, url: queued.archive_url },
          build_pages(suryaPages).pages,
        );

        const extracted = await this.extractCitations(bookId, surya);
        const saved     = await this.saveCitations(bookId, extracted);

        await markQueuedBookImported(this.db, queued.id, bookId);
        return { bookId, ...saved };
      }
    }
  }

  // Every citation in the book's footnotes, a request per page with Footnote blocks, each page's
  // request given the insights learned so far. Pages whose request fails are returned in
  // failedPages rather than failing the whole book.
  private async extractCitations(bookId: string, surya: SuryaBook) {
    const pages                                          = Object.values(surya)[0] ?? [];
    const footnotePages                                  = pages.filter((p) => p.blocks.some((b) => b.label === 'Footnote'));
    const citations: Citation[]                          = [];
    const failedPages: { page: number, error: string }[] = [];
    let insights                                         = (await findInsights(this.db)).map((i) => i.insight);

    await mapLimited(footnotePages, 1, async(page) => {
      try {
        const response = await makeOpenRouterRequest([
          { role: 'system', content: footnotesPrompt(insights) },
          { role: 'user', content: footnoteHtml(page) },
        ], FOOTNOTES_FORMAT);
        log(response);

        const result = parseJsonResponse<PageFootnotes>(response);
        insights     = removeDuplicateInsights(insights.concat(result.additionalInsights));
        citations.push(...pageCitations(bookId, page.page, result));

        await setTimeout(REQUEST_INTERVAL_MS);
      }
      catch (e) {
        failedPages.push({ page: page.page, error: (e as Error).message ?? String(e) });
      }
    });

    return { citations, failedPages, insights };
  }

  // The citations saved, each in its Footnote block; those whose page has no block with their
  // marker are reported rather than saved
  private async saveCitations(
    bookId: string, extracted: Awaited<ReturnType<ProcessOcredBooksCommand['extractCitations']>>
  ) {
    for (const failed of extracted.failedPages) {
      console.log(`${ bookId }: page ${ failed.page } failed: ${ failed.error }`);
    }

    const blocksByPage = arrayToMapOfRecords(await findFootnoteBlocks(this.db, bookId), 'page_number');
    const placed       = extracted.citations.map((citation) => ({
      citation,
      block: footnoteBlockFor(
        blocksByPage.get(citation.source.footnotePage) ?? [], citation.source.footnoteIdentifier
      ),
    }));
    const unplaced     = placed.filter((p) => p.block === undefined);

    const counts = await replaceExtractedCitations(
      this.db,
      bookId,
      placed.flatMap((p) => (p.block === undefined ? [] : [{ blockId: p.block.id, citation: p.citation }])),
      extracted.insights,
    );

    for (const { citation: c } of unplaced) {
      console.log(`${ bookId }: page ${ c.source.footnotePage } has no Footnote block `
        + `for "${ c.raw.slice(0, 60) }"`);
    }

    return { ...counts, unplaced: unplaced.length, failedPages: extracted.failedPages.length };
  }
}
