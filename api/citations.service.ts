import { Inject, Injectable } from '@nestjs/common';
import { sql, type ExpressionBuilder, type Kysely } from 'kysely';
import type { CitationLocation } from '../types';
import { DB } from './database.module';
import type { Database } from './database';
import { citesBook } from '../model/alternate_ids';

// The Citation schema in api.yaml
export type CitationDto = {
  id: string,
  source: { bookId: string, footnoteIdentifier: string, footnotePage: string },
  author: string,
  title: string,
  locationsCited: { type: CitationLocation['type'], value: number }[],
};

const PART_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];

// Select these from `citations` and pass each row to to_citation_dto.
export const citation_columns = (eb: ExpressionBuilder<Database, 'citations'>) => [
  'citations.id',
  'citations.source_book_id',
  'citations.source_footnote_identifier',
  'citations.source_footnote_page',
  'citations.author',
  'citations.title',
  // every part of every place the citation cites, in the order they were given: the places of one
  // location group (sharing its raw label) part by part, so a range reads "§ 63, 80, pp. 302, 303"
  // rather than place by place (to_citation_dto drops repeats)
  sql<CitationDto['locationsCited']>`(
    select coalesce(json_agg(json_build_object('type', part.type, 'value', part.value)
                             order by grp.first_id, part.n, grp.id), '[]')
    from (
      select g.*, min(g.id) over (partition by g.raw) as first_id
      from citation_groups g
      where g.citation_id = ${ eb.ref('citations.id') }
    ) grp
    cross join lateral (values ${ sql.join(PART_NUMBERS.map((n) => (
    sql`(${ n }, ${ sql.ref(`grp.part${ n }_type`) }, ${ sql.ref(`grp.part${ n }_value`) })`
  ))) }) part(n, type, value)
    where part.type is not null
  )`.as('locations_cited'),
] as const;

// A citation's locations without repeats: the places of a range (ch. 1, vv. 2-4) share their
// other parts (chapter 1 once, then verses 2, 3 and 4)
const distinctLocations = (locations: CitationDto['locationsCited']) => locations.filter(
  (l, i) => locations.findIndex((m) => m.type === l.type && m.value === l.value) === i,
);

export const to_citation_dto = (r: {
  id: string,
  source_book_id: string,
  source_footnote_identifier: string,
  source_footnote_page: number,
  author: string,
  title: string,
  locations_cited: CitationDto['locationsCited'],
}): CitationDto => ({
  id:     r.id,
  source: {
    bookId:             r.source_book_id,
    footnoteIdentifier: r.source_footnote_identifier,
    footnotePage:       String(r.source_footnote_page),
  },
  author:         r.author,
  title:          r.title,
  locationsCited: distinctLocations(r.locations_cited),
});

@Injectable()
export class CitationsService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  // One page of the citations in other books that point at `bookId` (or one of its alternate ids),
  // plus how many there are in total (ignoring offset/length); null when there is no such book.
  async citationsTo(
    bookId: string,
    opts: { offset: number, length: number },
  ): Promise<{ items: CitationDto[], count: number } | null> {
    const book = await this.db.selectFrom('books').select('id').where('id', '=', bookId).executeTakeFirst();
    if (!book) {return null;}

    const matching = () => this.db
      .selectFrom('citations')
      .where(citesBook(bookId));

    const rows = await matching()
      .select(citation_columns)
      .orderBy('citations.source_book_id')
      .orderBy('citations.source_footnote_page')
      .orderBy('citations.id')
      .limit(opts.length)
      .offset(opts.offset)
      .execute();

    const total = await matching().select((eb) => eb.fn.countAll<string>().as('count')).executeTakeFirstOrThrow();

    return {
      items: rows.map(to_citation_dto),
      count: Number(total.count),
    };
  }
}
