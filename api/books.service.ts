import { Inject, Injectable } from '@nestjs/common';
import type { ExpressionBuilder, Kysely } from 'kysely';
import { DB } from './database.module';
import type { Database } from './database';
import { citation_columns, to_citation_dto, type CitationDto } from './citations.service';
import { citablePageNumber } from '../core/page_insights';
import { citationsOfPage, citedCountsByPage } from '../model/page_insights';
import { findCitedPages } from '../model/book_pages_to_citations';
import { contentsOf, type ContentsEntry } from '../core/contents';
import { contentsOfVolume, selectVolume, volumesOf } from '../core/volumes';
import { BookScopes, BookSelectors } from '../model/books.js';
import { DbScopes, withScopes } from '../model/model_utils.js';

export type BookSummary = { id: string, title: string, author: string, url?: string, coverPhotoPath?: string, pageCount: number, citedByCount: number };
// citedByCount: citations in other books that cite this page (the foreignCitations of GET /books/{id}/pages/{id})
export type PageOrderEntry = { pageId: number, printedPageNumber: string, citedByCount: number };
// One of a book's volumes (see core/volumes.ts), without its pages
export type VolumeSummary = {
  volume: number,
  partType: string,
  partValue: string,
  firstPageId: number,
  lastPageId: number,
  pageCount: number,
};
export type BookForApi = BookSummary & {
  volume: number,
  volumes: VolumeSummary[],
  pageOrder: PageOrderEntry[],
  contents: ContentsEntry[],
};

export type PageCitationDto = CitationDto & { sourcePageText: string };

export type BookPageForApi = {
  bookId: string,
  pageNumber: number,
  printedPageNumber: string,
  blocks: { label: string, html: string, citations: PageCitationDto[] }[],
  foreignCitations: PageCitationDto[],
};

type SourceBlock = { id: string, label: string, html: string };

// The footnote marker a paragraph starts with ("<p><sup>18</sup> ...", "<p>18 ...", "<p>1) ...", "<p>* ..."),
// without trailing ")" or "."; null for a paragraph that continues the footnote before it
const paragraph_marker = (p: string): string | null => {
  const m      = p.match(/^\s*<p>\s*(?:<sup>\s*([^<]+?)\s*<\/sup>|(\d{1,3}\)?|[*†‡])\s)/i);
  const marker = m?.[1] ?? m?.[2];
  
  return marker === undefined ? null : marker.trim().replace(/[).]+$/, '');
};

// The paragraphs of a citation's footnote among its page's Footnote blocks: from the paragraph in the
// citation's block whose marker is its identifier (or, for a footnote continued from the previous page, with
// no identifier, from the block's first paragraph) through the unmarked paragraphs after it, which can run on
// into later blocks, up to the next marked footnote. If no paragraph matches, the citation's whole block.
// Returns the kept paragraphs' HTML per block id.
const footnote_paragraphs = (footnoteBlocks: SourceBlock[], blockId: string, identifier: string) => {
  const paragraphs = footnoteBlocks.flatMap((b) => (
    b.html.split(/(?=<p[\s>])/i).filter((p) => p.trim()).map((html) => ({ blockId: b.id, html, marker: paragraph_marker(html) }))
  ));
  const wanted     = identifier.trim().replace(/[).]+$/, '');

  let start = paragraphs.findIndex((p) => p.blockId === blockId && (wanted ? p.marker === wanted : true));
  if (start >= 0 && !wanted && paragraphs[start]!.marker !== null) {
    start = -1;   // no identifier, but the block starts a new footnote: can't tell which
  }

  const kept = new Map<string, string[]>();
  if (start < 0) {
    const block = footnoteBlocks.find((b) => b.id === blockId);
    if (block) {kept.set(block.id, [block.html]);}
    return kept;
  }
  for (let i = start; i < paragraphs.length && (i === start || paragraphs[i]!.marker === null); i++) {
    const p = paragraphs[i]!;
    kept.set(p.blockId, [...(kept.get(p.blockId) ?? []), p.html]);
  }
  return kept;
};

