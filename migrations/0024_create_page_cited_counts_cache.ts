import { Kysely, sql } from 'kysely';

// The citations of each of a book's pages counted (GET /books/{bookId}/pageOrder), cached: counting
// them for the Bible, which most citations cite, takes most of a second. counts maps each cited
// page's number to its count. Cleared whenever citations, page citation parts or copyright
// statuses change (see model/page_cited_counts_cache.ts); deleted with its book.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create table page_cited_counts_cache (
    book_id text primary key references books(id) on delete cascade,
    counts jsonb not null,
    created_at timestamptz not null default now()
  )`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table page_cited_counts_cache`.execute(db);
}
