// Kysely table types. They mirror migrations/0001_create_book_tables.ts and the shapes in ../types.ts.
import type { ColumnType, Generated } from 'kysely';
import type { CitationLocation, PageBlock } from '../types';
import type { PageInsights } from '../core/page_insights';

export interface BooksTable {
  id: string,
  title: string,
  author: string,
  url: string | null,
  cover_photo_path: string | null,
}

// How a book's pages are cited (migrations/0007_create_book_pages_to_citations.ts)
export interface BookPagesToCitationsTable {
  id: Generated<number>,
  book_id: string,
  page_number: number,
  citation_part_1_type: string,
  citation_part_1_value: string,
  citation_part_2_type: string|null,
  citation_part_2_value: string|null,
  citation_part_3_type: string|null,
  citation_part_3_value: string|null,
  citation_part_4_type: string|null,
  citation_part_4_value: string|null,
  citation_part_5_type: string|null,
  citation_part_5_value: string|null,
  citation_part_6_type: string|null,
  citation_part_6_value: string|null,
  citation_part_7_type: string|null,
  citation_part_7_value: string|null,
  citation_part_8_type: string|null,
  citation_part_8_value: string|null,
}

export interface PagesTable {
  book_id: string,
  page_number: number,
  printed_page_number: string,
}

export interface PageBlocksTable {
  id: Generated<string>,          // bigserial: the pg driver returns int8 as a string
  book_id: string,
  page_number: number,
  position: number,
  bbox_x0: number,
  bbox_y0: number,
  bbox_x1: number,
  bbox_y1: number,
  label: PageBlock['label'],
  html: string,
}

export interface CitationsTable {
  id: Generated<string>,
  page_block_id: string,
  source_book_id: string,
  source_footnote_identifier: string,
  source_footnote_page: number,
  reference_book_id: string | null,
  author: string,
  title: string,
  location: string,
  raw: string,
}

// One group of a citation's locationsCited
export interface CitationGroupsTable {
  id: Generated<string>,
  citation_id: string,
}

// One value of a CitationLocation: raw is its rawLabel
export interface CitationLocationsTable {
  id: Generated<string>,
  citation_id: string,
  citation_group_id: string,
  type: CitationLocation['type'],
  raw: string,
  value: number,
}

export interface QueuedBookImportsTable {
  id: Generated<string>,          // bigserial
  title: string,
  author: string,
  archive_url: string | null,
  pdf_url: string | null,
  status: 'queued' | 'pending' | 'inProgress' | 'processingContents' | 'imported' | 'importedAndCrawled' | 'complete',
  imported_book_id: string | null,
}

// Insights passed to the LLM when extracting citations from footnotes
export interface FootnoteExtractionInsightsTable {
  id: Generated<string>,          // bigserial
  insight: string,
  created_at: Generated<Date>,
}

// The last insights made for a page; insights is written as a JSON string and read back parsed
export interface PageInsightsCacheTable {
  book_id: string,
  page_number: number,
  insights: ColumnType<PageInsights, string, string>,
  created_at: Generated<Date>,
}

export interface Database {
  books: BooksTable,
  pages: PagesTable,
  page_blocks: PageBlocksTable,
  citations: CitationsTable,
  citation_groups: CitationGroupsTable,
  citation_locations: CitationLocationsTable,
  queued_book_imports: QueuedBookImportsTable,
  footnote_extraction_insights: FootnoteExtractionInsightsTable,
  page_insights_cache: PageInsightsCacheTable,
  book_pages_to_citations: BookPagesToCitationsTable,
}
