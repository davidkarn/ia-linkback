import util from 'util';
import fs from 'node:fs/promises';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Selectable } from 'kysely';
import type { CitationsTable, Database, QueuedBookImportsTable } from '../api/database.ts';
import { citedTitle, sameAuthor, sameTitle, skipCitation, volumeOf } from '../citation_matching.ts';
import dotenv from 'dotenv';
import type { Book } from '../types.js';

dotenv.config()

const log = (...items: any[]) => console.log(util.inspect(items, { depth: null }));

const db = new Kysely<Database>({
    dialect: new PostgresDialect({
        pool: new Pool({
            connectionString: process.env.DATABASE_URL
        })
    }),
});

const getNextBook = () => (
  db.selectFrom('queued_book_imports')
    .selectAll()
    .where('status', '=', 'imported')
    .orderBy('id')
    .limit(1)
    .executeTakeFirst()
);

type QueuedBook = Selectable<QueuedBookImportsTable>;

type FootnoteCitation = {
  citationId: string,
  footnotePage: number,
  footnoteIdentifier: string,
  author: string,
  title: string,
  location: string,
  raw: string,
};

const citationsForBook = (bookId: string) => (
  db.selectFrom('citations')
    .select([
      'id', 'source_footnote_page', 'source_footnote_identifier', 'author', 'title', 'location', 'raw',
      'reference_book_id',
    ])
    .where('source_book_id', '=', bookId)
    .orderBy('source_footnote_page')
    .orderBy('id')
    .execute()
);

const referencableBookDetails = (bookId: string) => (
  db.selectFrom('books')
    .select(['id', 'title', 'author'])
    .where('id', '<>', bookId)
    .execute()
);

const findCitedBooks = (
  book: QueuedBook,
  citations: Selectable<CitationsTable>[],
  books: Pick<Selectable<Book>, 'id' | 'title' | 'author'>[]
): {
  referencing: {citationId: number, bookId: number}[],
  notReferencing: Selectable<CitationsTable>[]
} => {
  const bookId  = book.imported_book_id;
  const matches = new Map<string, typeof books>();

  const booksMatching = (author: string, title: string) => {
    const key = author + '\u0000' + title;
    let found = matches.get(key);

    if (!found) {
      found = books.filter(
        b => sameAuthor(author, b.author)
          && sameTitle(
            citedTitle(title) || title,
            b.title
          )
      );
      
      matches.set(key, found);
    }
    
    return found;
  };

  const referencing: {citationId: number, bookId: number}[] = []
  const notReferencing: Selectable<CitationsTable>[]        = [];

  for (const c of citations) {
    if (c.reference_book_id) {
      // skip 
    }
    else if (skipCitation(c.author, c.title)) {
      notReferencing.push(c);
    }
    else {
      let found    = booksMatching(c.author, c.title);
      const volume = volumeOf(c.title) ?? volumeOf(c.location);
      
      if (volume !== null && found.some(b => volumeOf(b.title) !== null)) {
        found = found.filter(b => volumeOf(b.title) === volume);
      }

      if (found.length) {
        referencing.push({ citationId: c.id, bookId: found[0].id });
      }
      else {
        notReferencing.push(c);
      }
    }
  }

  return { referencing, notReferencing };
};


const processImportedCitations = async (book: QueuedBook) => {
  const citations          = await citationsForBook(book.imported_book_id);
  const referenceableBooks = await referencableBookDetails(book.imported_book_id);

  const {referencing, notReferencing} = findCitedBooks(book, citations, referenceableBooks);
  return {referencing, notReferencing};
};

const main = async () => {
  while (true) {
    const nextBook = await getNextBook();
    const citations = await processImportedCitations(nextBook);
    log({citations});
    return;
  }
}


main();
