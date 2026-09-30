// Record how each page of the Summa Theologiae (imported by book_importers/summa_thml.ts) is cited, in
// book_pages_to_citations: its book, question and article (book 1-5: I, I-II, II-II, III,
// Supplement). An article's page is cited by all three; a question's contents page by book and
// question; a prologue by its book.
//
// Usage (from src/):
//   npx tsx book_importers/summa_thml_link.ts [--dry-run]
// DATABASE_URL comes from the environment or .env. Re-running replaces the Summa's rows.
import 'dotenv/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../api/database.ts';
import { SUMMA_BOOK_ID, summaCitationParts } from '../core/summa_thml.ts';
import { findPageLabels, replacePageCitations } from '../model/book_pages_to_citations.ts';
import { log } from '../lib/lib.ts';

const DRY_RUN = process.argv.includes('--dry-run');

const main = async() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
  });

  try {
    const pages = await findPageLabels(db, SUMMA_BOOK_ID);
    if (!pages.length) {
      throw new Error(`no pages for ${ SUMMA_BOOK_ID }: import it first (book_importers/summa_thml.ts)`);
    }
    else {
      const cited = pages.map((p) => ({
        pageNumber: p.page_number,
        label:      p.printed_page_number,
        parts:      summaCitationParts(p.printed_page_number),
      }));

      const unreadable = cited.filter((p) => !p.parts);

      if (unreadable.length) {
        throw new Error('pages whose labels have no citation: '
          + unreadable.slice(0, 10).map((p) => `${ p.pageNumber } "${ p.label }"`).join(', '));
      }
      else {
        console.log(`${ SUMMA_BOOK_ID }: ${ cited.length } pages, e.g. `
          + cited.slice(12, 14).map((p) => `"${ p.label }" -> `
            + p.parts!.map((part) => `${ part.type } ${ part.value }`
            ).join(', ')
          ).join('; '));

        if (DRY_RUN) {
          log(cited);
          console.log('dry run: nothing saved');
        }
        else {
          const saved = await replacePageCitations(
            db,
            SUMMA_BOOK_ID,
            cited.map(
              (p) => ({ pageNumber: p.pageNumber, parts: p.parts! })
            )
          );

          console.log(`saved ${ saved } page citations`);
        }
      }
    }
  }
  finally {
    await db.destroy();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
