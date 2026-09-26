import { Kysely, sql } from 'kysely';

// The location types CitationLocation (types.ts) allows, including those the LLM extraction in
// spider/process_ocred_books.ts produces.
const OLD_TYPES = ['page', 'chapter', 'book', 'volume', 'question', 'article', 'lecture', 'position', 'verse'];
const NEW_TYPES = [
  ...OLD_TYPES, 'part', 'bekker number', 'line', 'stephanus number', 'objection', 'sed contra', 'respondeo', 'ad',
  'distinction',
];

const quoted_list = (values: string[]) => sql.join(values.map(v => sql.lit(v)));

const setTypes = async (db: Kysely<any>, types: string[]) => {
  await sql`ALTER TABLE citation_locations DROP CONSTRAINT citation_locations_type_check`.execute(db);
  await sql`ALTER TABLE citation_locations ADD CONSTRAINT citation_locations_type_check CHECK (type in (${quoted_list(types)}))`.execute(db);
};

export async function up(db: Kysely<any>): Promise<void> {
  await setTypes(db, NEW_TYPES);
}

// Fails if rows with the new types exist: delete or convert them first.
export async function down(db: Kysely<any>): Promise<void> {
  await setTypes(db, OLD_TYPES);
}
