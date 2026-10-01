import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DB } from './database.module';
import type { Database } from './database';
import { NEXT_UP_STATUS, statusCounts, type QueueStatus } from '../core/queued_books';
import { QueuedBookImportsQueries } from '../model/queued_book_imports';
import { byScore, isGivenToModel, MAX_PROMPT_SCORE } from '../core/footnote_extraction';
import { FootnoteExtractionInsightQueries } from '../model/footnote_extraction_insights';

// How many of the books next up the dashboard lists
const NEXT_UP_COUNT = 10;

// The AdminDashboard schema in api.yaml
export type AdminDashboard = {
  statusCounts: { status: QueueStatus, count: number }[],
  nextUp: {
    id: string,
    title: string,
    author: string,
    archiveUrl: string | null,
    pdfUrl: string | null,
    status: QueueStatus,
  }[],
};

// The CitationInsights schema in api.yaml
export type CitationInsights = {
  maxPromptScore: number,
  insights: { id: string, insight: string, score: number | null, givenToModel: boolean }[],
};

@Injectable()
export class AdminService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  async dashboard(): Promise<AdminDashboard> {
    const counts = await QueuedBookImportsQueries.countByStatus(this.db);
    const next   = await QueuedBookImportsQueries.findNextQueuedBooks(this.db, NEXT_UP_STATUS, NEXT_UP_COUNT);

    return {
      statusCounts: statusCounts(counts),
      nextUp:       next.map((b) => ({
        id:         b.id,
        title:      b.title,
        author:     b.author,
        archiveUrl: b.archive_url,
        pdfUrl:     b.pdf_url,
        status:     b.status,
      })),
    };
  }

  // Every footnote extraction insight with its score, most widely applying first, and whether it's
  // given the model when extracting citations (see core/footnote_extraction.ts)
  async citationInsights(): Promise<CitationInsights> {
    const insights = await FootnoteExtractionInsightQueries.findInsights(this.db);

    return {
      maxPromptScore: MAX_PROMPT_SCORE,
      insights:       byScore(insights).map((i) => ({
        id:           i.id,
        insight:      i.insight,
        score:        i.score,
        givenToModel: isGivenToModel(i.score),
      })),
    };
  }
}
