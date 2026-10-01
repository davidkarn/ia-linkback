// Importing an OCR'd book (see cli/commands/process_ocred_books.command.ts) as actions: claiming it
// from the queue, then saving its pages, the citations extracted from its footnotes (each in its
// footnote block, see placeCitations) and the insights learned, and marking it imported. Each save
// waits on the one before it succeeding, so a book whose pages or citations fail to save isn't
// marked imported. Pure functions; actions/app_actions.ts carries the actions out.
import type { AppAction, AppActionStep, ActionResultsTbl } from '../actions/app_actions.ts';
import type { Citation, Page } from '../types.ts';
import { placeCitations, type ScoredInsight } from './footnote_extraction.ts';

export type QueuedImport = { id: string, title: string, author: string, archive_url: string | null };

// The citations extracted from the book's footnotes, the pages whose request failed, and the
// insights the model has, those saved and those it learned, scored
export type ExtractedCitations = {
  citations: Citation[],
  failedPages: { page: number, error: string }[],
  insights: ScoredInsight[],
};

const log = (...data: unknown[]): AppAction => ({ cmd: 'log', data });

// Whether the action with this id ran and succeeded
const succeeded = (results: ActionResultsTbl, id: string) => results[id]?.success === true;

// Before the slow part (extracting the citations), so no other run imports the book meanwhile
export const startImportActions = (queued: QueuedImport): AppAction[] => [{
  cmd:  'modelAction',
  data: {
    model:  'QueuedBookImports',
    act:    'setQueuedBookStatus',
    params: [queued.id, 'processingContents'],
  },
}];

// bookId: the OCR folder name, surya's key for the book. pages: built from its surya results.
export const importOcredBookActions = (
  queued: QueuedImport, bookId: string, pages: Page[], extracted: ExtractedCitations,
): AppActionStep[] => {
  const { placed, unplaced } = placeCitations(pages, extracted.citations);

  return [
    ...extracted.failedPages.map((f) => log(`${ bookId }: page ${ f.page } failed: ${ f.error }`)),
    {
      id:   'saveBook',
      cmd:  'modelAction',
      data: {
        model:  'Books',
        act:    'saveBook',
        params: [
          { id: bookId, title: queued.title, author: queued.author, url: queued.archive_url },
          pages,
        ],
      },
    },
    (results) => (
      succeeded(results, 'saveBook')
        ? {
            id:   'saveCitations',
            cmd:  'modelAction',
            data: {
              model:  'ExtractedCitations',
              act:    'replaceExtractedCitations',
              params: [bookId, placed, extracted.insights],
            },
          }
        : null
    ),
    ...unplaced.map((c) => log(
      `${ bookId }: page ${ c.source.footnotePage } has no Footnote block for "${ c.raw.slice(0, 60) }"`
    )),
    (results) => (
      succeeded(results, 'saveCitations')
        ? {
            id:   'markImported',
            cmd:  'modelAction',
            data: {
              model:  'QueuedBookImports',
              act:    'markQueuedBookImported',
              params: [queued.id, bookId],
            },
          }
        : null
    ),
    (results) => log({
      bookId,
      imported:    succeeded(results, 'markImported'),
      saved:       results['saveCitations']?.result ?? null,
      unplaced:    unplaced.length,
      failedPages: extracted.failedPages.length,
    }),
  ];
};
