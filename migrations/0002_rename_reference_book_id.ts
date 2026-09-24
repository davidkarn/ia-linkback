import { Kysely, sql } from 'kysely';

// citations."referenceBookId" -> citations.reference_book_id, like the other columns
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('citations').renameColumn('referenceBookId', 'reference_book_id').execute();
  await sql`ALTER TABLE citations RENAME CONSTRAINT "citations_referenceBookId_fkey" TO citations_reference_book_id_fkey`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE citations RENAME CONSTRAINT citations_reference_book_id_fkey TO "citations_referenceBookId_fkey"`.execute(db);
  await db.schema.alterTable('citations').renameColumn('reference_book_id', 'referenceBookId').execute();
}
