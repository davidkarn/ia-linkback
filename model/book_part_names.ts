// The proper names of parts of a work (book_part_names; see
// core/book_part_names.ts)
import type { Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import type { PartName } from '../core/book_part_names.ts';
import type { CitationPart } from '../core/summa_thml.ts';

const PARTS = [1, 2, 3, 4] as const;

// The names of a book's parts; [] when it has none
const findPartNames = async(db: Kysely<Database>, bookId: string): Promise<PartName[]> => {
  const rows = await db.selectFrom('book_part_names')
    .selectAll()
    .where('book_id', '=', bookId)
    .execute();

  return rows.map((row) => ({
    name:  row.name,
    parts: PARTS.flatMap((n): CitationPart[] => {
      const type  = row[`part${ n }_type`];
      const value = row[`part${ n }_value`];
      return type === null || value === null ? [] : [{ type, value }];
    }),
  }));
};

export const BookPartNameQueries = { findPartNames };
