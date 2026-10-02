import { Kysely, sql } from 'kysely';

// Places in works of alternating prose and verse (Boethius's Consolation of Philosophy, cited "iii,
// pros. 10", "v, metr. 2"): a book's prose sections and its metres (its poems), as citation_groups
// part types besides the others (see 0010_citation_group_parts.ts)
const PARTS = 8;

const TYPES = [
  'page', 'chapter', 'book', 'volume', 'question', 'article', 'lecture', 'position', 'verse', 'part',
  'bekker number', 'line', 'stephanus number', 'objection', 'sed contra', 'respondeo', 'ad', 'distinction',
];
const ADDED = ['prose', 'metre'];

const replaceChecks = async(db: Kysely<unknown>, types: string[]) => {
  for (let n = 1; n <= PARTS; n++) {
    const name = sql.ref(`citation_groups_part${ n }_type_check`);
    await sql`alter table citation_groups
      drop constraint ${ name },
      add constraint ${ name } check (${ sql.ref(`part${ n }_type`) } in (${
  sql.join(types.map((t) => sql.lit(t))) }))`.execute(db);
  }
};

export async function up(db: Kysely<unknown>): Promise<void> {
  await replaceChecks(db, [...TYPES, ...ADDED]);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await replaceChecks(db, TYPES);
}
