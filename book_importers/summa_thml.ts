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
import { scripRefCitations } from '../core/thml.ts';
import { log } from '../lib/lib.ts';

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

function testmain() {
  const text = `<pb n="112" href="/ccel/schaff/npnf203/Page_112.html" id="iv.viii.iv.vii-Page_112" />however wish to be
pure from you, as Pilate at the trial of Christ when He lived among us,
was unwilling to kill Him, and when they begged for His death, turned
to the East,<note place="end" n="689" id="iv.viii.iv.vii-p14.2"><p class="endnote" id="iv.viii.iv.vii-p15"> The turning to the East is not mentioned in the Gospel of St.
Matthew or in the Apocryphal Acts of Pilate; and the Imperial Decree
seems here to import a Christian practice into the pagan Procurators
tribunal. Orientation was sometimes observed in Pagan temples and the
altar placed at the east end; perhaps in connexion with the ancient
worship of the sun. cf. Æsch. Ag. 502; Paus. V. 23. i; Cic. Cat.
iii. §43. In. Virg. Æn. viii. 68 Æneas turns to the East
when he prays to the Tiber. cf. Liv 1. 18. But praying towards the East
is specially a primitive Christian custom, among the earliest
authorities being Tertullian (Apol. XVI.) and Clemens Al. (Stromat.
VII. 7).</p></note> asked water for his hands and
washed his hands, saying I am innocent of the blood of this righteous
man.<note place="end" n="690" id="iv.viii.iv.vii-p15.1"><p class="endnote" id="iv.viii.iv.vii-p16"> <scripRef passage="Matthew xxvii. 24" id="iv.viii.iv.vii-p16.2" parsed="|Matt|27|24|0|0" osisRef="Bible:Matt.27.24">Matthew xxvii.
24</scripRef></p></note></p>
`
  log(scripRefCitations(text, {bookid: 'abcdefg', footnotePage: 23}, 1))

  return new Promise(() => {});
};

testmain().catch((e) => {
  console.error(e);
  process.exit(1);
});
