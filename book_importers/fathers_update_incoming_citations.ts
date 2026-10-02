// Point citations of the Church Fathers in other books at the works imported from the Ante-Nicene
// and Nicene and Post-Nicene Fathers (book_importers/anf_npnf_thml.ts), with their locations read
// from their text in the parts book_pages_to_citations gives the work's pages, so afterwards they
// count on the pages they cite. Which work a citation cites, and how its location is read, is in
// core/fathers_citations.ts.
//
// A citation of a work's own pages by the work itself is left alone, as are citations whose work
// isn't known, whose location gives no place, or whose places land on no page of the work (a
// letter the volume leaves out, a location misread). The report lists those.
//
// Usage (from src/):
//   npx tsx book_importers/fathers_update_incoming_citations.ts [--works fathers|aristotle] [--dry-run]
//   --works  whose citations to link: the Fathers' (the default, core/fathers_citations.ts) or
//            Aristotle's (core/aristotle_citations.ts)
// DATABASE_URL comes from the environment or .env. Re-running reads the locations again.
import 'dotenv/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../api/database.ts';
import type { PlaceGroup } from '../core/citation_groups.ts';
import type { CitationPart } from '../core/summa_thml.ts';
import {
  citedFatherWork, divisionTypes, FATHER_WORKS, parseFatherLocation, placeOnPage, type FatherWork,
} from '../core/fathers_citations.ts';
import { ARISTOTLE_WORKS } from '../core/aristotle_citations.ts';
import { findCitationsByAuthor, relinkCitations } from '../model/incoming_citations.ts';
import { findCitedPages } from '../model/book_pages_to_citations.ts';

const DRY_RUN = process.argv.includes('--dry-run');
const WORKS   = process.argv[process.argv.indexOf('--works') + 1] === 'aristotle' && process.argv.includes('--works')
  ? 'aristotle' : 'fathers';

// The works whose citations are linked (--works fathers, the default, or aristotle), and their
// authors, loosely: citedFatherWork decides
const LINKED: Record<typeof WORKS, { works: FatherWork[], authors: string }> = {
  fathers:   { works: FATHER_WORKS, authors: 'augustin|damascen|damascus' },
  aristotle: { works: ARISTOTLE_WORKS, authors: 'aristot|philosopher' },
};
const { works: CITED_WORKS, authors: AUTHORS }                               = LINKED[WORKS];

const showPlace = (parts: CitationPart[]) => parts.map((p) => `${ p.type } ${ p.value }`).join(', ');

// Counts of a key, most first
const tally = (keys: string[]) => [...keys.reduce(
  (counts, key) => counts.set(key, (counts.get(key) ?? 0) + 1), new Map<string, number>(),
)].sort((a, b) => b[1] - a[1]);

const main = async() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
  });

  try {
    const bookIds = [...new Set(CITED_WORKS.map((w) => w.bookId))];
    const rows    = new Map(await Promise.all(bookIds.map(async(id) => (
      [id, await findCitedPages(db, id)] as const
    ))));
    const missing = bookIds.filter((id) => (rows.get(id) ?? []).length === 0);
    if (missing.length > 0) {
      console.log(`works with no book_pages_to_citations rows, not linked: ${ missing.join(', ') }`);
    }

    const all = await findCitationsByAuthor(db, AUTHORS);

    const linked                                       = new Map<string, { id: string, groups: PlaceGroup[] }[]>();
    const unknown: string[]                            = [];
    const unplaced: { bookId: string, raw: string }[]  = [];
    const offPage: { bookId: string, place: string }[] = [];

    for (const c of all) {
      const work     = citedFatherWork(c.author, c.title, c.location, CITED_WORKS);
      const workRows = work === undefined ? [] : rows.get(work.bookId) ?? [];

      if (work === undefined) {
        unknown.push(`${ c.author } | ${ c.title }`);
      }
      else if (workRows.length === 0 || c.source_book_id === work.bookId) {
        // not imported with its divisions, or citing itself
      }
      else {
        const prefix = work.prefix ?? [];
        const types  = divisionTypes(workRows).slice(prefix.length);
        const places = parseFatherLocation(c.location || c.raw, types)
          .map((parts) => [...prefix, ...parts]);

        const onPages = places.flatMap((p) => {
          const on = placeOnPage(p, workRows);
          return on === undefined ? [] : [on];
        });

        if (places.length === 0) {
          unplaced.push({ bookId: work.bookId, raw: c.raw });
        }
        // a letter the volume leaves out, or a location misread: not pointed at a page it hasn't
        else if (onPages.length === 0) {
          offPage.push(...places.map((p) => ({ bookId: work.bookId, place: showPlace(p) })));
        }
        else {
          // each place's raw label is the citation's location as extracted, or else its raw text
          const raw = c.location || c.raw;
          linked.set(work.bookId, [
            ...(linked.get(work.bookId) ?? []),
            { id: c.id, groups: onPages.map((parts) => ({ raw, parts })) },
          ]);
        }
      }
    }

    const linkedCount = [...linked.values()].reduce((n, cs) => n + cs.length, 0);
    console.log(`${ all.length } citations by ${ AUTHORS }: ${ linkedCount } read, `
      + `${ offPage.length } places on no page, ${ unplaced.length } with a known work but no `
      + `place, ${ unknown.length } of no known work`);

    console.log('\nread, by work:');
    for (const [bookId, cs] of [...linked].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${ String(cs.length).padStart(5) }  ${ bookId }`);
    }

    console.log('\nnot linked: places on no page of their work, e.g.:');
    for (const [key, n] of tally(offPage.map((o) => `${ o.bookId }: ${ o.place }`)).slice(0, 25)) {
      console.log(`  ${ String(n).padStart(4) }  ${ key }`);
    }

    console.log('\nknown work, no place read, e.g.:');
    for (const c of unplaced.slice(0, 25)) {
      console.log(`  ${ c.bookId }: ${ JSON.stringify(c.raw.slice(0, 80)) }`);
    }

    console.log('\nno known work, by author and title:');
    for (const [key, n] of tally(unknown).slice(0, 50)) {
      console.log(`  ${ String(n).padStart(4) }  ${ key }`);
    }

    if (DRY_RUN) {
      console.log('\ndry run: nothing saved');
    }
    else {
      for (const [bookId, cs] of linked) {
        const saved = await relinkCitations(db, bookId, cs);
        console.log(`${ bookId }: saved ${ saved.citations } citations (${ saved.groups } places)`);
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
