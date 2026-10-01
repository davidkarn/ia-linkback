// Judge how likely each book not checked yet is to be in the public domain in the US, with
// OpenRouter, a batch of books a request (see core/copyright_status.ts), and save each judgement to
// copyright_status_check. Books the model gives no answer for, or whose request fails, are left
// for the next run. Needs OPENROUTER_KEY.
//   npm run cli -- check-copyright [--limit 50] [--dry-run]
import { Inject } from '@nestjs/common';
import { setTimeout } from 'node:timers/promises';
import type { Kysely } from 'kysely';
import { Command, CommandRunner, Option } from 'nest-commander';
import { executeActions } from '../../actions/app_actions.ts';
import { DB } from '../../api/database.module.ts';
import type { Database } from '../../api/database.ts';
import {
  checkCopyrightResults, COPYRIGHT_FORMAT, copyrightCheckActions, copyrightPrompt, copyrightRequest,
  publicDomainCutoffYear, type BookToCheck, type CopyrightCheck,
} from '../../core/copyright_status.ts';
import { chunked } from '../../lib/lib.ts';
import { makeOpenRouterRequest, parseJsonResponse } from '../../lib/open_router.ts';
import { CopyrightStatusCheckQueries } from '../../model/copyright_status_checks.ts';

// Books a request: enough to keep the requests few, few enough for the model to give each its due
const BATCH_SIZE = 20;

// OpenRouter allows 20 requests a minute
const REQUEST_INTERVAL_MS = 3200;

type Options = { limit?: number, dryRun?: boolean };

@Command({
  name:        'check-copyright',
  description: 'Judge whether the books not checked yet are in the public domain, with OpenRouter',
})
export class CheckCopyrightCommand extends CommandRunner {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {
    super();
  }

  @Option({ flags: '-l, --limit <count>', description: 'check at most this many books' })
  parseLimit(value: string): number {
    const limit = Number(value);

    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('--limit must be a whole number, 1 or more');
    }
    else {
      return limit;
    }
  }

  @Option({ flags: '--dry-run', description: 'show the judgements without saving them' })
  parseDryRun(): boolean {
    return true;
  }

  async run(_params: string[], options: Options = {}): Promise<void> {
    const books   = await CopyrightStatusCheckQueries.findBooksWithoutCheck(this.db, options.limit);
    const prompt  = copyrightPrompt(publicDomainCutoffYear(new Date()));
    const batches = chunked(books, BATCH_SIZE);

    console.log(`${ books.length } books to check, in ${ batches.length } requests`
      + (options.dryRun ? ' (dry run: nothing saved)' : ''));

    for (const [i, batch] of batches.entries()) {
      try {
        const response            = await makeOpenRouterRequest([
          { role: 'system', content: prompt },
          { role: 'user', content: copyrightRequest(batch) },
        ], COPYRIGHT_FORMAT);
        const { results }         = parseJsonResponse<{ results: CopyrightCheck[] }>(response);
        const { checks, missing } = checkCopyrightResults(batch, results);
        const actions             = copyrightCheckActions(batch, checks, missing);

        await executeActions(
          this.db, options.dryRun ? actions.filter((a) => a.cmd === 'log') : actions
        );
      }
      catch (e) {
        this.reportFailed(batch, e);
      }

      if (i < batches.length - 1) {
        await setTimeout(REQUEST_INTERVAL_MS);
      }
    }
  }

  private reportFailed(batch: BookToCheck[], e: unknown) {
    console.error(`request failed, ${ batch.length } books left for the next run: `
      + `${ (e as Error).message ?? String(e) }`);
  }
}
