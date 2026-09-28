import { Kysely, sql } from 'kysely';

const PARTS = 8;

// book_pages_to_citations' part values are numbers (book 1, question 2), compared with
// citation_locations.value, an integer: store them as integers too
export async function up(db: Kysely<unknown>): Promise<void> {
  for (let n = 1; n <= PARTS; n++) {
    const column = sql.ref(`citation_part_${ n }_value`);
    await sql`alter table book_pages_to_citations
      alter column ${ column } type integer using ${ column }::integer`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (let n = 1; n <= PARTS; n++) {
    const column = sql.ref(`citation_part_${ n }_value`);
    await sql`alter table book_pages_to_citations
      alter column ${ column } type text using ${ column }::text`.execute(db);
  }
}
