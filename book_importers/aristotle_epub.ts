// Import Aristotle's works from the EPUBs Wikisource exports (in output/aristotle, the most recent
// complete translation of each), a book per work, a page per chapter, with each page's book and
// chapter saved to book_pages_to_citations (see core/aristotle_epub.ts) and the translator to
// books.translator.
//
// Usage (from src/):
//   npx tsx book_importers/aristotle_epub.ts [--dir output/aristotle] [--only metaphysics,poetics]
//     [--dry-run]
//   --only     import only these works (their file names' first part)
//   --dry-run  read and report, without saving
// DATABASE_URL comes from the environment or .env. Re-running replaces each work's pages.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../api/database.ts';
import { workPages, type EpubDocument, type WorkReading } from '../core/aristotle_epub.ts';
import { BookActions } from '../model/books.ts';
import { replacePageCitations } from '../model/book_pages_to_citations.ts';

const argv   = process.argv.slice(2);
const option = (name: string) => {
  const i = argv.indexOf(`--${ name }`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const DIR     = option('dir') ?? 'output/aristotle';
const ONLY    = option('only')?.split(',');
const DRY_RUN = argv.includes('--dry-run');

// file: the EPUB's name; page: the Wikisource page it was exported from. skip: documents left out
// besides the first of several (the work's contents page): another work's, or the editor's.
// reading: where the markers alone would mislead (see WorkReading).
type Work = {
  file: string, id: string, title: string, translator: string, page: string, skip?: RegExp,
  reading?: WorkReading,
};

const WORKS: Work[] = [
  { file: 'categories_edghill_1928', id: 'aristotle-categories', title: 'Categories', translator: 'E. M. Edghill', page: 'The Works of Aristotle/Categories' },
  { file: 'on-interpretation_edghill_1928', id: 'aristotle-on-interpretation', title: 'On Interpretation', translator: 'E. M. Edghill', page: 'The Works of Aristotle/On Interpretation' },
  { file: 'prior-analytics_owen_1853', id: 'aristotle-prior-analytics', title: 'Prior Analytics', translator: 'Octavius Freire Owen', page: 'Organon (Owen)/Prior Analytics' },
  { file:       'posterior-analytics_bouchier_1901',
    id:         'aristotle-posterior-analytics',
    title:      'Posterior Analytics',
    translator: 'E. S. Bouchier',
    page:       'Posterior Analytics (Bouchier)',
    // its appendix is Prior Analytics II, 23-24, which would read as this work's chapters
    skip:       /_Appendix/ },
  { file: 'topics_owen_1853', id: 'aristotle-topics', title: 'Topics', translator: 'Octavius Freire Owen', page: 'Organon (Owen)/Topics' },
  { file: 'on-sophistical-refutations_owen_1853', id: 'aristotle-on-sophistical-refutations', title: 'On Sophistical Refutations', translator: 'Octavius Freire Owen', page: 'Organon (Owen)/The Sophistical Elenchi' },
  { file: 'on-the-heavens_stocks_1922', id: 'aristotle-on-the-heavens', title: 'On the Heavens', translator: 'J. L. Stocks', page: 'On the Heavens' },
  { file:       'on-the-soul_wallace_1882',
    id:         'aristotle-on-the-soul',
    title:      'On the Soul',
    translator: 'Edwin Wallace',
    page:       "Aristotle's Psychology",
    // its contents list "Book I.", "Book II." ...; the text starts at Book I's first chapter, its
    // later books at "BOOK SECOND. CHAPTER I."
    reading:    { textStartsAt: /^CHAPTER I\.?$/, firstBook: 1 } },
  { file: 'on-sense-and-the-sensible_beare_1908', id: 'aristotle-on-sense-and-the-sensible', title: 'On Sense and the Sensible', translator: 'J. I. Beare', page: 'On Sense and the Sensible' },
  { file: 'on-memory-and-reminiscence_beare_1908', id: 'aristotle-on-memory-and-reminiscence', title: 'On Memory and Reminiscence', translator: 'J. I. Beare', page: 'On Memory and Reminiscence' },
  { file: 'on-sleep-and-sleeplessness_beare_1908', id: 'aristotle-on-sleep-and-sleeplessness', title: 'On Sleep and Sleeplessness', translator: 'J. I. Beare', page: 'On Sleep and Sleeplessness' },
  { file: 'on-dreams_beare_1908', id: 'aristotle-on-dreams', title: 'On Dreams', translator: 'J. I. Beare', page: 'On Dreams (Aristotle)' },
  { file: 'on-prophesying-by-dreams_beare_1908', id: 'aristotle-on-prophesying-by-dreams', title: 'On Prophesying by Dreams', translator: 'J. I. Beare', page: 'On Prophesying by Dreams' },
  { file: 'on-longevity-and-shortness-of-life_ross_1908', id: 'aristotle-on-longevity-and-shortness-of-life', title: 'On Longevity and Shortness of Life', translator: 'G. R. T. Ross', page: 'On Longevity and Shortness of Life' },
  { file: 'on-youth-and-old-age_ross_1908', id: 'aristotle-on-youth-and-old-age', title: 'On Youth and Old Age', translator: 'G. R. T. Ross', page: 'On Youth and Old Age' },
  { file: 'on-life-and-death_ross_1908', id: 'aristotle-on-life-and-death', title: 'On Life and Death', translator: 'G. R. T. Ross', page: 'On Life and Death' },
  { file: 'on-breathing_ross_1908', id: 'aristotle-on-breathing', title: 'On Breathing', translator: 'G. R. T. Ross', page: 'On Breathing' },
  { file: 'history-of-animals_thompson_1910', id: 'aristotle-history-of-animals', title: 'History of Animals', translator: "D'Arcy Wentworth Thompson", page: 'History of Animals (Thompson)' },
  { file: 'on-the-parts-of-animals_ogle_1912', id: 'aristotle-on-the-parts-of-animals', title: 'On the Parts of Animals', translator: 'William Ogle', page: 'On the Parts of Animals' },
  { file: 'on-the-movement-of-animals_farquharson_1912', id: 'aristotle-on-the-movement-of-animals', title: 'On the Movement of Animals', translator: 'A. S. L. Farquharson', page: 'On the Movement of Animals' },
  { file: 'on-the-progression-of-animals_farquharson_1912', id: 'aristotle-on-the-progression-of-animals', title: 'On the Progression of Animals', translator: 'A. S. L. Farquharson', page: 'On the Progression of Animals' },
  { file: 'on-the-generation-of-animals_platt_1912', id: 'aristotle-on-the-generation-of-animals', title: 'On the Generation of Animals', translator: 'Arthur Platt', page: 'On the Generation of Animals' },
  { file: 'on-plants_forster_1913', id: 'aristotle-on-plants', title: 'On Plants', translator: 'E. S. Forster', page: 'On Plants' },
  { file: 'metaphysics_ross_1908', id: 'aristotle-metaphysics', title: 'Metaphysics', translator: 'W. D. Ross', page: 'Metaphysics (Ross, 1908)' },
  { file: 'nicomachean-ethics_ross_1925', id: 'aristotle-nicomachean-ethics', title: 'Nicomachean Ethics', translator: 'W. D. Ross', page: 'Nicomachean Ethics (Ross)' },
  { file: 'eudemian-ethics_solomon_1925', id: 'aristotle-eudemian-ethics', title: 'Eudemian Ethics', translator: 'J. Solomon', page: 'Eudemian Ethics', skip: /Virtues_and_Vices/ },
  { file: 'on-virtues-and-vices_solomon_1925', id: 'aristotle-on-virtues-and-vices', title: 'On Virtues and Vices', translator: 'J. Solomon', page: 'Virtues and Vices' },
  { file: 'politics_ellis_1912', id: 'aristotle-politics', title: 'Politics', translator: 'William Ellis', page: 'Politics (Ellis)' },
  { file: 'rhetoric_freese_1926', id: 'aristotle-rhetoric', title: 'Rhetoric', translator: 'J. H. Freese', page: 'Rhetoric (Freese)' },
  { file: 'poetics_butcher_1922', id: 'aristotle-poetics', title: 'Poetics', translator: 'S. H. Butcher', page: 'The Poetics translated by S. H. Butcher', skip: /_Preface_|_Editions|_Analysis|_Abbreviat/ },
  { file: 'the-athenian-constitution_kenyon_1921', id: 'aristotle-the-athenian-constitution', title: 'The Athenian Constitution', translator: 'Frederic G. Kenyon', page: 'Athenian Constitution' },
];

// An EPUB's text documents in reading order (Wikisource's exports name them c0_..., c1_...), but
// for the work's contents page, the first of several, and those the work skips
const epubDocuments = (file: string, skip: RegExp | undefined): EpubDocument[] => {
  const files = unzipSync(new Uint8Array(fs.readFileSync(file)));
  const docs  = Object.keys(files)
    .map((name) => ({ name, order: name.match(/\/c(\d+)_[^/]*\.xhtml$/)?.[1] }))
    .filter((d): d is { name: string, order: string } => d.order !== undefined)
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((d) => ({ name: path.basename(d.name), html: strFromU8(files[d.name]!) }));

  return docs
    .filter((d, i) => docs.length === 1 || i > 0)
    .filter((d) => !skip?.test(d.name));
};

const wikisourceUrl = (page: string) => (
  'https://en.wikisource.org/wiki/' + encodeURIComponent(page.replace(/ /g, '_')).replace(/%2F/g, '/')
);

const main = async() => {
  const works = WORKS.filter((w) => !ONLY || ONLY.some((o) => w.file.startsWith(o)));
  const db    = DRY_RUN ? null : (() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    return new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
  })();

  const totals = { works: 0, pages: 0, cited: 0, footnotes: 0 };

  try {
    for (const work of works) {
      const file = path.join(DIR, work.file + '.epub');
      if (!fs.existsSync(file)) {
        console.log(`${ work.file }: no ${ file }, skipped`);
        continue;
      }

      const pages     = workPages(work.title, epubDocuments(file, work.skip), work.reading);
      const cited     = pages.filter((p) => p.citationParts.length > 0);
      const footnotes = pages.flatMap((p) => p.blocks).filter((b) => b.label === 'Footnote').length;
      const books     = new Set(cited.flatMap((p) => p.citationParts.filter((c) => c.type === 'book').map((c) => c.value)));

      console.log(`${ work.id }: ${ pages.length } pages, ${ cited.length } cited by `
        + `${ books.size > 0 ? `book (${ books.size }) and ` : '' }chapter, ${ footnotes } footnotes; `
        + `e.g. ${ pages.slice(0, 4).map((p) => p.printedPageNumber).join(' | ') }`);

      if (db) {
        await BookActions.saveBook(db, {
          id: work.id, title: work.title, author: 'Aristotle', url: wikisourceUrl(work.page), translator: work.translator,
        }, pages);
        await replacePageCitations(db, work.id, cited.map((p) => ({ pageNumber: p.pageNumber, parts: p.citationParts })));
      }

      totals.works     += 1;
      totals.pages     += pages.length;
      totals.cited     += cited.length;
      totals.footnotes += footnotes;
    }

    console.log(`${ DRY_RUN ? 'dry run, nothing saved: ' : 'saved ' }${ totals.works } works, ${ totals.pages } `
      + `pages (${ totals.cited } cited by book and chapter), ${ totals.footnotes } footnotes`);
  }
  finally {
    await db?.destroy();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
