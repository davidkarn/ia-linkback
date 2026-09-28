// Point citations of the Summa Theologiae in other books at the imported Summa (book
// "summa-theologiae", see book_importers/summa_thml.ts), with their locations read again from their raw
// text as book, question and article (core/summa_citations.ts). Those are the parts
// book_pages_to_citations gives each Summa page (book_importers/summa_thml_link.ts), so afterwards
// the citations count on the pages they cite.
//
// A citation of the Summa is one titled "Summa Theologica" by Thomas Aquinas. Its old locations are
// replaced; one whose raw text gives no book and question is left as it was, and listed. "Ibid."
// takes its part (and question) from the Summa citation before it in the same book.
//
// Usage (from src/):
//   npx tsx book_importers/summa_update_incoming_citations.ts [--dry-run]
// DATABASE_URL comes from the environment or .env. Re-running reads the raw text again.
import 'dotenv/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../api/database.ts';
import { SUMMA_BOOK_ID } from '../core/summa_thml.ts';
import type { PlaceGroup } from '../core/citation_groups.ts';
import {
  isIbid, isSummaCitation, lastPlace, parseSummaCitation, type SummaPlace,
} from '../core/summa_citations.ts';
import { findCitationsFromOtherBooks, relinkCitations } from '../model/incoming_citations.ts';
import { citedCountsByPage } from '../model/page_insights.ts';
import { log } from '../lib/lib.ts';

const DRY_RUN = process.argv.includes('--dry-run');

const showGroups = (groups: PlaceGroup[]) => (
  groups.map((g) => g.parts.map((p) => `${ p.type } ${ p.value }`).join(', ')).join(' | ')
);

const main = async() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
  });

  try {
    const summa = await db.selectFrom('books')
      .select('id')
      .where('id', '=', SUMMA_BOOK_ID)
      .executeTakeFirst();
    if (!summa) {
      throw new Error(`no book ${ SUMMA_BOOK_ID }: import it first (book_importers/summa_thml.ts)`);
    }

    const all = await findCitationsFromOtherBooks(db, SUMMA_BOOK_ID);

    const parsed: { id: string, raw: string, groups: PlaceGroup[] }[] = [];
    const unparsed: { id: string, raw: string }[]                     = [];
    // the last place cited in each book, for "Ibid." to refer back to
    let previous: { bookId: string, place: SummaPlace | undefined } | undefined;

    for (const c of all.filter((c) => isSummaCitation(c.title, c.author))) {
      const before = previous?.bookId === c.source_book_id ? previous.place : undefined;
      const groups = parseSummaCitation(c.raw, isIbid(c.raw) ? before : undefined);

      if (groups.length > 0) {
        // each place's raw label is the citation's location as extracted, or else its raw text
        const raw = c.location || c.raw;
        parsed.push({ id: c.id, raw: c.raw, groups: groups.map((parts) => ({ raw, parts })) });
        previous = { bookId: c.source_book_id, place: lastPlace(groups) };
      }
      else {
        unparsed.push({ id: c.id, raw: c.raw });
      }
    }

    const places = parsed.reduce((n, c) => n + c.groups.length, 0);
    console.log(`${ parsed.length + unparsed.length } citations of the Summa: ${ parsed.length } read `
      + `(${ places } places), ${ unparsed.length } left as they were`);
    for (const c of parsed.slice(0, 5)) {
      console.log(`  ${ JSON.stringify(c.raw.slice(0, 60)) } -> ${ showGroups(c.groups) }`);
    }
    console.log(`not read (${ unparsed.length }), e.g.:`);
    for (const c of unparsed.slice(0, 40)) {
      console.log(`  ${ JSON.stringify(c.raw.slice(0, 100)) }`);
    }

    if (DRY_RUN) {
      log(parsed);
      console.log('dry run: nothing saved');
    }
    else {
      const saved = await relinkCitations(db, SUMMA_BOOK_ID, parsed);
      const pages = await citedCountsByPage(db, SUMMA_BOOK_ID);
      console.log(`saved ${ saved.citations } citations (${ saved.groups } places); `
        + `${ pages.size } Summa pages are now cited`);
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
