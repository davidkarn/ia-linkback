import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DB } from './database.module';
import type { Database } from './database';
import {
  buildInsightsMessages, citablePageNumber, contextPageNumbers, groupCitingPages, INSIGHTS_FORMAT,
  toPageInsights, type CitingSource, type InsightsAnswer, type PageInsights,
} from '../core/page_insights';
import {
  findBooks, findCachedInsights, findCitingCitations, findContextPages, findPage, saveCachedInsights,
} from '../model/page_insights';
import { makeOpenRouterRequest, parseJsonResponse } from '../lib/open_router';

// No OPENROUTER_KEY: insights can't be made
export class OpenRouterUnavailable extends Error {}

// The OpenRouter request failed, or its answer couldn't be read
export class OpenRouterFailed extends Error {}

@Injectable()
export class InsightsService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  // What other books say about a page they cite: the cached insights for the page, else new ones
  // (see makeInsights), which are then cached. 'no page' when the book has no such page;
  // 'no citations' when nothing in the collection cites it (not cached: no request is made then).
  async pageInsights(
    bookId: string, pageNumber: number
  ): Promise<PageInsights | 'no page' | 'no citations'> {
    const cached = await findCachedInsights(this.db, bookId, pageNumber);

    if (cached) {
      return cached;
    }
    else {
      const insights = await this.makeInsights(bookId, pageNumber);

      if (typeof insights === 'object') {
        await saveCachedInsights(this.db, insights);
      }
      return insights;
    }
  }

  // Insights summarized by the model from this page and, for each citing page, it and the pages
  // around it
  private async makeInsights(
    bookId: string, pageNumber: number
  ): Promise<PageInsights | 'no page' | 'no citations'> {
    const page          = await findPage(this.db, bookId, pageNumber);
    const printedNumber = page ? citablePageNumber(page.printed_page_number) : null;

    if (!page) {
      return 'no page';
    }
    else {
      // a page without a printed number can still be cited by parts (book, question, article)
      const citingPages = groupCitingPages(
        await findCitingCitations(this.db, bookId, { pageNumber, printedNumber })
      );

      if (!citingPages.length) {
        return 'no citations';
      }
      else if (!process.env.OPENROUTER_KEY) {
        throw new OpenRouterUnavailable('OPENROUTER_KEY is not set');
      }
      else {
        const books   = await findBooks(this.db, [bookId, ...citingPages.map((p) => p.bookId)]);
        const context = await findContextPages(this.db, [
          { bookId, pageNumbers: [pageNumber] },
          ...citingPages.map((p) => ({
            bookId: p.bookId, pageNumbers: contextPageNumbers(p.pageNumber),
          })),
        ]);

        const thisPage                = context.get(bookId, pageNumber)!;
        const sources: CitingSource[] = citingPages.map((p) => ({
          ...p,
          title:             books.get(p.bookId)?.title ?? p.bookId,
          author:            books.get(p.bookId)?.author ?? '',
          printedPageNumber: context.get(p.bookId, p.pageNumber)?.printedPageNumber ?? '',
          context:           contextPageNumbers(p.pageNumber)
            .map((n) => context.get(p.bookId, n))
            .filter((c) => c !== undefined),
        }));

        const book     = books.get(bookId) ?? { title: bookId, author: '' };
        const messages = buildInsightsMessages({ book, page: thisPage, sources });
        const answer   = await makeOpenRouterRequest(messages, INSIGHTS_FORMAT)
          .then((response) => parseJsonResponse<InsightsAnswer>(response))
          .catch((e: Error) => {
            throw new OpenRouterFailed(e.message ?? String(e));
          });

        return toPageInsights({ bookId, page: thisPage, sources, answer });
      }
    }
  }
}
