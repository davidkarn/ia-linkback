import { describe, expect, it } from '@jest/globals';
import type { ActionResultsTbl, AppAction, AppActionStep } from '../actions/app_actions.ts';
import type { Citation, Page } from '../types.ts';
import { importOcredBookActions, startImportActions } from './ocred_book_import.ts';

const queued = { id: '7', title: 'God', author: 'Pohle', archive_url: 'https://archive.org/details/god' };

const page = (pageNumber: number, footnotes: string[]): Page => ({
  pageNumber,
  printedPageNumber: String(pageNumber),
  blocks:            [
    { bbox: [0, 0, 1, 1], label: 'Text', html: '<p>Body</p>', citations: [] },
    ...footnotes.map((html) => ({ bbox: [0, 0, 1, 1] as [number, number, number, number], label: 'Footnote' as const, html, citations: [] })),
  ],
});

const citation = (footnotePage: number, footnoteIdentifier: string): Citation => ({
  source:          { bookId: 'god', footnoteIdentifier, footnotePage },
  referenceBookId: null,
  author:          'Tanquerey',
  title:           'Synopsis',
  location:        '',
  raw:             'Tanquerey, Synopsis',
  locationsCited:  [],
});

// The actions the steps make, running each with these results ("id" -> succeeded)
const run = (steps: AppActionStep[], outcomes: Record<string, boolean>): AppAction[] => {
  const results: ActionResultsTbl = {};
  return steps.flatMap((step) => {
    const action = typeof step === 'function' ? step(results) : step;
    if (action?.id !== undefined) {
      results[action.id] = { id: action.id, success: outcomes[action.id] ?? true, result: null };
    }
    return action === null ? [] : [action];
  });
};

const ids = (actions: AppAction[]) => actions.flatMap((a) => (a.id === undefined ? [] : [a.id]));

describe('startImportActions', () => {
  it('marks the book processingContents', () => {
    expect(startImportActions(queued)).toEqual([{
      cmd:  'modelAction',
      data: { model: 'QueuedBookImports', act: 'setQueuedBookStatus', params: ['7', 'processingContents'] },
    }]);
  });
});

describe('importOcredBookActions', () => {
  const pages     = [page(1, ['<p><sup>1</sup> Tanquerey.</p>']), page(2, [])];
  const extracted = {
    citations:   [citation(1, '1'), citation(2, '4')],
    failedPages: [{ page: 3, error: 'timeout' }],
    insights:    [{ insight: 'Synopsis is by Tanquerey.', score: 2, keywords: ['Tanquerey'] }],
  };
  const steps     = importOcredBookActions(queued, 'god', pages, extracted);

  it('saves the book, then its citations in their footnote blocks, then marks it imported', () => {
    const actions = run(steps, {});
    expect(ids(actions)).toEqual(['saveBook', 'saveCitations', 'markImported']);
    expect(actions.find((a) => a.id === 'saveCitations')).toMatchObject({ data: {
      act:    'replaceExtractedCitations',
      params: ['god', [{ pageNumber: 1, position: 1, citation: citation(1, '1') }], extracted.insights],
    } });
  });

  it('logs the failed pages and the citations with no footnote block', () => {
    const logs = run(steps, {}).filter((a) => a.cmd === 'log').map((a) => a.data[0]);
    expect(logs).toContain('god: page 3 failed: timeout');
    expect(logs).toContain('god: page 2 has no Footnote block for "Tanquerey, Synopsis"');
    expect(logs[logs.length - 1]).toMatchObject({ bookId: 'god', imported: true, unplaced: 1, failedPages: 1 });
  });

  it("doesn't save the citations or mark the book imported when saving the book fails", () => {
    const actions = run(steps, { saveBook: false });
    expect(ids(actions)).toEqual(['saveBook']);
    expect(actions[actions.length - 1]).toMatchObject({ cmd: 'log', data: [{ imported: false }] });
  });

  it("doesn't mark the book imported when saving its citations fails", () => {
    expect(ids(run(steps, { saveCitations: false }))).toEqual(['saveBook', 'saveCitations']);
  });
});
