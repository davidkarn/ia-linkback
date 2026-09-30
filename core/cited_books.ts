// The books an imported book's citations cite: those in the collection already (matched by author
// and title, see core/citation_matching.ts), those queued for import, and the rest, to look for on
// archive.org and queue. Pure functions; cli/commands/find_and_queue_cited_books.command.ts reads
// and saves them and searches archive.org.
import path from 'node:path';
import type { AppActionStep } from '../actions/app_actions.ts';
import { citedTitle, sameAuthor, sameTitle, citationShouldBeSkipped, volumeOf } from './citation_matching.ts';
import { SCHOLSHELF } from './book_files.ts';

type CitationFields = { id: string, author: string, title: string, location: string, reference_book_id: string | null };
type Named          = { title: string, author: string };

// A citation's matches among these works, by author and title: the works it may cite
const matchingWorks = <W extends Named>(works: W[]) => {
  const found = new Map<string, W[]>();

  return (author: string, title: string): W[] => {
    const key = author + '\u0000' + title;
    const hit = found.get(key) ?? works.filter((w) => (
      sameAuthor(author, w.author) && sameTitle(citedTitle(title) || title, w.title)
    ));
    found.set(key, hit);
    return hit;
  };
};

// The citations of a book (not yet pointing at a book) that cite a book in the collection, with
// the book (of several volumes, the one whose volume number matches the citation's), and those that
// cite something neither in the collection nor queued for import: the ones worth looking for.
// Citations with no author or title to go by are among the latter. books: the collection but the
// book itself; queued: the books queued for import but not imported.
export const matchCitedBooks = <C extends CitationFields>(
  citations: C[],
  books: (Named & { id: string })[],
  queued: Named[],
): { referencing: { citationId: string, bookId: string }[], notReferencing: C[] } => {
  const booksMatching  = matchingWorks(books);
  const queuedMatching = matchingWorks(queued);

  const referencing: { citationId: string, bookId: string }[] = [];
  const notReferencing: C[]                                   = [];

  for (const c of citations) {
    if (c.reference_book_id !== null) {
      // linked already
    }
    else if (citationShouldBeSkipped(c.author, c.title)) {
      notReferencing.push(c);
    }
    else {
      const all    = booksMatching(c.author, c.title);
      const volume = volumeOf(c.title) ?? volumeOf(c.location);
      const found  = volume !== null && all.some((b) => volumeOf(b.title) !== null)
        ? all.filter((b) => volumeOf(b.title) === volume)
        : all;

      if (found.length > 0) {
        referencing.push({ citationId: c.id, bookId: found[0]!.id });
      }
      else if (queuedMatching(c.author, c.title).length === 0) {
        notReferencing.push(c);
      }
    }
  }

  return { referencing, notReferencing };
};

// A copy of a cited work found on archive.org
export type ArchiveCopy = {
  archiveUrl: string,
  pdfUrl: string,
  author: string,
  title: string,
};

// What to do with the copies found, one decision per archive.org item (the copies of it found for
// several citations are one): queue it, with its PDF's file name and how many citations found it;
// skip it, when it's queued already (by its item or PDF url) or a book already (by its identifier
// or PDF file name); or fail it, when its PDF url names no .pdf file.
export const planArchiveQueue = (
  copies: ArchiveCopy[],
  queuedUrls: Set<string>,
  bookIds: Set<string>,
): {
  toQueue: (ArchiveCopy & { fileName: string, citations: number })[],
  skipped: { archiveUrl: string, reason: string }[],
  failed: { archiveUrl: string, error: string }[],
} => {
  const byItem = new Map<string, ArchiveCopy[]>();
  for (const copy of copies) {
    byItem.set(copy.archiveUrl, [...(byItem.get(copy.archiveUrl) ?? []), copy]);
  }

  const plan = {
    toQueue: [] as (ArchiveCopy & { fileName: string, citations: number })[],
    skipped: [] as { archiveUrl: string, reason: string }[],
    failed:  [] as { archiveUrl: string, error: string }[],
  };

  // the urls queued, and those this plan queues, so a PDF two items share is queued once
  const queued = new Set(queuedUrls);

  for (const [archiveUrl, [first, ...rest]] of byItem) {
    const identifier = decodeURIComponent(archiveUrl.split('/details/')[1] ?? '');
    const fileName   = new URL(first!.pdfUrl).pathname.split('/').pop() ?? '';

    if (queued.has(archiveUrl) || queued.has(first!.pdfUrl)) {
      plan.skipped.push({ archiveUrl, reason: 'already queued' });
    }
    else if (bookIds.has(identifier) || bookIds.has(fileName.replace(/\.pdf$/i, ''))) {
      plan.skipped.push({ archiveUrl, reason: 'already a book' });
    }
    else if (!fileName.toLowerCase().endsWith('.pdf')) {
      plan.failed.push({ archiveUrl, error: `pdf url has no .pdf file name: ${ first!.pdfUrl }` });
    }
    else {
      plan.toQueue.push({ ...first!, fileName, citations: rest.length + 1 });
      queued.add(archiveUrl).add(first!.pdfUrl);
    }
  }

  return plan;
};

export const actionsForArchivePlan = (plan: {
  toQueue: (ArchiveCopy & { fileName: string, citations: number })[],
  skipped: { archiveUrl: string, reason: string }[],
  failed: { archiveUrl: string, error: string }[],
}): AppActionStep[] => (
  plan.toQueue.flatMap((queueItem, i): AppActionStep[] => [
    {
      id:   'downloadPdf:' + i,
      cmd:  'downloadPdf',
      data: {
        url:       queueItem.pdfUrl,
        localPath: path.join(SCHOLSHELF, queueItem.fileName)
      }
    },
    // queued only once its PDF is downloaded: ocr-queued-books stops at a book without one
    (results) => (
      results['downloadPdf:' + i]?.success
        ? {
            id:   'saveToQueue:' + i,
            cmd:  'modelAction',
            data: {
              model:  'QueuedBookImports',
              act:    'queueBook',
              params: [{
                title:      queueItem.title,
                author:     queueItem.author,
                archiveUrl: queueItem.archiveUrl,
                pdfUrl:     queueItem.pdfUrl
              }]
            }
          }
        : null
    ),
  ])
);
