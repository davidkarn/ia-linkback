import util from 'util';
import fs from 'node:fs/promises';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../api/database';
import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config()

const db = new Kysely<Database>({
    dialect: new PostgresDialect({
        pool: new Pool({
            connectionString: process.env.DATABASE_URL
        })
    }),
});

const getNextBook = () => (
    db.selectFrom('queued_book_imports')
        .selectAll()
        .where('status', '=', 'inProgress')
        .orderBy('id')
        .limit(1)
        .executeTakeFirst()
);

const getBookContents = (book: Database.QueuedBookImportsTable) => {
  const fileName = path.basename(book.pdf_url, path.extname(book.pdf_url));
  return fs.readFile(
    '../scholshelf/results/surya/' + fileName + '/results.json',
    { encoding: 'utf8' }
  ).then(data => JSON.parse(data));
}

const log = (...items: any[]) => console.log(util.inspect(items, { depth: null }));

type ORMessage = {
  role: 'user',
  content: string
};

const makeOpenRouterRequest = (msgs: ORMessage[]) => (
  fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.OPENROUTER_KEY,
      'HTTP-Referer': 'https://webdever.net',
      'X-Title': 'Webdever',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o',
      messages: msgs,
    }),
  })
    .then(result => result.json())
);


getNextBook().then(book => getBookContents(book)).then(contents => log(contents));
