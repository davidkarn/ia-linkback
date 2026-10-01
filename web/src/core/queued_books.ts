import type { QueueStatus } from '../api';

// The statuses in the order a book goes through them (QUEUE_STATUSES in the API's
// core/queued_books.ts)
export const QUEUE_STATUSES: QueueStatus[] = [
  'pending', 'queued', 'inProgress', 'processingContents', 'imported', 'importedAndCrawled', 'complete',
];

// A queue status as the admin dashboard shows it: what the book is waiting for
export const STATUS_LABELS: Record<QueueStatus, string> = {
  pending:            'Pending',
  queued:             'Queued for OCR',
  inProgress:         "OCR'd, to import",
  processingContents: 'Importing',
  imported:           'Imported, to crawl',
  importedAndCrawled: 'Crawled',
  complete:           'Complete',
};
