// Import the next OCR'd books (queued, status inProgress), one after another: each one's pages and
// blocks from its surya results, then the citations in its footnotes, extracted by an LLM a page at
// a time (see core/footnote_extraction.ts), with the insights the model learned doing it. Marks
// each imported, for find-and-queue-cited-books. The saving is done by actions
// (core/ocred_book_import.ts); this reads what they need. Needs OPENROUTER_KEY.
//   npm run cli -- process-ocred-books [count]   (count: how many books, 10 when not given)
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
  FOOTNOTES_FORMAT, footnoteHtml, footnotesPrompt, insightsForPrompt, pageCitations,
  removeDuplicateInsights,
  type PageFootnotes, type ScoredInsight,
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

// Books imported when no count is given
const DEFAULT_COUNT = 10;

// The count argument: a whole number, 1 or more; DEFAULT_COUNT when it isn't given
const countFrom = (raw: string | undefined): number => {
  const count = raw === undefined ? DEFAULT_COUNT : Number(raw);

  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`count must be a whole number, 1 or more, not ${ raw }`);
  }
  else {
    return count;
  }
};

@Command({
  name:        'process-ocred-books',
  arguments:   '[count]',
  description: `Import the next OCR'd books (count, ${ DEFAULT_COUNT } when not given): their pages, `
    + 'and the citations in their footnotes',
})
export class ProcessOcredBooksCommand extends CommandRunner {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {
    super();
  }

  async run([count]: string[]): Promise<void> {
    const books = countFrom(count);

    for (let imported = 0; imported < books; imported++) {
      if (!await this.importNextBook()) {
        console.log(`no more OCR'd books waiting to be imported (imported ${ imported } of ${ books })`);
        break;
      }
    }
  }

  // Import the next book waiting; false when none is
  private async importNextBook(): Promise<boolean> {
    const queued = await QueuedBookImportsQueries.findNextQueuedBook(this.db, 'inProgress');

    if (!queued) {
      return false;
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
        return true;
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

    let insights: ScoredInsight[] = await FootnoteExtractionInsightQueries.findInsights(this.db);

    let operatingInsights = insights.filter((i) => !i.score || i.score <= 1);

    await mapLimited(footnotePages, 1, async(page) => {
      try {
        const response = await makeOpenRouterRequest([
          { role: 'system', content: footnotesPrompt(insightsForPrompt(operatingInsights)) },
          { role: 'user', content: footnoteHtml(page) },
        ], FOOTNOTES_FORMAT, 'openai/gpt-4o-mini');

        const result      = parseJsonResponse<PageFootnotes>(response);
        insights          = removeDuplicateInsights(insights.concat(result.additionalInsights));
        operatingInsights = removeDuplicateInsights(
          operatingInsights.concat(result.additionalInsights.filter((s) => s.score <= 2))
        );
        citations.push(...pageCitations(bookId, page.page, result));
        log(response, 'page ' + page.page + ' of ' + pages.length);
        await setTimeout(REQUEST_INTERVAL_MS);
      }
      catch (e) {
        failedPages.push({ page: page.page, error: (e as Error).message ?? String(e) });
      }
    });

    return { citations, failedPages, insights };
  }
}
