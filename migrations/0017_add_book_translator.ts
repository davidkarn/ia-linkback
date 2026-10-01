import { Kysely, sql } from 'kysely';

// Who translated a book, for books read in translation (Aristotle's works, say); null when it
// isn't a translation or the importer doesn't know
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table books add column translator text`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table books drop column translator`.execute(db);
}
