import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from './database';

// Injection token for the shared Kysely instance: `@Inject(DB) private readonly db: Kysely<Database>`
export const DB = Symbol('DB');

@Global()
@Module({
  providers: [{
    provide: DB,
    useFactory: () => {
      if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
      return new Kysely<Database>({
        dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
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
