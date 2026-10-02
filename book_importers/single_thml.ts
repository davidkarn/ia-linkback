// Import works CCEL publishes a file each of, in ThML (../thml): a book per work, a page per chapter
// (or per book, when it has no chapters), each page's divisions saved to book_pages_to_citations
// (see singleWork in core/fathers_thml.ts), with the citations in its notes.
//
// Usage (from src/):
//   npx tsx book_importers/single_thml.ts [--dir ../thml] [--only summacontragentiles] [--dry-run]
//   --only     import only these files (their names without .xml)
//   --dry-run  read and report, without saving
// DATABASE_URL comes from the environment or .env. Re-running replaces each work's pages.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../api/database.ts';
import { singleWork } from '../core/fathers_thml.ts';
import { BookActions } from '../model/books.ts';
import { replacePageCitations } from '../model/book_pages_to_citations.ts';

const argv   = process.argv.slice(2);
const option = (name: string) => {
  const i = argv.indexOf(`--${ name }`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const DIR     = option('dir') ?? '../thml';
const ONLY    = option('only')?.split(',');
const DRY_RUN = argv.includes('--dry-run');

// file: its name without .xml; ccel: its path on www.ccel.org. fixes: slips in the file's chapter
// titles, corrected before it's read: [what's there, what it should be]
type SingleWork = {
  file: string, id: string, title: string, author: string, translator: string, ccel: string,
  fixes?: [string, string][],
};

const WORKS: SingleWork[] = [
  // Rickaby's annotated translation, "Of God and His Creatures" (1905), in part abridged
  {
    file:       'summacontragentiles',
    id:         'summa-contra-gentiles',
    title:      'Summa Contra Gentiles',
    author:     'Thomas Aquinas',
    translator: 'Joseph Rickaby',
    ccel:       'aquinas/gentiles',
    // chapters misnumbered in the file, by what their titles say they are (III, 68, "That God is
    // everywhere and in all things"); its other chapters out of order are Rickaby's, who takes some
    // chapters together or out of their order
    fixes:      [
      ['title="Chapter LVIII. That God is everywhere', 'title="Chapter LXVIII. That God is everywhere'],
      ['title="Chapter LVIX.', 'title="Chapter LXIX.'],
      ['title="Chapter CLXIV. Of Predestination', 'title="Chapter CLXIII. Of Predestination'],
      ['title="Chapter CXVI. Of the Last Judgement', 'title="Chapter XCVI. Of the Last Judgement'],
    ],
  },
];

const main = async() => {
  const works = WORKS.filter((w) => !ONLY || ONLY.includes(w.file));
  const db    = DRY_RUN ? null : (() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    return new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
  })();

  try {
    for (const w of works) {
      const xml       = (w.fixes ?? []).reduce((text, [from, to]) => {
        if (!text.includes(from)) {
          throw new Error(`${ w.file }: no ${ from } to correct`);
        }
        return text.replace(from, to);
      }, fs.readFileSync(path.join(DIR, w.file + '.xml'), 'utf8'));
      const work      = singleWork(xml, {
        id: w.id, title: w.title, author: w.author, url: `https://www.ccel.org/ccel/${ w.ccel }.html`,
      });
      const cited     = work.pages.filter((p) => p.citationParts.length > 0);
      const blocks    = work.pages.flatMap((p) => p.blocks);
      const footnotes = blocks.filter((b) => b.label === 'Footnote').length;
      const citations = blocks.flatMap((b) => b.citations).length;

      console.log(`${ w.id }: ${ work.pages.length } pages, ${ cited.length } cited by their divisions, `
        + `${ footnotes } footnotes, ${ citations } citations; e.g. `
        + work.pages.slice(0, 3).map((p) => p.printedPageNumber).join(' | '));

      if (db) {
        await BookActions.saveBook(db, {
          id: work.id, title: work.title, author: work.author, url: work.url, translator: w.translator,
        }, work.pages);
        // a row per place a page is cited by: a page of several chapters, a row for each
        await replacePageCitations(db, work.id, cited.flatMap((p) => [p.citationParts, ...(p.alsoCitedAs ?? [])]
          .map((parts) => ({ pageNumber: p.pageNumber, parts }))));
      }
    }

    console.log(DRY_RUN ? 'dry run: nothing saved' : `saved ${ works.length } works`);
  }
  finally {
    await db?.destroy();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
