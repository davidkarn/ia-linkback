import type { QueueStatus } from '../api';

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
