// The queue of books to import (queued_book_imports): found on archive.org by
// find-and-queue-cited-books, OCR'd by ocr-queued-books, imported by process-ocred-books. A book
// moves through the statuses queued -> inProgress (OCR'd) -> processingContents -> imported ->
// importedAndCrawled (its citations linked and the books it cites queued).
import type { Kysely, Selectable } from 'kysely';
import type { Database, QueuedBookImportsTable } from '../api/database.ts';

export type QueuedBook = Selectable<QueuedBookImportsTable>;
export type QueueStatus = QueuedBookImportsTable['status'];

// The first book queued with this status, if any
const findNextQueuedBook = (db: Kysely<Database>, status: QueueStatus) => (
  db.selectFrom('queued_book_imports')
    .selectAll()
    .where('status', '=', status)
    .orderBy('id')
    .limit(1)
    .executeTakeFirst()
);

const setQueuedBookStatus = (db: Kysely<Database>, id: string, status: QueueStatus) => (
  db.updateTable('queued_book_imports')
    .set({ status })
    .where('id', '=', id)
    .execute()
);

// A queued book imported as the book bookId
const markQueuedBookImported = (db: Kysely<Database>, id: string, bookId: string) => (
  db.updateTable('queued_book_imports')
    .set({ imported_book_id: bookId, status: 'imported' })
    .where('id', '=', id)
    .execute()
);

// The titles and authors of the books queued but not imported yet
const findQueuedBookNames = (db: Kysely<Database>) => (
  db.selectFrom('queued_book_imports')
    .select(['title', 'author'])
    .where('status', 'not in', ['imported', 'importedAndCrawled', 'complete'])
    .execute()
);

// Every archive.org item and PDF url queued, whatever its status
const findQueuedUrls = async(db: Kysely<Database>): Promise<Set<string>> => {
  const rows = await db.selectFrom('queued_book_imports')
    .select(['archive_url', 'pdf_url'])
    .execute();

  return new Set(rows.flatMap((r) => [r.archive_url, r.pdf_url]).filter((u): u is string => u !== null));
};

// Queue a book found on archive.org for OCR. Returns its id.
const queueBook = async(
  db: Kysely<Database>,
  book: { title: string, author: string, archiveUrl: string, pdfUrl: string },
): Promise<string> => {
  const row = await db.insertInto('queued_book_imports')
    .values({
      title:       book.title,
      author:      book.author,
      archive_url: book.archiveUrl,
      pdf_url:     book.pdfUrl,
      status:      'queued',
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return row.id;
};

export const QueuedBookImportsQueries = { findNextQueuedBook, findQueuedBookNames, findQueuedUrls };
export const QueuedBookImportsActions = { queueBook, setQueuedBookStatus, markQueuedBookImported };
