// Consolidate footnote_extraction_insights with an LLM, merging insights that say the same or
// overlapping things, in groups that share keywords, a request per group (see
// core/insight_consolidation.ts). A group's insights aren't replaced when one of them would be
// lost. Needs OPENROUTER_KEY.
//   npm run cli -- consolidate-footnote-insights
import { Inject } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Command, CommandRunner } from 'nest-commander';
import { DB } from '../../api/database.module.ts';
import type { Database } from '../../api/database.ts';
import {
  checkConsolidation, consolidationGroups, CONSOLIDATE_PROMPT, CONSOLIDATED_FORMAT,
  insightConsolidationActions, needsConsolidation, unconsolidated,
  type ConsolidatedInsight, type Insight,
} from '../../core/insight_consolidation.ts';
import { makeOpenRouterRequest, parseJsonResponse } from '../../lib/open_router.ts';
import { FootnoteExtractionInsightQueries } from '../../model/footnote_extraction_insights.ts';
import { executeActions } from '../../actions/app_actions.ts';

@Command({
  name:        'consolidate-footnote-insights',
  description: 'Merge footnote_extraction_insights that say the same or overlapping things',
})
export class ConsolidateFootnoteInsightsCommand extends CommandRunner {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {
    super();
  }

  async run(): Promise<void> {
    const groups = consolidationGroups(await FootnoteExtractionInsightQueries.findInsights(this.db));

    // a group at a time, each saved before the next is sent
    for (const [i, insights] of groups.entries()) {
      console.log(`\ngroup ${ i + 1 } of ${ groups.length }: ${ insights.length } insights`);
      const { consolidated, missingIds } = await this.consolidate(insights);

      await executeActions(
        this.db,
        insightConsolidationActions(insights, consolidated, missingIds)
      );
    }
  }

  private async consolidate(insights: Insight[]) {
    if (!needsConsolidation(insights)) {
      return { consolidated: unconsolidated(insights), missingIds: [] };
    }
    else {
      const response = await makeOpenRouterRequest([
        { role: 'system', content: CONSOLIDATE_PROMPT },
        { role: 'user', content: JSON.stringify(insights) },
      ], CONSOLIDATED_FORMAT);

      const { insights: consolidated } = parseJsonResponse<{ insights: ConsolidatedInsight[] }>(response);

      return checkConsolidation(insights, consolidated);
    }
  }
}
