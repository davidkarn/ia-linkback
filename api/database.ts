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
  translator: string | null,      // who translated it, for a book read in translation
}

// How a book's pages are cited (migrations/0007_create_book_pages_to_citations.ts)
export interface BookPagesToCitationsTable {
  id: Generated<number>,
  book_id: string,
  page_number: number,
  citation_part_1_type: string,
  citation_part_1_value: number,
  citation_part_2_type: string|null,
  citation_part_2_value: number|null,
  citation_part_3_type: string|null,
  citation_part_3_value: number|null,
  citation_part_4_type: string|null,
  citation_part_4_value: number|null,
  citation_part_5_type: string|null,
  citation_part_5_value: number|null,
  citation_part_6_type: string|null,
  citation_part_6_value: number|null,
  citation_part_7_type: string|null,
  citation_part_7_value: number|null,
  citation_part_8_type: string|null,
  citation_part_8_value: number|null,
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

// One place a citation cites (see core/citation_groups.ts): up to 8 parts, in the order the citation
// gives them (chapter 1, verse 2), and the raw label of the locations it came from ("ch. 1, vv.
// 2-4", shared by the rows of a range)
export interface CitationGroupsTable {
  id: Generated<string>,
  citation_id: string,
  raw: string,
  part1_type: CitationLocation['type'],
  part1_value: number,
  part2_type: CitationLocation['type']|null,
  part2_value: number|null,
  part3_type: CitationLocation['type']|null,
  part3_value: number|null,
  part4_type: CitationLocation['type']|null,
  part4_value: number|null,
  part5_type: CitationLocation['type']|null,
  part5_value: number|null,
  part6_type: CitationLocation['type']|null,
  part6_value: number|null,
  part7_type: CitationLocation['type']|null,
  part7_value: number|null,
  part8_type: CitationLocation['type']|null,
  part8_value: number|null,
}

export interface QueuedBookImportsTable {
  id: Generated<string>,          // bigserial
  title: string,
  author: string,
  archive_url: string | null,
  pdf_url: string | null,
  status: 'queued' | 'pending' | 'inProgress' | 'processingContents' | 'imported' | 'importedAndCrawled' | 'complete',
  imported_book_id: string | null,
  created_at: Generated<Date>,
  updated_at: Generated<Date>,    // kept by a trigger: any update sets it
}

// Insights passed to the LLM when extracting citations from footnotes
export interface FootnoteExtractionInsightsTable {
  id: Generated<string>,          // bigserial
  insight: string,
  // 1 (seen in a wide number of texts) to 5 (very obscure); null until scored
  score: number | null,
  created_at: Generated<Date>,
}

// The last insights made for a page; insights is written as a JSON string and read back parsed
export interface PageInsightsCacheTable {
  book_id: string,
  page_number: number,
  insights: ColumnType<PageInsights, string, string>,
  created_at: Generated<Date>,
}

// Another id a book goes by: citations pointing at alternate_id count as citations of book_id
export interface AlternateIdsTable {
  book_id: string,
  alternate_id: string,
}

// How likely a book is to be in the public domain, as an LLM judged it (see
// core/copyright_status.ts), with notes on why. A book can have several checks.
export interface CopyrightStatusCheckTable {
  id: Generated<string>,          // bigserial
  book_id: string,
  copyright_status: 'likely_public_domain' | 'probably_public_domain' | 'doubtful_public_domain'
    | 'likely_copyrighted',
  notes: Generated<string>,
  created_at: Generated<Date>,
  updated_at: Generated<Date>,    // kept by a trigger: any update sets it
}

export interface Database {
  books: BooksTable,
  pages: PagesTable,
  page_blocks: PageBlocksTable,
  citations: CitationsTable,
  citation_groups: CitationGroupsTable,
  queued_book_imports: QueuedBookImportsTable,
  footnote_extraction_insights: FootnoteExtractionInsightsTable,
  page_insights_cache: PageInsightsCacheTable,
  book_pages_to_citations: BookPagesToCitationsTable,
  alternate_ids: AlternateIdsTable,
  copyright_status_check: CopyrightStatusCheckTable,
}
