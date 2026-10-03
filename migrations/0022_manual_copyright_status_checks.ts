import { Kysely, sql } from 'kysely';

// Copyright status checks set by hand, from the admin panel, rather than
// judged by an LLM (check-copyright): a book's latest check is its status,
// so setting it adds a check with manual true.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table copyright_status_check
    add column manual boolean not null default false`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table copyright_status_check drop column manual`.execute(db);
}
