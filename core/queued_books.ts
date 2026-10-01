// The queue of books to import (queued_book_imports), as the admin dashboard shows it. Pure
// functions; model/queued_book_imports.ts reads the queue.
import type { QueuedBookImportsTable } from '../api/database.ts';

export type QueueStatus = QueuedBookImportsTable['status'];

// The statuses in the order a book goes through them: found on archive.org and queued, OCR'd
// (inProgress), imported (processingContents, then imported), its citations crawled. pending is
// set by nothing in the pipeline, and comes first.
export const QUEUE_STATUSES: QueueStatus[] = [
  'pending', 'queued', 'inProgress', 'processingContents', 'imported', 'importedAndCrawled', 'complete',
];

// The books waiting at the front of the queue, the next to be OCR'd
export const NEXT_UP_STATUS: QueueStatus = 'queued';

// How many books have each status, every status in QUEUE_STATUSES order, those none have as 0
export const statusCounts = (
  rows: { status: QueueStatus, count: number }[]
): { status: QueueStatus, count: number }[] => {
  const counts = new Map(rows.map((r) => [r.status, r.count]));
  return QUEUE_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));
};
