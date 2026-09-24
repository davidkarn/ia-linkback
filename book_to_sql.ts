// Turn a Book JSON (see types.ts / build_book.ts) into a PostgreSQL script for the schema in
// migrations/0001_create_book_tables.ts.
//
// Usage (from src/):  npx tsx book_to_sql.ts output/<book>.book.json > output/<book>.sql
//                     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f output/<book>.sql
//
// The script runs in one transaction and is re-runnable: it upserts the books row, deletes the book's pages
// (blocks, citations, groups and locations cascade) and inserts everything again. Citations are tied to their
// block through (book_id, page_number, position); each locationsCited group becomes a citation_groups row
// and each value in a CitationLocation becomes one citation_locations row (raw = rawLabel).
// reference_book_id is left NULL here; link_citations.ts fills it (same author + same title) after loading.
import fs from 'node:fs';
import type { Book, Citation } from './types';

const file = process.argv[2];
if (!file) { console.error('usage: tsx book_to_sql.ts <book.json>'); process.exit(1); }
const book: Book = JSON.parse(fs.readFileSync(file, 'utf8'));

// Location types the migration's check constraint accepts (types.ts also has 'part').
const DB_LOCATION_TYPES = new Set(['page', 'chapter', 'book', 'volume', 'question', 'article', 'lecture', 'position', 'verse']);
const INT_MIN = -2147483648, INT_MAX = 2147483647;

const lit = (v: string | null | undefined) =>
  v === null || v === undefined ? 'NULL' : `'${String(v).replace(/\u0000/g, '').replace(/'/g, "''")}'`;
const num = (n: number) => {
  if (!Number.isFinite(n)) throw new Error(`not a number: ${n}`);
  return String(n);
};

const out: string[] = [];
const emit = (s: string) => out.push(s);
const warnings: string[] = [];

emit(`-- ${book.title} (${book.author}) -- generated from ${file}`);
emit('BEGIN;');
emit('');
// Keep the books row (upsert) so rows pointing at it survive a re-import: other books' citations
// (reference_book_id) and queued_book_imports.imported_book_id (ON DELETE CASCADE would delete the queue row).
// Deleting the pages cascades to page_blocks -> citations -> citation_groups / citation_locations.
emit(`INSERT INTO books (id, title, author, url) VALUES (${lit(book.id)}, ${lit(book.title)}, ${lit(book.author)}, ${lit(book.url ?? null)})
  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, author = EXCLUDED.author, url = EXCLUDED.url;`);
emit(`DELETE FROM pages WHERE book_id = ${lit(book.id)};`);
emit('');

const CHUNK = 500;
const insertRows = (head: string, rows: string[]) => {
  for (let i = 0; i < rows.length; i += CHUNK) emit(`${head} VALUES\n  ${rows.slice(i, i + CHUNK).join(',\n  ')};`);
};

insertRows('INSERT INTO pages (book_id, page_number, printed_page_number)',
  book.pages.map(p => `(${lit(book.id)}, ${num(p.pageNumber)}, ${lit(p.printedPageNumber ?? '')})`));
emit('');

const blockRows: string[] = [];
for (const p of book.pages) p.blocks.forEach((b, position) => {
  const [x0, y0, x1, y1] = b.bbox;
  blockRows.push(`(${lit(book.id)}, ${num(p.pageNumber)}, ${position}, ${num(x0)}, ${num(y0)}, ${num(x1)}, ${num(y1)}, ${lit(b.label)}, ${lit(b.html)})`);
});
insertRows('INSERT INTO page_blocks (book_id, page_number, position, bbox_x0, bbox_y0, bbox_x1, bbox_y1, label, html)', blockRows);
emit('');

let citationCount = 0, groupCount = 0, locationRows = 0;
const citationSql = (c: Citation, pageNumber: number, position: number) => {
  const cte: string[] = [];
  cte.push(
    `c AS (\n  INSERT INTO citations (page_block_id, source_book_id, source_footnote_identifier, source_footnote_page, reference_book_id, author, title, location, raw)\n` +
    `  SELECT pb.id, ${lit(c.source.bookId)}, ${lit(c.source.footnoteIdentifier)}, ${num(c.source.footnotePage)}, ${lit(c.referenceBookId)}, ${lit(c.author)}, ${lit(c.title)}, ${lit(c.location)}, ${lit(c.raw)}\n` +
    `  FROM page_blocks pb WHERE pb.book_id = ${lit(book.id)} AND pb.page_number = ${num(pageNumber)} AND pb.position = ${position}\n  RETURNING id)`,
  );
  const selects: string[] = [];
  c.locationsCited.forEach((group, g) => {
    const values: string[] = [];
    for (const loc of group) {
      if (!DB_LOCATION_TYPES.has(loc.type)) {
        warnings.push(`p${pageNumber} "${c.raw.slice(0, 60)}": location type '${loc.type}' not allowed by the schema, skipped`);
        continue;
      }
      for (const v of loc.values) {
        if (!Number.isInteger(v) || v < INT_MIN || v > INT_MAX) {
          warnings.push(`p${pageNumber} "${c.raw.slice(0, 60)}": value ${v} is not a 32-bit integer, skipped`);
          continue;
        }
        values.push(`(${lit(loc.type)}, ${lit(loc.rawLabel)}, ${v})`);
      }
    }
    if (!values.length) return;
    cte.push(`g${g} AS (INSERT INTO citation_groups (citation_id) SELECT id FROM c RETURNING id, citation_id)`);
    selects.push(`SELECT g${g}.citation_id, g${g}.id, v.type, v.raw, v.value FROM g${g}, (VALUES ${values.join(', ')}) AS v(type, raw, value)`);
    groupCount++;
    locationRows += values.length;
  });
  citationCount++;
  if (!selects.length) return cte[0].replace(/^c AS \(\n  /, '').replace(/\n  RETURNING id\)$/, ';');
  return `WITH ${cte.join(',\n')}\nINSERT INTO citation_locations (citation_id, citation_group_id, type, raw, value)\n${selects.join('\nUNION ALL\n')};`;
};

for (const p of book.pages) p.blocks.forEach((b, position) => {
  for (const c of b.citations) emit(citationSql(c, p.pageNumber, position));
});

emit('');
emit('COMMIT;');

process.stdout.write(out.join('\n') + '\n');
console.error(JSON.stringify({
  book: book.id, pages: book.pages.length, blocks: blockRows.length, citations: citationCount,
  citation_groups: groupCount, citation_location_rows: locationRows, warnings: warnings.length,
}));
for (const w of warnings.slice(0, 20)) console.error('  ' + w);
