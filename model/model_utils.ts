import type { ExpressionBuilder, Kysely, SelectQueryBuilder } from "kysely";
import type { Database } from "../api/database.js";

export type DB = Kysely<Database>;
export type DbSelectQuery<Tbl extends keyof DB, O> = SelectQueryBuilder<DB, Tbl, O>;
export type DbScope<Tbl extends keyof DB, O> = (
  query: DbSelectQuery<Tbl, O>
) =>  DbSelectQuery<Tbl, O>;
export type DbExprBuilder<Tblname extends keyof DB> = ExpressionBuilder<Database, Tblname>;


export const likePattern = (q: string) => '%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
const offsetAndLimitScope = <Tbl extends keyof DB, O>(
  query: DbSelectQuery<Tbl, O>, offset: number, limit: number
): DbScope<Tbl, O> => (
  (query) => query.offset(offset).limit(limit)
);

export const DbScopes = { offsetAndLimitScope };

export const withScopes = <Tbl extends keyof DB, O>(
  query: DbSelectQuery<Tbl, O>,
  scopes: DbScope<Tbl, O>[]
) => {
  for (const scope of scopes) {
    query = scope(query);
  }

  return query;
};
