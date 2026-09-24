import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DB } from './database.module';
import type { Database } from './database';

export type BookSummary = { id: string, title: string, author: string, url?: string, pageCount: number };
export type PageOrderEntry = { pageId: number, printedPageNumber: string };

// Escape LIKE wildcards so a user's "50%" or "a_b" is searched literally.
const like_pattern = (q: string) => '%' + q.replace(/[\\%_]/g, m => '\\' + m) + '%';

@Injectable()
export class BooksService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  // One page of matching books, plus how many books match in total (ignoring offset/length).
  async search(opts: { offset: number, length: number, query?: string | undefined }): Promise<{ items: BookSummary[], count: number }> {
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
        ...(r.url ? { url: r.url } : {}),
        pageCount: Number(r.page_count ?? 0),
      })),
      count: Number(total.count),
    };
  }

  async get(bookId: string): Promise<(BookSummary & { pageOrder: PageOrderEntry[] }) | null> {
    const book = await this.db
      .selectFrom('books')
      .select(['books.id', 'books.title', 'books.author', 'books.url'])
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
        pageCount: pages.length,
        pageOrder: pages.map(p => ({
          pageId: p.page_number,
          printedPageNumber: p.printed_page_number
        })),
      };
    }
  }
}
