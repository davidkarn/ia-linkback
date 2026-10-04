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
  pageOrderOf, selectVolume, volumeName, volumesOf, type PageOrderEntry, type Volume,
} from '../core/volumes';
import { partNamer } from '../core/book_part_names';
import { BookPartNameQueries } from '../model/book_part_names';
import { AlternateIdsQueries } from '../model/alternate_ids';
import { CopyrightStatusCheckScopes } from '../model/copyright_status_checks';
import { assertNotWithheld } from './copyright';
import { isBible } from '../core/bible';
import { BookScopes, BookSelectors } from '../model/books.js';
import { DbScopes, withScopes } from '../model/model_utils.js';

export type BookSummary = { id: string, title: string, author: string, url?: string, coverPhotoPath?: string, pageCount: number, citedByCount: number };
// A page as pageOrder lists it (see core/volumes.ts): citedByCount is null in GET /books/{bookId}'s
// placeholder, counted in GET /books/{bookId}/pageOrder
export type { PageOrderEntry };

// GET /books/{bookId}/pageOrder: the volume opened, and its pageOrder with citations counted
export type PageOrderForApi = {
  volume: number,
  pageOrder: PageOrderEntry[],
  allPagesListed: boolean,
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

  // authorId: only that author's books. Books likely under copyright are left out (see
  // shownInSearches in core/copyright_status.ts).
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
        CopyrightStatusCheckScopes.shownInSearches(),
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
        CopyrightStatusCheckScopes.shownInSearches(),
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
  // marker where each starts (a short book) or without (short volumes; see pageOrderLayout); it's
  // a placeholder, its citedByCounts null, for getPageOrder to replace (counting citations is
  // slow). contents is the whole book's. null when there is no such book or volume.
  async get(
    bookId: string, opts: { volume?: number | undefined, pageId?: number | undefined } = {}
  ): Promise<BookForApi | null> {
    await assertNotWithheld(this.db, bookId);

    const book   = await this.db
      .selectFrom('books')
      .select((eb) => [
        'books.id', 'books.title', 'books.author', 'books.url', 'books.cover_photo_path',
        BookSelectors.citedByCount(eb),
      ])
      .where('books.id', '=', bookId)
      .executeTakeFirst();
    const layout = book ? await this.layoutOf(bookId, opts) : null;

    if (!book || layout === null) {
      return null;
    }
    else {
      const { pages, citedPages, volumes, volume, nameOf, labelOf } = layout;
      // the placeholder: counting each page's citations is left to GET /books/{bookId}/pageOrder
      const { pageOrder, allPagesListed } = pageOrderOf({
        pages, volumes, volume, citedBy: null, markerName: (v) => labelOf(v) ?? volumeName(v),
      });

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
        pageOrder,
        allPagesListed,
        // the whole book's, every volume's entries: those of other volumes go to their pages
        // in those volumes
        contents:     contentsOf(
          citedPages, new Map(pages.map((p) => [p.page_number, p.printed_page_number])), nameOf,
        ),
      };
    }
  }

  // A book's pageOrder as GET /books/{bookId} lists it (opened the same way), with each page's
  // citations counted: by printed page number, or by the parts of one of the page's
  // book_pages_to_citations rows (as getPage finds them). null when there's no such book or
  // volume.
  async getPageOrder(
    bookId: string, opts: { volume?: number | undefined, pageId?: number | undefined } = {}
  ): Promise<PageOrderForApi | null> {
    await assertNotWithheld(this.db, bookId);

    const book   = await this.db.selectFrom('books').select('books.id')
      .where('books.id', '=', bookId)
      .executeTakeFirst();
    const layout = book ? await this.layoutOf(bookId, opts) : null;

    if (layout === null) {
      return null;
    }
    else {
      const { pages, volumes, volume, labelOf } = layout;
      const citedBy                             = await citedCountsByPage(this.db, bookId);

      return {
        volume,
        ...pageOrderOf({
          pages, volumes, volume, citedBy, markerName: (v) => labelOf(v) ?? volumeName(v),
        }),
      };
    }
  }

  // How a book is laid out: its pages, the parts they're cited by ([] for books cited by page
  // number), which divide it into volumes and make its table of contents, the volume to open
  // (see selectVolume), and the proper names of its parts (book_part_names: "Isaias", "Prima
  // Pars"). null when it has no such volume.
  private async layoutOf(
    bookId: string, opts: { volume?: number | undefined, pageId?: number | undefined }
  ) {
    const pages = await this.db
      .selectFrom('pages')
      .select(['pages.page_number', 'pages.printed_page_number'])
      .where('pages.book_id', '=', bookId)
      .orderBy('pages.page_number')
      .execute();

    const citedPages = await findCitedPages(this.db, bookId);
    const volumes    = volumesOf(pages.map((p) => p.page_number), citedPages);
    const volume     = selectVolume(volumes, opts);
    const nameOf     = partNamer(await BookPartNameQueries.findPartNames(this.db, bookId));
    const labelOf    = (v: Volume) => nameOf([{ type: v.partType, value: v.partValue }]);

    return volume === null ? null : { pages, citedPages, volumes, volume, nameOf, labelOf };
  }

  // One page of a book: its blocks with the citations in their footnotes, and the citations in other
  // books that point at this page (by its printed page number or its citation parts). null when
  // there is no such page.
  async getPage(bookId: string, pageNumber: number): Promise<BookPageForApi | null> {
    await assertNotWithheld(this.db, bookId);

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
