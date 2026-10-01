// Import the next OCR'd book (queued, status inProgress): its pages and blocks from its surya
// results, then the citations in its footnotes, extracted by an LLM a page at a time (see
// core/footnote_extraction.ts), with the insights the model learned doing it. Marks it imported,
// for find-and-queue-cited-books. The saving is done by actions (core/ocred_book_import.ts); this
// reads what they need. Needs OPENROUTER_KEY.
//   npm run cli -- process-ocred-books
import { Inject } from '@nestjs/common';
import fs from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import type { Kysely } from 'kysely';
import { Command, CommandRunner } from 'nest-commander';
import { executeActions } from '../../actions/app_actions.ts';
import { DB } from '../../api/database.module.ts';
import type { Database } from '../../api/database.ts';
import { build_pages } from '../../core/book_pages.ts';
import { suryaResultsPath } from '../../core/book_files.ts';
import {
  FOOTNOTES_FORMAT, footnoteHtml, footnotesPrompt, pageCitations, removeDuplicateInsights,
  type PageFootnotes,
} from '../../core/footnote_extraction.ts';
import {
  importOcredBookActions, startImportActions, type ExtractedCitations,
} from '../../core/ocred_book_import.ts';
import { log, mapLimited } from '../../lib/lib.ts';
import { makeOpenRouterRequest, parseJsonResponse } from '../../lib/open_router.ts';
import { FootnoteExtractionInsightQueries } from '../../model/footnote_extraction_insights.ts';
import { QueuedBookImportsQueries } from '../../model/queued_book_imports.ts';
import type { Citation, SuryaBook, SuryaPage } from '../../types.ts';

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
    const queued = await QueuedBookImportsQueries.findNextQueuedBook(this.db, 'inProgress');

    if (!queued) {
      console.log("no OCR'd book waiting to be imported");
    }
    else if (!queued.pdf_url) {
      throw new Error(`queued book ${ queued.id } has no pdf_url`);
    }
    else {
      console.log(`${ queued.id }: importing ${ queued.title }`);
      await executeActions(this.db, startImportActions(queued));

      const surya: SuryaBook     = JSON.parse(await fs.readFile(suryaResultsPath(queued.pdf_url), 'utf8'));
      const [bookId, suryaPages] = Object.entries(surya)[0] ?? [];

      if (!bookId || !suryaPages) {
        throw new Error(`surya results for queued book ${ queued.id } have no pages`);
      }
      else {
        // the book's id is the OCR folder name, surya's key for it
        const pages     = build_pages(suryaPages).pages;
        const extracted = await this.extractCitations(bookId, suryaPages);

        await executeActions(this.db, importOcredBookActions(queued, bookId, pages, extracted));
      }
    }
  }

  // Every citation in the book's footnotes, a request per page with Footnote blocks, each page's
  // request given the insights learned so far. Pages whose request fails are returned in
  // failedPages rather than failing the whole book.
  private async extractCitations(
    bookId: string, pages: SuryaPage[]
  ): Promise<ExtractedCitations> {
    const footnotePages                                  = pages.filter((p) => p.blocks.some((b) => b.label === 'Footnote'));
    const citations: Citation[]                          = [];
    const failedPages: { page: number, error: string }[] = [];
    let insights                                         = (await FootnoteExtractionInsightQueries.findInsights(this.db))
      .map((i) => i.insight);

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
}
