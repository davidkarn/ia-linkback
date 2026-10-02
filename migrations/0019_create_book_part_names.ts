import { Kysely, sql } from 'kysely';

// The proper names of parts of a work, by the citation parts that make
// them (as book_pages_to_citations cites its pages): the Douay-Rheims's
// book 27 is "Isaias", the Summa's book 2 the "Prima Secundae Partis". A
// part is named by its first parts, up to four: part2..part4 are null for
// a top-level part. The Douay-Rheims's and the Summa's are added here.
// Not tied to books by a foreign key, so names can be added before their
// book is imported.
const PARTS = 4;

// The Douay-Rheims's books, in the order of the Douay canon (core/bible.ts),
// by their names in the Douay (and the Vulgate): Josue, Isaias, Osee
const DOUAY_BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Josue', 'Judges', 'Ruth',
  '1 Kings', '2 Kings', '3 Kings', '4 Kings', '1 Paralipomenon', '2 Paralipomenon',
  '1 Esdras', '2 Esdras', 'Tobias', 'Judith', 'Esther', 'Job', 'Psalms', 'Proverbs',
  'Ecclesiastes', 'Canticle of Canticles', 'Wisdom', 'Ecclesiasticus', 'Isaias', 'Jeremias',
  'Lamentations', 'Baruch', 'Ezechiel', 'Daniel', 'Osee', 'Joel', 'Amos', 'Abdias', 'Jonas',
  'Micheas', 'Nahum', 'Habacuc', 'Sophonias', 'Aggeus', 'Zacharias', 'Malachias',
  '1 Machabees', '2 Machabees', 'Matthew', 'Mark', 'Luke', 'John', 'Acts of the Apostles',
  'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians',
  'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus',
  'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude',
  'Apocalypse',
];

// The Summa Theologiae's parts, its "books" 1-5 (core/summa_thml.ts)
const SUMMA_PARTS = [
  'Prima Pars', 'Prima Secundae Partis', 'Secunda Secundae Partis', 'Tertia Pars',
  'Supplementum Tertiae Partis',
];

// Rows naming books 1, 2, ... of a work
const named = (bookId: string, names: string[]) => names.map((name, i) => (
  sql`(${ bookId }, 'book', ${ i + 1 }, ${ name })`
));

export async function up(db: Kysely<unknown>): Promise<void> {
  let table = db.schema
    .createTable('book_part_names')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('book_id', 'text', (col) => col.notNull())
    .addColumn('part1_type', 'text', (col) => col.notNull())
    .addColumn('part1_value', 'integer', (col) => col.notNull());

  for (let n = 2; n <= PARTS; n++) {
    table = table
      .addColumn(`part${ n }_type`, 'text')
      .addColumn(`part${ n }_value`, 'integer');
  }

  await table.addColumn('name', 'text', (col) => col.notNull()).execute();

  // one name per part (null parts compare equal)
  await sql`create unique index book_part_names_parts_idx on book_part_names (
    book_id, part1_type, part1_value,
    coalesce(part2_type, ''), coalesce(part2_value, -1),
    coalesce(part3_type, ''), coalesce(part3_value, -1),
    coalesce(part4_type, ''), coalesce(part4_value, -1)
  )`.execute(db);

  await sql`insert into book_part_names (book_id, part1_type, part1_value, name)
    values ${ sql.join([
    ...named('douay-rheims', DOUAY_BOOKS), ...named('summa-theologiae', SUMMA_PARTS),
  ]) }`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('book_part_names').execute();
}
