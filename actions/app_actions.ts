import fs from 'node:fs/promises';
import path from 'node:path';
import type { Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import { downloadPdf } from "../lib/pdf_download.ts";
import { QueuedBookImportsActions } from "../model/queued_book_imports.js";
import { FootnoteExtractionInsightActions } from '../model/footnote_extraction_insights.ts';
import { BookActions } from '../model/books.ts';
import { ExtractedCitationActions } from '../model/extracted_citations.ts';
import { CopyrightStatusCheckActions } from '../model/copyright_status_checks.ts';

const modelActions = {
  QueuedBookImports:          QueuedBookImportsActions,
  FootnoteExtractionInsights: FootnoteExtractionInsightActions,
  Books:                      BookActions,
  ExtractedCitations:         ExtractedCitationActions,
  CopyrightStatusChecks:      CopyrightStatusCheckActions,
};

// A function's parameters after the first (the db the executor passes itself)
type OmitFirstParameter<T> =
  T extends (first: never, ...rest: infer P) => unknown ? P : never;

type ModelActionDatas = {
  [K in keyof (typeof modelActions)]: {
    [AK in keyof (typeof modelActions)[K]]: {
      model: K,
      act: AK,
      params: OmitFirstParameter<(typeof modelActions)[K][AK]>
    }
  }[keyof (typeof modelActions)[K]]
}[keyof (typeof modelActions)];

type ModelAction = {
  cmd: 'modelAction',
  data: ModelActionDatas
};

type DownloadAction = {
  cmd: 'downloadPdf',
  data: {url: string, localPath: string}
};

type LogAction = {
  cmd: 'log',
  data: unknown[]
};

export type AppAction = (DownloadAction | ModelAction | LogAction) & {id?: string};
export type ActionResult = {
  id: string,
  success: boolean,
  errorMessage?: string,
  errorStack?: string,
  result: unknown,
};

export type ActionResultsTbl = {[id: string]: ActionResult};

// An action, or a function of the results of the actions before it that makes one, or null to
// skip it (an action that depends on one that failed)
export type AppActionStep = AppAction | ((results: ActionResultsTbl) => AppAction | null);

export const executeActions = async(
  db: Kysely<Database>,
  actions: AppActionStep[]
) => {
  const results: ActionResultsTbl = {};
  for (const action of actions) {
    const executable = typeof action === "function" ? action(results) : action;

    if (executable === null) {
      continue;
    }

    let errorMessage: string | undefined = undefined;
    let errorStack: string | undefined   = undefined;
    let success                          = true;
    let result: unknown                  = null;

    try {
      result = await executeAction(db, executable);
    }
    catch (e) {
      console.error(e, 'error occured while running action', executable);
      success = false;

      if (e instanceof Error) {
        errorMessage = e.message;
        errorStack   = e.stack;
      }
    }

    if (executable.id) {
      results[executable.id] = {
        id:     executable.id,
        result: result,
        success,
        ...(errorMessage === undefined ? {} : { errorMessage }),
        ...(errorStack === undefined ? {} : { errorStack }),
      };
    }
  }

  return results;
};

type ModelActionFn = (db: Kysely<Database>, ...params: unknown[]) => Promise<unknown>;

// The model action a ModelAction names. Its params are checked against the action where the
// ModelAction is made (ModelActionDatas); looking the action up by its names loses which model
// goes with which params, so the lookup is typed loosely.
const modelActionFor = (data: ModelActionDatas): ModelActionFn => (
  (modelActions[data.model] as unknown as Record<string, ModelActionFn>)[data.act]!
);

export const executeAction = async(
  db: Kysely<Database>,
  action: AppAction
): Promise<unknown> => {
  if (action.cmd === 'downloadPdf') {
    const file = action.data.localPath;
    const size = await fs.stat(file).then((st) => st.size, () => 0);

    if (size === 0) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await downloadPdf(action.data.url, file);
    }

    return true;
  }
  else if (action.cmd === 'modelAction') {
    return await modelActionFor(action.data)(db, ...action.data.params);
  }
  else if (action.cmd === 'log') {
    console.log(...action.data);
    return true;
  }
};
