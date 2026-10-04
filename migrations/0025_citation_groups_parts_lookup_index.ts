import { Kysely, sql } from 'kysely';

// Finding the citation groups with given parts (book 47, chapter 3): the citations of a page, from
// its book_pages_to_citations rows (see citesPage in model/citations.ts). Without it, a page's
// citations were found by checking every citation of its book: 98,879 for the Bible.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create index citation_groups_parts_lookup_idx
    on citation_groups (part1_type, part1_value, part2_type, part2_value)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index citation_groups_parts_lookup_idx`.execute(db);
}
