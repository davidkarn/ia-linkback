import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DB } from './database.module';
import type { Database } from './database';
import { citation_columns, to_citation_dto, type CitationDto } from './citations.service';
import { citablePageNumber } from '../core/page_insights';
import { citationsOfPage, citedCountsByPage, findBooks } from '../model/page_insights';
import { findCitedPages } from '../model/book_pages_to_citations';
import { contentsOf, type ContentsEntry } from '../core/contents';
import {
  pageOrderLayout, pagesWithVolumeMarkers, selectVolume, volumeName, volumesOf,
  type Volume,
} from '../core/volumes';
import { partNamer } from '../core/book_part_names';
import { BookPartNameQueries } from '../model/book_part_names';
import { AlternateIdsQueries } from '../model/alternate_ids';
import { isBible } from '../core/bible';
import { BookScopes, BookSelectors } from '../model/books.js';
import { DbScopes, withScopes } from '../model/model_utils.js';

export type BookSummary = { id: string, title: string, author: string, url?: string, coverPhotoPath?: string, pageCount: number, citedByCount: number };
// citedByCount: citations in other books that cite this page (the foreignCitations of GET /books/{id}/pages/{id}).
// isVolume: not a page but where a volume starts (its first page, and its name), citedByCount null.
export type PageOrderEntry = {
  pageId: number, printedPageNumber: string, citedByCount: number | null, isVolume?: true,
};
// One of a book's volumes (see core/volumes.ts), without its pages. label: its proper name
// ("Isaias", "Prima Pars"; book_part_names), when it has one.
export type VolumeSummary = {
  volume: number,
  partType: string,
  partValue: string,
  firstPageId: number,
  lastPageId: number,
  pageCount: number,
  label?: string,
};
// isBible: a translation of the Bible (alternate id 'bible'), its pages a chapter each, its
// verses a paragraph each
export type BookForApi = BookSummary & {
  isBible: boolean,
  // pageOrder lists every page of the book, not only the open volume's
  allPagesListed: boolean,
  volume: number,
  volumes: VolumeSummary[],
  pageOrder: PageOrderEntry[],
  contents: ContentsEntry[],
};

export type BookPageForApi = {
  bookId: string,
  pageNumber: number,
  printedPageNumber: string,
  blocks: { label: string, html: string, citations: CitationDto[] }[],
  foreignCitations: CitationDto[],
  // the title and author of each book a foreignCitation is in
  foreignCitationTitles: { bookId: string, title: string, author: string }[],
};

@Injectable()
export class BooksService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  // authorId: only that author's books
  async search(opts: {
    offset: number,
    length: number,
    query?: string | undefined,
    authorId?: string | undefined }
  ): Promise<{ items: BookSummary[], count: number }> {
    const rows = await withScopes(
      this.db.selectFrom('books'), [
        BookScopes.scopedToQuery(opts.query),
        BookScopes.byAuthor(opts.authorId),
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
        BookScopes.scopedToQuery(opts.query),
        BookScopes.byAuthor(opts.authorId),
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
  // (see core/volumes.ts). pageOrder holds only that volume's pages, or every volume's, with a
  // marker where each starts (a short book) or without (short volumes; see pageOrderLayout);
  // contents is the whole book's.
  // null when there is no such book or volume.
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
      // a volume's proper name ("Isaias", "Prima Pars"), when book_part_names has one
      const nameOf  = partNamer(await BookPartNameQueries.findPartNames(this.db, bookId));
      const labelOf = (v: Volume) => nameOf([{ type: v.partType, value: v.partValue }]);

      if (volume === null) {
        return null;
      }
      else {
        // citations of each page, as getPage finds them: by printed page number, or by the parts
        // of one of the page's book_pages_to_citations rows
        const citedBy = await citedCountsByPage(this.db, bookId);
        const opened  = volumes[volume - 1];
        // a short book lists every volume's pages, with where each starts; a long one the open
        // volume's
        const layout = pageOrderLayout(pages.length, volumes);
        const inOpen = opened === undefined || layout !== 'volume' ? null : new Set(opened.pageIds);
        const listed = pages
          .filter((p) => inOpen === null || inOpen.has(p.page_number))
          .map((p): PageOrderEntry => ({
            pageId:            p.page_number,
            printedPageNumber: p.printed_page_number,
            citedByCount:      citedBy.get(p.page_number) ?? 0,
          }));

        return {
          id:           book.id,
          title:        book.title,
          author:       book.author,
          ...(book.url ? { url: book.url } : {}),
          ...(book.cover_photo_path ? { coverPhotoPath: book.cover_photo_path } : {}),
          pageCount:    pages.length,
          citedByCount: Number(book.cited_by_count ?? 0),
          isBible:      isBible(await AlternateIdsQueries.findAlternateIds(this.db, bookId)),
          volume,
          volumes:      volumes.map((v): VolumeSummary => {
            const label = labelOf(v);
            return {
              volume:      v.number,
              partType:    v.partType,
              partValue:   String(v.partValue),
              firstPageId: v.pageIds[0]!,
              lastPageId:  v.pageIds[v.pageIds.length - 1]!,
              pageCount:   v.pageIds.length,
              ...(label === undefined ? {} : { label }),
            };
          }),
          pageOrder:    layout === 'marked'
            ? pagesWithVolumeMarkers(listed, volumes, (v) => labelOf(v) ?? volumeName(v))
            : listed,
          allPagesListed: inOpen === null,
          // the whole book's, every volume's entries: those of other volumes go to their pages
          // in those volumes
          contents:       contentsOf(
            citedPages, new Map(pages.map((p) => [p.page_number, p.printed_page_number])), nameOf,
          ),
        };
      }
    }
  }

  // One page of a book: its blocks with the citations in their footnotes, and the citations in other
  // books that point at this page (by its printed page number or its citation parts). null when
  // there is no such page.
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

      // by printed page number, or by the parts of one of the page's book_pages_to_citations rows.
      // The text of the page each citing footnote is on is fetched separately, when it is shown
      // (GET /citations/{citationId}/sourcePage)
      const foreignCitations = await citationsOfPage(
        this.db, bookId, { pageNumber: page.page_number, printedNumber }
      )
        .select((eb) => citation_columns(eb))
        .execute();

      const citingBooks = await findBooks(
        this.db, [...new Set(foreignCitations.map((c) => c.source_book_id))]
      );

      return {
        bookId,
        pageNumber:        page.page_number,
        printedPageNumber: page.printed_page_number,
        blocks:            blocks.map((b) => ({
          label:     b.label,
          html:      b.html,
          citations: blockCitations
            .filter((c) => c.page_block_id === b.id)
            .map(to_citation_dto),
        })),
        foreignCitations:      foreignCitations.map(to_citation_dto),
        foreignCitationTitles: [...citingBooks.values()].map((b) => ({
          bookId: b.id,
          title:  b.title,
          author: b.author,
        })),
      };
    }
  }
}
