import type { ExpressionBuilder, Kysely, SelectQueryBuilder } from "kysely";
import type { Database } from "../api/database.js";

export type DB = Kysely<Database>;
// Table names are the keys of Database (keyof DB would be Kysely's methods)
export type DbTable = keyof Database;
export type DbSelectQuery<Tbl extends DbTable, O> = SelectQueryBuilder<Database, Tbl, O>;
export type DbScope<Tbl extends DbTable, O> = (
  query: DbSelectQuery<Tbl, O>
) =>  DbSelectQuery<Tbl, O>;
export type DbExprBuilder<Tblname extends DbTable> = ExpressionBuilder<Database, Tblname>;


export const likePattern = (q: string) => '%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
const offsetAndLimitScope = <Tbl extends DbTable, O>(
  offset: number, limit: number
): DbScope<Tbl, O> => (
    (query) => query.offset(offset).limit(limit)
  );

export const DbScopes = { offsetAndLimitScope };

export const withScopes = <Tbl extends DbTable, O>(
  query: DbSelectQuery<Tbl, O>,
  scopes: DbScope<Tbl, O>[]
) => {
  for (const scope of scopes) {
    query = scope(query);
  }

  return query;
};
