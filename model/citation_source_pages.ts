// The page a citation's footnote is on: the citation's place in it, and the page's blocks (see
// core/citation_pages.ts).
import type { Kysely } from 'kysely';
import type { Database } from '../api/database.ts';
import type { SourceBlock } from '../core/citation_pages.ts';

// A citation's footnote block and identifier, with every block of the page the footnote is on in
// reading order; undefined when there is no such citation
export const findCitationSourcePage = async(
  db: Kysely<Database>, citationId: string
): Promise<{ bookId: string, blockId: string, identifier: string, blocks: SourceBlock[] } | undefined> => {
  const citation = await db.selectFrom('citations')
    .select([
      'citations.page_block_id', 'citations.source_book_id', 'citations.source_footnote_page',
      'citations.source_footnote_identifier',
    ])
    .where('citations.id', '=', citationId)
    .executeTakeFirst();

  if (!citation) {
    return undefined;
  }
  else {
    const blocks = await db.selectFrom('page_blocks')
      .select(['page_blocks.id', 'page_blocks.label', 'page_blocks.html'])
      .where('page_blocks.book_id', '=', citation.source_book_id)
      .where('page_blocks.page_number', '=', citation.source_footnote_page)
      .orderBy('page_blocks.position')
      .execute();

    return {
      bookId:     citation.source_book_id,
      blockId:    citation.page_block_id,
      identifier: citation.source_footnote_identifier,
      blocks,
    };
  }
};
