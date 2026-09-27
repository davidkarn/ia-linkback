// Import the Summa Theologiae from CCEL's ThML edition into the database, as the book
// "Summa Theologiae" by St. Thomas Aquinas: one page per article, with a contents page at the start
// of each question (see core/summa_thml.ts).
//
// Usage (from src/):
//   npx tsx book_importers/summa_thml.ts [--file ../thml/summa.xml] [--dry-run]
//   --dry-run   parse and report, without saving
// DATABASE_URL comes from the environment or .env. Re-running replaces the book's pages.
import 'dotenv/config';
import fs from 'node:fs';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../api/database.ts';
import { summaPages } from '../core/summa_thml.ts';
import { saveBook } from '../model/books.ts';

const BOOK = {
  id:     'summa-theologiae',
  title:  'Summa Theologiae',
  author: 'St. Thomas Aquinas',
  url:    'https://www.ccel.org/ccel/aquinas/summa',
};

const argv   = process.argv.slice(2);
const option = (name: string) => {
  const i = argv.indexOf(`--${ name }`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const FILE    = option('file') ?? '../thml/summa.xml';
const DRY_RUN = argv.includes('--dry-run');

const main = async() => {
  const pages = summaPages(fs.readFileSync(FILE, 'utf8'));
  const count = (suffix: RegExp) => pages.filter(
    (p) => suffix.test(p.printedPageNumber)
  ).length;

  console.log(`${ FILE }: ${ pages.length } pages (${ count(/ q\. \d+$/) } questions, `
    + `${ count(/ a\. \d+$/) } articles, ${ count(/prol\.$/) } prologues)`);

  if (DRY_RUN) {
    console.log('dry run: nothing saved');
  }
  else if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  else {
    const db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: process.env.DATABASE_URL })
      }),
    });
    try {
      const saved = await saveBook(db, BOOK, pages);
      
      console.log(`saved "${ BOOK.title }" as ${ BOOK.id }: `
        + `${ saved.pages } pages, ${ saved.blocks } blocks`);
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
