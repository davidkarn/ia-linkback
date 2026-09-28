import { Kysely } from 'kysely';

// Finding a citation's location groups, and a group's locations: matching citations to pages by
// book_pages_to_citations (model/page_insights.ts) reads both for every citation of a book
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createIndex('citation_groups_citation_id_idx')
    .on('citation_groups').column('citation_id').execute();
  await db.schema.createIndex('citation_locations_citation_group_id_idx')
    .on('citation_locations').column('citation_group_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('citation_locations_citation_group_id_idx').execute();
  await db.schema.dropIndex('citation_groups_citation_id_idx').execute();
}
