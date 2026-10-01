import { Kysely, sql } from 'kysely';

// How likely each book is to be in the public domain (in the US), as judged by an LLM from its
// title, author and what it knows of them (see core/copyright_status.ts and the check-copyright
// command), with notes on why. A book can be checked again: each check is a row of its own.
// updated_at is kept by a trigger. Deleted with its book.
const STATUSES = [
  'likely_public_domain', 'probably_public_domain', 'doubtful_public_domain', 'likely_copyrighted',
];

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create table copyright_status_check (
    id bigserial primary key,
    book_id text not null references books(id) on delete cascade,
    copyright_status text not null
      constraint copyright_status_check_status_check
      check (copyright_status in (${ sql.join(STATUSES.map((s) => sql.lit(s))) })),
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`.execute(db);

  await sql`create index copyright_status_check_book_id_idx on copyright_status_check (book_id)`
    .execute(db);

  await sql`create function copyright_status_check_set_updated_at() returns trigger as $$
    begin
      new.updated_at = now();
      return new;
    end
    $$ language plpgsql`.execute(db);

  await sql`create trigger copyright_status_check_updated_at
    before update on copyright_status_check
    for each row execute function copyright_status_check_set_updated_at()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table copyright_status_check`.execute(db);
  await sql`drop function copyright_status_check_set_updated_at()`.execute(db);
}
