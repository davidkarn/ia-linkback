import util from 'util';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import type { Selectable } from 'kysely';
import type { CitationsTable, Database, QueuedBookImportsTable } from '../api/database.ts';
import { citedTitle, sameAuthor, sameTitle, skipCitation, volumeOf } from '../lib/citation_matching.js';
import { searchArchive } from '../lib/archive_search.js';
import dotenv from 'dotenv';
import type { Book } from '../types.js';
import { arrayToMapOfRecords } from '../lib/lib.js';

dotenv.config()

const log = (...items: any[]) => console.log(util.inspect(items, { depth: null }));

const SCHOLSHELF = process.env.SCHOLSHELF_DIR ?? '../scholshelf';

type ArchiveCopy = {
  citation: Selectable<CitationsTable>,
  archiveUrl: string,
  pdfUrl: string,
  author: string,
  title: string,
};

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL
    })
  }),
});

const getNextBook = () => (
  db.selectFrom('queued_book_imports')
    .selectAll()
    .where('status', '=', 'imported')
    .orderBy('id')
    .limit(1)
    .executeTakeFirst()
);

const getQueuedBookNames = () => (
  db.selectFrom('queued_book_imports')
    .select(['title', 'author'])
    .where('status', 'not in', ['imported', 'importedAndCrawled', 'complete'])
    .execute()
);

type QueuedBook = Selectable<QueuedBookImportsTable>;

type FootnoteCitation = {
  citationId: string,
  footnotePage: number,
  footnoteIdentifier: string,
  author: string,
  title: string,
  location: string,
  raw: string,
};

const citationsForBook = (bookId: string) => (
  db.selectFrom('citations')
    .select([
      'id', 'source_footnote_page', 'source_footnote_identifier', 'author', 'title', 'location', 'raw',
      'reference_book_id',
    ])
    .where('source_book_id', '=', bookId)
    .orderBy('source_footnote_page')
    .orderBy('id')
    .execute()
);

const referencableBookDetails = (bookId: string) => (
  db.selectFrom('books')
    .select(['id', 'title', 'author'])
    .where('id', '<>', bookId)
    .execute()
);

const findCitedBooks = (
  book: QueuedBook,
  citations: Selectable<CitationsTable>[],
  books: Pick<Selectable<Book>, 'id' | 'title' | 'author'>[],
  queuedBookNames: { title: string, author: string }[]
): {
  referencing: {citationId: number, bookId: string}[],
  notReferencing: Selectable<CitationsTable>[]
} => {
  const bookId  = book.imported_book_id;
  const matches = new Map<string, typeof books>();

  const booksMatching = (author: string, title: string) => {
    const key = author + '\u0000' + title;
    let found = matches.get(key);

    if (!found) {
      found = books.filter(
        b => sameAuthor(author, b.author)
          && sameTitle(
            citedTitle(title) || title,
            b.title
          )
      );
      
      matches.set(key, found);
    }
    
    return found;
  };

  const queuedMatches = new Map<string, boolean>();
  const isQueued = (author: string, title: string) => {
    const key = author + '\u0000' + title;
    let queued = queuedMatches.get(key);

    if (queued === undefined) {
      queued = queuedBookNames.some(
        q => sameAuthor(author, q.author)
          && sameTitle(
            citedTitle(title) || title,
            q.title
          )
      );

      queuedMatches.set(key, queued);
    }

    return queued;
  };

  const referencing: {citationId: number, bookId: number}[] = []
  const notReferencing: Selectable<CitationsTable>[]        = [];

  for (const c of citations) {
    if (c.reference_book_id) {
      // skip 
    }
    else if (skipCitation(c.author, c.title)) {
      notReferencing.push(c);
    }
    else {
      let found    = booksMatching(c.author, c.title);
      const volume = volumeOf(c.title) ?? volumeOf(c.location);
      
      if (volume !== null && found.some(b => volumeOf(b.title) !== null)) {
        found = found.filter(b => volumeOf(b.title) === volume);
      }

      if (found.length) {
        referencing.push({ citationId: c.id, bookId: found[0].id });
      }
      else if (!isQueued(c.author, c.title)) {
        notReferencing.push(c);
      }
    }
  }

  return { referencing, notReferencing };
};


const MAX_CONSECUTIVE_ARCHIVE_ERRORS = 5;
const findArchiveCopies = async (citations: Selectable<CitationsTable>[]): Promise<{
  found: ArchiveCopy[],
  failed: { citation: Selectable<CitationsTable>, error: string }[],
}> => {
  const found: {
    citation: Selectable<CitationsTable>,
    archiveUrl: string,
    pdfUrl: string
  }[] = [];
  
  const failed: {
    citation: Selectable<CitationsTable>,
    error: string
  }[] = [];
  
  let consecutiveErrors = 0;

  for (const citation of citations) {
    if (skipCitation(citation.author, citation.title)) {
      continue;
    }
    else if (consecutiveErrors >= MAX_CONSECUTIVE_ARCHIVE_ERRORS) {
      failed.push({ citation, error: 'not searched: archive.org unreachable' });
      continue;
    }
    else {
      try {
        const hit = await searchArchive(
          citation.author,
          citedTitle(citation.title) || citation.title
        );
        consecutiveErrors = 0;

        if (hit) {
          found.push({
            citation,
            archiveUrl: 'https://archive.org/details/' + hit.identifier,
            pdfUrl: hit.pdf,
            title: hit.title || citation.title,
            author: hit.creator || citation.author
          });
        }
      } catch (e) {
        consecutiveErrors++;
        failed.push({ citation, error: (e as Error).message ?? String(e) });
      }
    }
  }

  return { found, failed };
};

