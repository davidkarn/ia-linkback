// Import the Douay-Rheims Bible from CCEL's ThML edition into the database, as the book
// "douay-rheims": one page per chapter of each book (see core/douay_thml.ts), and a
// book_pages_to_citations row for each, citing it by book (its number in the Douay canon,
// core/bible.ts, as Bible citations give it) and chapter.
//
// Usage (from src/):
//   npx tsx book_importers/douay_thml.ts [--file ../thml/douayr.xml] [--dry-run]
//   --dry-run   parse and report, without saving
// DATABASE_URL comes from the environment or .env. Re-running replaces the book's pages and page
// citations.
import 'dotenv/config';
import fs from 'node:fs';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../api/database.ts';
import { DOUAY_BOOK_ID, douayPages, parseDouay, toVulgate } from '../core/douay_thml.ts';
import { saveBook } from '../model/books.ts';
import { replacePageCitations } from '../model/book_pages_to_citations.ts';

const BOOK = {
  id:     DOUAY_BOOK_ID,
  title:  'The Holy Bible: Douay-Rheims',
  author: 'Bible',
  url:    'https://www.ccel.org/ccel/bible/douayr.html',
};

const argv   = process.argv.slice(2);
const option = (name: string) => {
  const i = argv.indexOf(`--${ name }`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const FILE    = option('file') ?? '../thml/douayr.xml';
const DRY_RUN = argv.includes('--dry-run');

const main = async() => {
  const books  = toVulgate(parseDouay(fs.readFileSync(FILE, 'utf8')));
  const pages  = douayPages(books);
  const verses = pages.reduce((n, p) => n + p.blocks.filter((b) => b.html.startsWith('<p><sup>')).length, 0);

  console.log(`${ FILE }: ${ books.length } books, ${ pages.length } chapters, ${ verses } verses`);

  if (DRY_RUN) {
    console.log('dry run: nothing saved');
  }
  else if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  else {
    const db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    try {
      const saved = await saveBook(db, BOOK, pages);
      const cited = await replacePageCitations(db, BOOK.id, pages.map((p) => ({
        pageNumber: p.pageNumber, parts: p.citationParts,
      })));

      console.log(`saved "${ BOOK.title }" as ${ BOOK.id }: ${ saved.pages } pages, ${ saved.blocks } `
        + `blocks, ${ cited } page citations`);
    }
    finally {
      await db.destroy();
    }
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
