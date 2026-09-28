import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Kysely, PostgresDialect, type LogEvent } from 'kysely';
import { Pool } from 'pg';
import type { Database } from './database';

// Injection token for the shared Kysely instance: `@Inject(DB) private readonly db: Kysely<Database>`
export const DB = Symbol('DB');

const logger = new Logger('Kysely');

// Parameters longer than this (page HTML, say) are cut short in the log
const MAX_PARAM = 80;

const showParam = (p: unknown) => {
  const text = typeof p === 'string' ? JSON.stringify(p) : String(p);
  return text.length > MAX_PARAM ? text.slice(0, MAX_PARAM) + '…' : text;
};

// Failed queries are always logged; every query, with how long it took, when LOG_QUERIES is set
// (npm run dev sets it)
const logQuery = (event: LogEvent) => {
  const sql    = event.query.sql.replace(/\s+/g, ' ').trim();
  const params = event.query.parameters.length > 0
    ? ` [${ event.query.parameters.map(showParam).join(', ') }]` : '';
  const took   = `${ event.queryDurationMillis.toFixed(1) }ms`;

  if (event.level === 'error') {
    logger.error(`${ took } ${ sql }${ params }: ${ String(event.error) }`);
  }
  else if (process.env.LOG_QUERIES) {
    logger.log(`${ took } ${ sql }${ params }`);
  }
};

@Global()
@Module({
  providers: [{
    provide:    DB,
    useFactory: () => {
      if (!process.env.DATABASE_URL) {throw new Error('DATABASE_URL is not set');}
      return new Kysely<Database>({
        dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
        log:     logQuery,
      });
    },
  }],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  async onApplicationShutdown() {
    await this.db.destroy();
  }
}
