import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import type { CitationLocation } from '../types';
import { DB } from './database.module';
import type { Database } from './database';

// The Citation schema in api.yaml
export type CitationDto = {
  id: string,
  source: { bookId: string, footnoteIdentifier: string, footnotePage: string },
  author: string,
  title: string,
  locationsCited: CitationLocation[],
};

@Injectable()
export class CitationsService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  // One page of the citations in other books that point at `bookId`, plus how many there are in
  // total (ignoring offset/length); null when there is no such book.
  async citationsTo(
    bookId: string,
    opts: { offset: number, length: number },
  ): Promise<{ items: CitationDto[], count: number } | null> {
    const book = await this.db.selectFrom('books').select('id').where('id', '=', bookId).executeTakeFirst();
    if (!book) return null;

    const matching = () => this.db
      .selectFrom('citations')
      .where('citations.referenceBookId', '=', bookId)
      .where('citations.source_book_id', '<>', bookId);

    const rows = await matching()
      .select(eb => [
        'citations.id',
        'citations.source_book_id',
        'citations.source_footnote_identifier',
        'citations.source_footnote_page',
        'citations.author',
        'citations.title',
        jsonArrayFrom(
          eb.selectFrom('citation_locations')
            .select(['citation_locations.type', 'citation_locations.value'])
            .whereRef('citation_locations.citation_id', '=', 'citations.id')
            .orderBy('citation_locations.id'),
        ).as('locations_cited'),
      ])
      .orderBy('citations.source_book_id')
      .orderBy('citations.source_footnote_page')
      .orderBy('citations.id')
      .limit(opts.length)
      .offset(opts.offset)
      .execute();

    const total = await matching().select(eb => eb.fn.countAll<string>().as('count')).executeTakeFirstOrThrow();

    return {
      items: rows.map(r => ({
        id: r.id,
        source: {
          bookId: r.source_book_id,
          footnoteIdentifier: r.source_footnote_identifier,
          footnotePage: String(r.source_footnote_page),
        },
        author: r.author,
        title: r.title,
        locationsCited: r.locations_cited,
      })),
      count: Number(total.count),
    };
  }
}
