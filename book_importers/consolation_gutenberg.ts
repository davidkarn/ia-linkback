// Import Boethius's Consolation of Philosophy in H. R. James's translation (1897), from Project
// Gutenberg's HTML (eBook 14328, saved to output/boethius): a page per song and prose section,
// cited by book and metre or prose (see core/consolation_gutenberg.ts).
//
// Usage (from src/):
//   npx tsx book_importers/consolation_gutenberg.ts [--file output/boethius/consolation_james_1897.html]
//     [--dry-run]
// DATABASE_URL comes from the environment or .env. Re-running replaces the book's pages.
import 'dotenv/config';
import fs from 'node:fs';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../api/database.ts';
import { consolationPages } from '../core/consolation_gutenberg.ts';
import { BookActions } from '../model/books.ts';
import { replacePageCitations } from '../model/book_pages_to_citations.ts';

const argv    = process.argv.slice(2);
const FILE    = argv[argv.indexOf('--file') + 1] && argv.includes('--file')
  ? argv[argv.indexOf('--file') + 1]! : 'output/boethius/consolation_james_1897.html';
const DRY_RUN = argv.includes('--dry-run');

const BOOK = {
  id:         'boethius-consolation-of-philosophy',
  title:      'The Consolation of Philosophy',
  author:     'Boethius',
  url:        'https://www.gutenberg.org/ebooks/14328',
  translator: 'H. R. James',
};

const main = async() => {
  const pages     = consolationPages(fs.readFileSync(FILE, 'utf8'), BOOK.title);
  const footnotes = pages.flatMap((p) => p.blocks).filter((b) => b.label === 'Footnote').length;

  console.log(`${ BOOK.id }: ${ pages.length } pages (${ pages.filter((p) => p.citationParts[1]?.type === 'prose').length } `
    + `prose, ${ pages.filter((p) => p.citationParts[1]?.type === 'metre').length } metres), ${ footnotes } footnotes`);

  if (DRY_RUN) {
    console.log('dry run: nothing saved');
  }
  else {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    const db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    try {
      await BookActions.saveBook(db, BOOK, pages);
      await replacePageCitations(db, BOOK.id, pages.map((p) => ({ pageNumber: p.pageNumber, parts: p.citationParts })));
      console.log('saved');
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
