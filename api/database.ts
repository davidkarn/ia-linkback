// Kysely table types. They mirror migrations/0001_create_book_tables.ts and the shapes in ../types.ts.
import type { Generated } from 'kysely';
import type { CitationLocation, PageBlock } from '../types';

export interface BooksTable {
  id: string,
  title: string,
  author: string,
  url: string | null,
  cover_photo_path: string | null,
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

export interface CitationLocationsTable {
  id: Generated<string>,
  citation_id: string,
  type: CitationLocation['type'],
  value: number,
}

export interface QueuedBookImportsTable {
  id: Generated<string>,          // bigserial
  title: string,
  author: string,
  archive_url: string | null,
  pdf_url: string | null,
  status: 'queued' | 'pending' | 'inProgress' | 'imported',
  imported_book_id: string | null,
}

export interface Database {
  books: BooksTable,
  pages: PagesTable,
  page_blocks: PageBlocksTable,
  citations: CitationsTable,
  citation_locations: CitationLocationsTable,
  queued_book_imports: QueuedBookImportsTable,
}
