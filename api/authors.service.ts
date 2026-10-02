import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DB } from './database.module';
import type { Database } from './database';
import { AuthorScopes, AuthorSelectors } from '../model/authors';
import { DbScopes, withScopes } from '../model/model_utils.js';

// The AuthorSummary schema in ../api.yaml: an author with a book in the collection, how many,
// and how many citations in other books cite them
export type AuthorSummary = { id: string, name: string, bookCount: number, citedByCount: number };

@Injectable()
export class AuthorsService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  private summaries(query: string | undefined, authorId?: string) {
    const scoped = withScopes(this.db.selectFrom('authors'), [
      AuthorScopes.withBooks(),
      AuthorScopes.matchingName(query),
      AuthorScopes.sortedByName(),
    ]);

    return (authorId === undefined ? scoped : scoped.where('authors.id', '=', authorId))
      .select((eb) => [
        'authors.id', 'authors.name', AuthorSelectors.bookCount(eb), AuthorSelectors.citedByCount(eb),
      ]);
  }

  private static toSummary(row: {
    id: string, name: string, book_count: string | null, cited_by_count: string | null,
  }): AuthorSummary {
    return {
      id:           row.id,
      name:         row.name,
      bookCount:    Number(row.book_count ?? 0),
      citedByCount: Number(row.cited_by_count ?? 0),
    };
  }

  // A page of the authors with a book in the collection, by name; with query, of those going by a
  // name containing it. count: all of them.
  async list(opts: {
    offset: number, length: number, query?: string | undefined,
  }): Promise<{ items: AuthorSummary[], count: number }> {
    const rows  = await withScopes(this.summaries(opts.query), [
      DbScopes.offsetAndLimitScope(opts.offset, opts.length),
    ]).execute();
    const total = await withScopes(this.db.selectFrom('authors'), [
      AuthorScopes.withBooks(),
      AuthorScopes.matchingName(opts.query),
    ])
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();

    return { items: rows.map(AuthorsService.toSummary), count: Number(total.count) };
  }

  // An author with a book in the collection; null when there's none with that id
  async get(authorId: string): Promise<AuthorSummary | null> {
    const row = await this.summaries(undefined, authorId).executeTakeFirst();
    return row === undefined ? null : AuthorsService.toSummary(row);
  }
}
