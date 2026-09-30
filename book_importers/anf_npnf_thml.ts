// Import the Ante-Nicene Fathers and the Nicene and Post-Nicene Fathers from CCEL's ThML editions
// (../thml/anf01.xml ... npnf214.xml): each work in a volume as a book of its own, by its author,
// with a page per chapter and the scripture, notes and other references in it as Footnote blocks
// (see core/fathers_thml.ts). Each page's numbered divisions ("Book I, Chapter 5" -> book 1,
// chapter 5) are saved to book_pages_to_citations, so citations of those locations count on it.
//
// Usage (from src/):
//   npx tsx book_importers/anf_npnf_thml.ts [--dir ../thml] [--only anf01,npnf102] [--dry-run]
//   --only      import only these volumes
//   --dry-run   parse and report, without saving
// DATABASE_URL comes from the environment or .env. Re-running replaces each work's pages and page
// citations.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../api/database.ts';
import { volumeWorks, type Work } from '../core/fathers_thml.ts';
import { replacePageCitations } from '../model/book_pages_to_citations.ts';
import { BookActions } from '../model/books.js';

const argv   = process.argv.slice(2);
const option = (name: string) => {
  const i = argv.indexOf(`--${ name }`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const DIR     = option('dir') ?? '../thml';
const ONLY    = option('only')?.split(',');
const DRY_RUN = argv.includes('--dry-run');

const footnotes = (work: Work) => (
  work.pages.flatMap((p) => p.blocks).filter((b) => b.label === 'Footnote').length
);

const main = async() => {
  const volumes = fs.readdirSync(DIR)
    .filter((f) => /^(?:anf|npnf)\d+\.xml$/.test(f))
    .map((f) => f.replace(/\.xml$/, ''))
    .filter((v) => !ONLY || ONLY.includes(v))
    .sort();

  if (volumes.length === 0) {
    throw new Error(`no anf or npnf volumes in ${ DIR }${ ONLY ? ` matching ${ ONLY.join(', ') }` : '' }`);
  }

  const db = DRY_RUN ? null : (() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    return new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
  })();

  const totals = { works: 0, pages: 0, footnotes: 0, cited: 0, uncited: 0 };

  try {
    for (const volume of volumes) {
      const works = volumeWorks(volume, fs.readFileSync(path.join(DIR, `${ volume }.xml`), 'utf8'));
      console.log(`${ volume }: ${ works.length } works`);

      for (const work of works) {
        // pages with no numbered division (a work of one page, a preface) have nothing to be cited by
        const cited = work.pages.filter((p) => p.citationParts.length > 0);

        console.log(`  ${ work.id }: "${ work.title }" by ${ work.author }, ${ work.pages.length } pages, `
          + `${ footnotes(work) } footnotes, ${ cited.length } cited by divisions`);

        if (db) {
          await BookActions.saveBook(db, { id: work.id, title: work.title, author: work.author, url: work.url },
                         work.pages);
          await replacePageCitations(db, work.id, cited.map((p) => ({
            pageNumber: p.pageNumber, parts: p.citationParts,
          })));
        }

        totals.works     += 1;
        totals.pages     += work.pages.length;
        totals.footnotes += footnotes(work);
        totals.cited     += cited.length;
        totals.uncited   += work.pages.length - cited.length;
      }
    }

    console.log(`${ DRY_RUN ? 'dry run, nothing saved: ' : 'saved ' }${ totals.works } works, `
      + `${ totals.pages } pages, ${ totals.footnotes } footnotes; ${ totals.cited } pages in `
      + `book_pages_to_citations, ${ totals.uncited } without numbered divisions left out of it`);
  }
  finally {
    await db?.destroy();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