// sourcePageText: the HTML of the page a citation's footnote is on, one block per line in reading order,
// without running headers and footers, and with only the citation's own footnote of the page's footnotes
const citation_page_html = (blocks: SourceBlock[], blockId: string, identifier: string) => {
  const footnote = footnote_paragraphs(blocks.filter((b) => b.label === 'Footnote'), blockId, identifier);

  return blocks
    .flatMap((b) => (
      b.label === 'PageHeader' || b.label === 'PageFooter' ? []
        : b.label === 'Footnote' ? (footnote.has(b.id) ? [footnote.get(b.id)!.join('').trim()] : [])
          : [b.html]
    ))
    .join('\n');
};

const page_key = (bookId: string, pageNumber: number) => bookId + '\u0000' + pageNumber;

@Injectable()
export class BooksService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  async search(opts: {
    offset: number,
    length: number,
    query?: string | undefined }
  ): Promise<{ items: BookSummary[], count: number }> {
      const rows = await withScopes(
        this.db.selectFrom('books'), [
          BookScopes.scopedToQuery(opts.query),
          DbScopes.offsetAndLimitScope(opts.offset, opts.length),
          BookScopes.sortedForDisplay()
        ])
        .select((eb) => [
          'books.id',
          'books.title',
          'books.author',
          'books.url',
          'books.cover_photo_path',
          BookSelectors.pageCount,
          BookSelectors.citedByCount(eb),
        ])
      .execute();

    const total = await withScopes(
        this.db.selectFrom('books'), [
          BookScopes.scopedToQuery(opts.query)
        ])
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();

    return {
      items: rows.map((r) => ({
        id:             r.id,
        title:          r.title,
        author:         r.author,
        url:            r.url ?? null,
        coverPhotoPath: r.cover_photo_path ?? null,
        pageCount:      Number(r.page_count ?? 0),
        citedByCount:   Number(r.cited_by_count ?? 0),
      })),
      count: Number(total.count),
    };
  }

  // A book opened to one of its volumes: `volume`, else the first holding `pageId`, else volume 1
  // (see core/volumes.ts). pageOrder and contents hold only that volume's pages. null when there
  // is no such book or volume.
  async get(
    bookId: string, opts: { volume?: number | undefined, pageId?: number | undefined } = {}
  ): Promise<BookForApi | null> {
    const book = await this.db
      .selectFrom('books')
      .select((eb) => [
        'books.id', 'books.title', 'books.author', 'books.url', 'books.cover_photo_path',
        BookSelectors.citedByCount(eb),
      ])
      .where('books.id', '=', bookId)
      .executeTakeFirst();

    if (!book) {
      return null;
    }
    else {
      const pages = await this.db
        .selectFrom('pages')
        .select(['pages.page_number', 'pages.printed_page_number'])
        .where('pages.book_id', '=', bookId)
        .orderBy('pages.page_number')
        .execute();

      // the parts by which the book's pages are cited ([] for books cited by page number), which
      // divide it into volumes and make its table of contents
      const citedPages = await findCitedPages(this.db, bookId);
      const volumes    = volumesOf(pages.map((p) => p.page_number), citedPages);
      const volume     = selectVolume(volumes, opts);

      if (volume === null) {
        return null;
      }
      else {
        // citations of each page, as getPage finds them: by printed page number, or by the parts
        // of one of the page's book_pages_to_citations rows
        const citedBy = await citedCountsByPage(this.db, bookId);
        const opened  = volumes[volume - 1];
        const inOpen  = opened === undefined ? null : new Set(opened.pageIds);

        return {
          id:           book.id,
          title:        book.title,
          author:       book.author,
          ...(book.url ? { url: book.url } : {}),
          ...(book.cover_photo_path ? { coverPhotoPath: book.cover_photo_path } : {}),
          pageCount:    pages.length,
          citedByCount: Number(book.cited_by_count ?? 0),
          volume,
          volumes:      volumes.map((v) => ({
            volume:      v.number,
            partType:    v.partType,
            partValue:   String(v.partValue),
            firstPageId: v.pageIds[0]!,
            lastPageId:  v.pageIds[v.pageIds.length - 1]!,
            pageCount:   v.pageIds.length,
          })),
          pageOrder:    pages
            .filter((p) => inOpen === null || inOpen.has(p.page_number))
            .map((p) => ({
              pageId:            p.page_number,
              printedPageNumber: p.printed_page_number,
              citedByCount:      citedBy.get(p.page_number) ?? 0,
            })),
          contents:     contentsOfVolume(contentsOf(citedPages), opened),
        };
      }
    }
  }

  // One page of a book: its blocks with the citations in their footnotes, and the citations in other
  // books that point at this page by its printed page number. null when there is no such page.
  async getPage(bookId: string, pageNumber: number): Promise<BookPageForApi | null> {
    const page = await this.db
      .selectFrom('pages')
      .select(['pages.page_number', 'pages.printed_page_number'])
      .where('pages.book_id', '=', bookId)
      .where('pages.page_number', '=', pageNumber)
      .executeTakeFirst();

    if (!page) {
      return null;
    }
    else {
      const blocks = await this.db
        .selectFrom('page_blocks')
        .select(['page_blocks.id', 'page_blocks.label', 'page_blocks.html'])
        .where('page_blocks.book_id', '=', bookId)
        .where('page_blocks.page_number', '=', pageNumber)
        .orderBy('page_blocks.position')
        .execute();

      const blockCitations = blocks.length === 0 ? [] : await this.db
        .selectFrom('citations')
        .select((eb) => [...citation_columns(eb), 'citations.page_block_id'])
        .where('citations.page_block_id', 'in', blocks.map((b) => b.id))
        .orderBy('citations.id')
        .execute();

      // pages printed with roman numerals (or unnumbered) can't be cited by number
      const printedNumber = citablePageNumber(page.printed_page_number);

      // by printed page number, or by the parts of one of the page's book_pages_to_citations rows
      const foreignCitations = await citationsOfPage(
        this.db, bookId, { pageNumber: page.page_number, printedNumber }
      )
        .select((eb) => [...citation_columns(eb), 'citations.page_block_id'])
        .execute();

      // The HTML of every page a citation's footnote is on: this one, and the citing pages in other books
      const sourcePages  = [...new Map(
        [...blockCitations, ...foreignCitations]
          .map((c) => [page_key(c.source_book_id, c.source_footnote_page), c] as const)
      ).values()];
      const sourceBlocks = sourcePages.length === 0 ? [] : await this.db
        .selectFrom('page_blocks')
        .select(['page_blocks.id', 'page_blocks.book_id', 'page_blocks.page_number', 'page_blocks.label', 'page_blocks.html'])
        .where((eb) => eb.or(sourcePages.map((c) => eb.and([
          eb('page_blocks.book_id', '=', c.source_book_id),
          eb('page_blocks.page_number', '=', c.source_footnote_page),
        ]))))
        .orderBy('page_blocks.book_id')
        .orderBy('page_blocks.page_number')
        .orderBy('page_blocks.position')
        .execute();

      const blocksByPage = new Map<string, SourceBlock[]>();
      for (const b of sourceBlocks) {
        const key = page_key(b.book_id, b.page_number);
        blocksByPage.set(key, [...(blocksByPage.get(key) ?? []), b]);
      }
      const with_source_text = (
        c: typeof blockCitations[number] | typeof foreignCitations[number]
      ): PageCitationDto => ({
        ...to_citation_dto(c),
        sourcePageText: citation_page_html(
          blocksByPage.get(
            page_key(c.source_book_id, c.source_footnote_page)
          ) ?? [],
          c.page_block_id,
          c.source_footnote_identifier
        ),
      });

      return {
        bookId,
        pageNumber:        page.page_number,
        printedPageNumber: page.printed_page_number,
        blocks:            blocks.map((b) => ({
          label:     b.label,
          html:      b.html,
          citations: blockCitations
            .filter((c) => c.page_block_id === b.id)
            .map(with_source_text),
        })),
        foreignCitations: foreignCitations.map(with_source_text),
      };
    }
  }
}
