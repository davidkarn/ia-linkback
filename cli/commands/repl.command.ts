// An interactive REPL with the database and the models at hand, for looking into the data and
// trying queries: `await` works at the top level, and the history is kept between sessions.
//   npm run repl            (or: npm run cli -- repl)
//
//   tl> await BookQueries.findBookIds(db)
//   tl> table(await query("select status, count(*) from queued_book_imports group by 1"))
//   tl> const { volumesOf } = await load('core/volumes')
import { Inject } from '@nestjs/common';
import fs from 'node:fs';
import fsprom from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import repl from 'node:repl';
import util from 'node:util';
import { sql, type Kysely } from 'kysely';
import { Command, CommandRunner } from 'nest-commander';
import { executeAction, executeActions } from '../../actions/app_actions.ts';
import { DB } from '../../api/database.module.ts';
import type { Database } from '../../api/database.ts';
import { makeOpenRouterRequest } from '../../lib/open_router.ts';
import { FootnoteExtractionInsightQueries } from '../../model/footnote_extraction_insights.ts';
import { QueuedBookImportsQueries } from '../../model/queued_book_imports.ts';
import { suryaResultsPath } from '../../core/book_files.ts';
import { build_pages } from '../../core/book_pages.ts';
import { footnoteHtml, FOOTNOTES_FORMAT, footnotesPrompt, insightsForPrompt } from '../../core/footnote_extraction.ts';
import { log } from '../../lib/lib.ts';

// src/, which load() resolves module paths against
const ROOT         = path.join(import.meta.dirname, '../..');
const MODEL_DIR    = path.join(ROOT, 'model');
const HISTORY_FILE = path.join(os.homedir(), '.tela_lucis_repl_history');

// The model modules: every .ts file in model/ but tests (and editor backups and autosaves)
const modelFiles = () => fs.readdirSync(MODEL_DIR).filter((f) => /^[a-z_]+\.ts$/.test(f));

@Command({
  name:        'repl',
  description: 'Start a REPL with the database (db, sql) and every model loaded',
})
export class ReplCommand extends CommandRunner {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {
    super();
  }

  async run(): Promise<void> {
    const db = this.db;
    // every export of every model: their Queries, Actions, Scopes and Selectors, and the plain
    // functions of the older ones
    const models = Object.assign({}, ...await Promise.all(modelFiles().map((f) => (
      import(path.join(MODEL_DIR, f))
    )))) as Record<string, unknown>;

    const helpers = {
      db,
      sql,
      executeAction:  (action: Parameters<typeof executeAction>[1]) => executeAction(db, action),
      executeActions: (actions: Parameters<typeof executeActions>[1]) => (
        executeActions(db, actions)
      ),
      // the rows of a raw SQL query: query("select * from books where id = $1", ['x']) isn't
      // supported, so interpolate with sql`...` for values: (await sql`...`.execute(db)).rows
      query:          async(text: string) => (await sql.raw(text).execute(db)).rows,
      table:          (rows: unknown) => console.table(rows),
      // a module by its path from src/: await load('core/volumes')
      load:           (modulePath: string) => (
        import(path.join(ROOT, modulePath.replace(/\.ts$/, '') + '.ts'))
      ),
      // an object printed in full, however deep
      show:           (value: unknown) => (
        console.log(util.inspect(value, { depth: null, colors: true }))
      ),
    };

    console.log('Tela Lucis REPL. In scope:');
    console.log('  db, sql, query(text), table(rows), show(value), load(path), executeAction(s)');
    console.log('  ' + Object.keys(models).sort().join(', '));
    console.log('await works at the top level. .exit or Ctrl-D to leave.\n');

    const server = repl.start({ prompt: 'tl> ', useGlobal: false });
    Object.assign(server.context, models, helpers);
    server.setupHistory(HISTORY_FILE, () => undefined);

    // The REPL exits at the end of its input (Ctrl-D, or piped input running out) without waiting
    // for the lines still being evaluated, whose queries would then fail as the database
    // connection closes: count the evaluations in progress, and finish when the last is done
    let evaluating     = 0;
    let exited         = false;
    let finish         = () => {};
    const defaultEval  = server.eval;
    const finishIfDone = () => {
      if (exited && evaluating === 0) {
        finish();
      }
    };

    // the REPL's own eval, which awaits a line's top-level await before calling back
    const countingEval: repl.REPLEval        = function(
      this: repl.REPLServer, code, context, file, done
    ) {
      evaluating++;
      defaultEval.call(this, code, context, file, (err, result) => {
        evaluating--;
        done(err, result);
        finishIfDone();
      });
    };
    (server as { eval: repl.REPLEval }).eval = countingEval;

    await this.tryQuery('openai/gpt-4o-mini');
    //    await this.tryQuery('qwen/qwen3-235b-a22b-thinking-2507');

    await new Promise<void>((resolve) => {
      finish = resolve;
      server.on('exit', () => {
        exited = true;
        finishIfDone();
      });
    });
  }

  public async tryQuery(model: string) {
    
    const queued = await QueuedBookImportsQueries.findNextQueuedBook(this.db, 'inProgress');

    const surya: SuryaBook = JSON.parse(await fsprom.readFile(suryaResultsPath(queued.pdf_url), 'utf8'));
    
    const [bookId, suryaPages] = Object.entries(surya)[0] ?? [];

    const pages     = build_pages(suryaPages).pages;    
    const footnotePages  = pages.filter((p) => p.blocks.some((b) => b.label === 'Footnote'));
    
    let insights: ScoredInsight[] = await FootnoteExtractionInsightQueries.findInsights(this.db);
    const page = footnotePages[5];
    console.log('running', 'asfd');
    let result;
    try {
     result = await makeOpenRouterRequest([
      { role: 'system', content: footnotesPrompt(insightsForPrompt(insights)) },
      { role: 'user', content: footnoteHtml(page) },
    ], FOOTNOTES_FORMAT, model);
    }
    catch (e) {
      console.error('issue');
      console.error(e);
    }

    log({result});
    return result;
  }
}
