// Run database migrations.
//
// Usage (from src/):  DATABASE_URL=postgres://user:pass@localhost:5432/references npx tsx migrate.ts [up|down|latest]
//   latest (default)  apply every pending migration
//   up                apply the next pending migration
//   down              roll back the most recent migration
import fs from 'node:fs/promises';
import path from 'node:path';
import { Kysely, PostgresDialect } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { Pool } from 'pg';

const main = async () => {
  const direction = process.argv[2] ?? 'latest';
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const db = new Kysely<any>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
  });
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: path.join(import.meta.dirname, 'migrations') }),
  });

  const { error, results } = await (
    direction === 'down' ? migrator.migrateDown()
      : direction === 'up' ? migrator.migrateUp()
      : migrator.migrateToLatest()
  );

  for (const r of results ?? []) console.log(`${r.status.padEnd(9)} ${r.migrationName} (${r.direction})`);
  if (!results?.length) console.log('nothing to do');
  await db.destroy();

  if (error) {
    console.error('migration failed:', error);
    process.exit(1);
  }
};

main();
