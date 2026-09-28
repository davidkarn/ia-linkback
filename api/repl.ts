import dotenv from 'dotenv';
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from 'pg';
import { citedCountsByPage } from '../model/page_insights.ts';

dotenv.config();

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL
    })
  }),
});

const main = async() => {
  const bookId = 'summa-theologiae or true';
  console.log(await citedCountsByPage(db, bookId));
};

main();

