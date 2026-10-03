// Withholding books likely still under copyright (see HIDDEN_COPYRIGHT_STATUSES in
// core/copyright_status.ts): their pages and the text of their pages can't be read
import { HttpException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { Database } from './database';
import { shownInSearches, WITHHELD_MESSAGE } from '../core/copyright_status';
import { CopyrightStatusCheckQueries } from '../model/copyright_status_checks';

// 451 Unavailable For Legal Reasons
const UNAVAILABLE_FOR_LEGAL_REASONS = 451;

// Throws 451 when the book is withheld; a book never checked, or not in the collection, isn't
export const assertNotWithheld = async(db: Kysely<Database>, bookId: string): Promise<void> => {
  const status = await CopyrightStatusCheckQueries.findLatestStatus(db, bookId);

  if (!shownInSearches(status)) {
    throw new HttpException(WITHHELD_MESSAGE, UNAVAILABLE_FOR_LEGAL_REASONS);
  }
};
