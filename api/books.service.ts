import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DB } from './database.module';
import type { Database } from './database';
import { citation_columns, to_citation_dto, type CitationDto } from './citations.service';

export type BookSummary = { id: string, title: string, author: string, url?: string, coverPhotoPath?: string, pageCount: number };
export type PageOrderEntry = { pageId: number, printedPageNumber: string };

// The BookPage schema in api.yaml
export type BookPage = {
  bookId: string,
  pageNumber: number,
  printedPageNumber: string,
  blocks: { label: string, html: string, citations: CitationDto[] }[],
  foreignCitations: CitationDto[],
};

// Escape LIKE wildcards so a user's "50%" or "a_b" is searched literally.
const like_pattern = (q: string) => '%' + q.replace(/[\\%_]/g, m => '\\' + m) + '%';

@Injectable()
export class BooksService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  // One page of matching books, plus how many books match in total (ignoring offset/length).
  async search(opts: {
    offset: number,
    length: number,
    query?: string | undefined }
  ): Promise<{ items: BookSummary[], count: number }> {

    const matching = () => {
      let q = this.db.selectFrom('books');

      if (opts.query) {
        const pattern = like_pattern(opts.query);
        q = q.where(eb => eb.or([
          eb('books.title', 'ilike', pattern),
          eb('books.author', 'ilike', pattern)
        ]));
      }
      
      return q;
    };

    const rows = await matching()
      .select(eb => [
        'books.id',
        'books.title',
        'books.author',
        'books.url',
        'books.cover_photo_path',
        eb.selectFrom('pages')
          .select(eb.fn.countAll<string>().as('n'))
          .whereRef('pages.book_id', '=', 'books.id')
          .as('page_count'),
      ])
      .orderBy('books.title')
      .orderBy('books.id')
      .limit(opts.length)
      .offset(opts.offset)
      .execute();

    const total = await matching()
      .select(eb => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();

    return {
      items: rows.map(r => ({
        id: r.id,
        title: r.title,
        author: r.author,
        url: r.url ?? null,
        coverPhotoPath: r.cover_photo_path ?? null,
        pageCount: Number(r.page_count ?? 0),
      })),
      count: Number(total.count),
    };
  }

  async get(
    bookId: string
  ): Promise<(BookSummary & { pageOrder: PageOrderEntry[] }) | null> {
    const book = await this.db
      .selectFrom('books')
      .select([
        'books.id', 'books.title', 'books.author', 'books.url', 'books.cover_photo_path'
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

      return {
        id: book.id,
        title: book.title,
        author: book.author,
        ...(book.url ? { url: book.url } : {}),
        ...(book.cover_photo_path ? { coverPhotoPath: book.cover_photo_path } : {}),
        pageCount: pages.length,
        pageOrder: pages.map(p => ({
          pageId: p.page_number,
          printedPageNumber: p.printed_page_number
        })),
      };
    }
  }

  // One page of a book: its blocks with the citations in their footnotes, and the citations in other
  // books that point at this page by its printed page number. null when there is no such page.
  async getPage(bookId: string, pageNumber: number): Promise<BookPage | null> {
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
        .select(eb => [...citation_columns(eb), 'citations.page_block_id'])
        .where('citations.page_block_id', 'in', blocks.map(b => b.id))
        .orderBy('citations.id')
        .execute();

      // Citations give page numbers as integers, so pages printed with roman numerals (or unnumbered)
      // can't be matched.
      const printedNumber = /^\d+$/.test(page.printed_page_number)
        ? Number(page.printed_page_number)
        : null;

      const foreignCitations = printedNumber === null ? [] : await this.db
        .selectFrom('citations')
        .select(citation_columns)
        .where('citations.reference_book_id', '=', bookId)
        .where('citations.source_book_id', '<>', bookId)
        .where(eb => eb.exists(
          eb.selectFrom('citation_locations')
            .whereRef('citation_locations.citation_id', '=', 'citations.id')
            .where('citation_locations.type', '=', 'page')
            .where('citation_locations.value', '=', printedNumber),
        ))
        .orderBy('citations.source_book_id')
        .orderBy('citations.source_footnote_page')
        .orderBy('citations.id')
        .execute();

      return {
        bookId,
        pageNumber: page.page_number,
        printedPageNumber: page.printed_page_number,
        blocks: blocks.map(b => ({
          label: b.label,
          html: b.html,
          citations: blockCitations
            .filter(c => c.page_block_id === b.id)
            .map(to_citation_dto),
        })),
        foreignCitations: foreignCitations.map(to_citation_dto),
      };
    }
  }
}
