import { Kysely, sql } from 'kysely';

// When each queued import was created and last updated. updated_at is kept by a trigger, so every
// change counts, whoever makes it (the CLI commands, the model, by hand). Imports queued before
// this have no history: both are set to when it ran.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table queued_book_imports
    add column created_at timestamptz not null default now(),
    add column updated_at timestamptz not null default now()`.execute(db);

  await sql`create function queued_book_imports_set_updated_at() returns trigger as $$
    begin
      new.updated_at = now();
      return new;
    end
    $$ language plpgsql`.execute(db);

  await sql`create trigger queued_book_imports_updated_at
    before update on queued_book_imports
    for each row execute function queued_book_imports_set_updated_at()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop trigger queued_book_imports_updated_at on queued_book_imports`.execute(db);
  await sql`drop function queued_book_imports_set_updated_at()`.execute(db);
  await sql`alter table queued_book_imports drop column created_at, drop column updated_at`.execute(db);
}