const linkReferences = async (
  referencing: { citationId: number, bookId: string }[]
): Promise<number> => {
  if (referencing.length === 0) {
    return 0;
  }
  else {
    const result = await sql`
      UPDATE citations SET reference_book_id = r.book_id
      FROM unnest(
        ${referencing.map(r => String(r.citationId))}::bigint[],
        ${referencing.map(r => r.bookId)}::text[]
      ) AS r(citation_id, book_id)
      WHERE citations.id = r.citation_id`.execute(db);

    return Number(result.numAffectedRows ?? 0);
  }
};


const pdfFileName = (pdfUrl: string) => (
  new URL(pdfUrl).pathname.split('/').pop() ?? ''
);

const downloadPdf = async (url: string, dest: string) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'references-citation-linker/1.0' } });

  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status} ${url}`);
  }
  else {
    const part = dest + '.part';
    try {
      await pipeline(Readable.fromWeb(res.body as any), createWriteStream(part));
      
      const file  = await fs.open(part);
      const magic = Buffer.alloc(5);
      await file.read(magic, 0, 5, 0);
      await file.close();
    
      if (magic.toString('latin1') !== '%PDF-') {
        throw new Error(`not a PDF: ${url}`);
      }
      else {
        await fs.rename(part, dest);
      }
    } catch (e) {
      await fs.rm(part, { force: true });
      throw e;
    }
  }
};

const queueBooksFromArchive = async (foundArchiveCopies: ArchiveCopy[]): Promise<{
  queued: {
    id: string,
    archiveUrl: string,
    pdfUrl: string,
    file: string,
    citations: number
  }[],
  skipped: { archiveUrl: string, reason: string }[],
  failed: { archiveUrl: string, error: string }[],
}> => {
  const queued: {
    id: string,
    archiveUrl: string,
    pdfUrl: string,
    file: string,
    citations: number
  }[] = [];

  const skipped: { archiveUrl: string, reason: string }[] = [];
  const failed: { archiveUrl: string, error: string }[]   = [];

  const byItem = arrayToMapOfRecords(foundArchiveCopies, 'archiveUrl');

  const queuedArchiveUrls = await db.selectFrom('queued_book_imports')
    .select(['archive_url', 'pdf_url'])
    .execute();

  const queuedAt = new Set(
    queuedArchiveUrls
      .flatMap(q => [q.archive_url, q.pdf_url])
      .filter((u): u is string => !!u)
  );

  const bookIds  = new Set((
    await db.selectFrom('books')
      .select('id')
      .execute()
  ).map(b => b.id));

  await fs.mkdir(SCHOLSHELF, { recursive: true });

  for (const [archiveUrl, copies] of byItem) {
    const { citation, pdfUrl, title, author } = copies[0]!;
    
    const identifier = decodeURIComponent(archiveUrl.split('/details/')[1] ?? '');
    const fileName   = pdfFileName(pdfUrl);

    if (queuedAt.has(archiveUrl) || queuedAt.has(pdfUrl)) {
      skipped.push({ archiveUrl, reason: 'already queued' });
    }
    else if (bookIds.has(identifier) || bookIds.has(fileName.replace(/\.pdf$/i, ''))) {
      skipped.push({ archiveUrl, reason: 'already a book' });
    }
    else if (!fileName.toLowerCase().endsWith('.pdf')) {
      failed.push({ archiveUrl, error: `pdf url has no .pdf file name: ${pdfUrl}` });
    }
    else {
      try {
        const dest = path.join(SCHOLSHELF, fileName);
        const size = await fs.stat(dest).then(st => st.size, () => 0);
        
        if (!size) {
          await downloadPdf(pdfUrl, dest);
        }
        
        const row = await db.insertInto('queued_book_imports')
          .values({
            title,
            author,
            archive_url: archiveUrl,
            pdf_url: pdfUrl,
            status: 'queued',
        })
          .returning('id')
          .executeTakeFirstOrThrow();

        queuedAt.add(archiveUrl);
        queuedAt.add(pdfUrl);
        
        queued.push({ id: row.id, archiveUrl, pdfUrl, file: dest, citations: copies.length });
      } catch (e) {
        failed.push({ archiveUrl, error: (e as Error).message ?? String(e) });
      }
    }
  }

  return { queued, skipped, failed };
};

const processImportedCitations = async (book: QueuedBook) => {
  const citations          = await citationsForBook(book.imported_book_id);
  const referenceableBooks = await referencableBookDetails(book.imported_book_id);
  const queuedBookNames    = await getQueuedBookNames();

  const {referencing, notReferencing} = findCitedBooks(
    book, citations, referenceableBooks, queuedBookNames
  );

  const archiveCopies = await findArchiveCopies(notReferencing);
  const numRefsSaved  = await linkReferences(referencing);
  const queuedResults = await queueBooksFromArchive(archiveCopies.found);

  await db.updateTable('queued_book_imports')
    .set({ status: 'importedAndCrawled' })
    .where('id', '=', book.id)
    .execute();

  log({numRefsSaved, queuedResults, archiveSearchFailures: archiveCopies.failed.length});
};

const main = async () => {
  while (true) {
    const nextBook = await getNextBook();

    await processImportedCitations(nextBook);
    return;
  }
}

main();
