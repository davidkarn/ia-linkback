import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DB } from './database.module';
import type { Database } from './database';
import { NEXT_UP_STATUS, statusCounts, type QueueStatus } from '../core/queued_books';
import { QueuedBookImportsQueries } from '../model/queued_book_imports';
import { byScore, isGivenToModel, MAX_PROMPT_SCORE } from '../core/footnote_extraction';
import { FootnoteExtractionInsightQueries } from '../model/footnote_extraction_insights';
import { CitationScopes, type CitationMatch } from '../model/citations';
import { DbScopes, withScopes } from '../model/model_utils';

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

// The AdminCitations schema in api.yaml. sourceFootnotePage: the citing page, a pageId of
// sourceBookId. referenceBookTitle: null when the citation isn't matched, or is matched to an id
// that's no book in the collection itself (an alternate id, "bible").
export type AdminCitation = {
  id: string,
  author: string,
  title: string,
  location: string,
  raw: string,
  sourceBookId: string,
  sourceBookTitle: string | null,
  sourceFootnotePage: number,
  referenceBookId: string | null,
  referenceBookTitle: string | null,
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

  // A page of the citations, by author then title: those whose title, author or raw text contains
  // `query`, matched to the book they cite or not; and how many there are in all
  async citations(opts: {
    query: string, match: CitationMatch, offset: number, length: number,
  }): Promise<{ items: AdminCitation[], count: number }> {
    const filtered = () => withScopes(this.db.selectFrom('citations'), [
      CitationScopes.matchingSearch(opts.query),
      CitationScopes.withMatch(opts.match),
    ]);

    const rows = await withScopes(filtered(), [
      CitationScopes.sortedByAuthorAndTitle(),
      DbScopes.offsetAndLimitScope(opts.offset, opts.length),
    ])
      .leftJoin('books as source', 'source.id', 'citations.source_book_id')
      .leftJoin('books as reference', 'reference.id', 'citations.reference_book_id')
      .select([
        'citations.id', 'citations.author', 'citations.title', 'citations.location', 'citations.raw',
        'citations.source_book_id', 'citations.source_footnote_page', 'citations.reference_book_id',
        'source.title as source_title', 'reference.title as reference_title',
      ])
      .execute();

    const total = await filtered()
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();

    return {
      items: rows.map((r) => ({
        id:                 r.id,
        author:             r.author,
        title:              r.title,
        location:           r.location,
        raw:                r.raw,
        sourceBookId:       r.source_book_id,
        sourceBookTitle:    r.source_title ?? null,
        sourceFootnotePage: r.source_footnote_page,
        referenceBookId:    r.reference_book_id,
        referenceBookTitle: r.reference_title ?? null,
      })),
      count: Number(total.count),
    };
  }
}
