import { Module } from '@nestjs/common';
import { DatabaseModule } from '../api/database.module.ts';
import { ConsolidateFootnoteInsightsCommand } from './commands/consolidate_footnote_insights.command.ts';
import { FindAndQueueCitedBooksCommand } from './commands/find_and_queue_cited_books.command.ts';
import { OcrQueuedBooksCommand } from './commands/ocr_queued_books.command.ts';
import { ProcessOcredBooksCommand } from './commands/process_ocred_books.command.ts';
import { SaveCoverCommand } from './commands/save_cover.command.ts';

// The commands of cli/main.ts, sharing the API's database connection
@Module({
  imports:   [DatabaseModule],
  providers: [
    OcrQueuedBooksCommand,
    ProcessOcredBooksCommand,
    FindAndQueueCitedBooksCommand,
    ConsolidateFootnoteInsightsCommand,
    SaveCoverCommand,
  ],
})
export class CliModule {}
