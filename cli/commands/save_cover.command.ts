// Find a book's cover in its downloaded PDF (the first page that isn't blank or a scanner's notice,
// see lib/cover_images.ts), save it to web/public/covers/, and set the book's cover_photo_path.
// Needs ImageMagick with Ghostscript, and tesseract.
//   npm run cli -- save-cover <bookId>
import { Inject } from '@nestjs/common';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Kysely } from 'kysely';
import { Command, CommandRunner } from 'nest-commander';
import { DB } from '../../api/database.module.ts';
import type { Database } from '../../api/database.ts';
import { pdfForBookId } from '../../core/book_files.ts';
import { find_cover_page, render_page } from '../../lib/cover_images.ts';
import { log } from '../../lib/lib.ts';
import { BookActions } from '../../model/books.ts';

// The frontend's covers folder; relative to this file, not the working directory
const COVERS_DIR = path.join(import.meta.dirname, '../../web/public/covers');

@Command({
  name:        'save-cover',
  arguments:   '<bookId>',
  description: "Save a book's cover from its PDF to web/public/covers and set its cover_photo_path",
})
export class SaveCoverCommand extends CommandRunner {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {
    super();
  }

  // The cover is rendered 600px wide. cover_photo_path is "covers/<file>", relative to web/public,
  // so the frontend serves it at /covers/<file>. The file name is the book id with anything but
  // letters, digits, "_" and "-" made "_": book ids can hold URL escapes ("Dieu%2C%20son..."),
  // which the browser would decode when asking for the image.
  async run([bookId]: string[]): Promise<void> {
    const pdf = await pdfForBookId(bookId!);

    if (!pdf) {
      throw new Error(`no PDF for book ${ bookId } in the scholshelf folder`);
    }
    else {
      const fileName = bookId!.replace(/[^A-Za-z0-9_-]/g, '_') + '.jpg';
      const cover    = find_cover_page(pdf);

      await fs.mkdir(COVERS_DIR, { recursive: true });
      render_page(pdf, cover.page, path.join(COVERS_DIR, fileName));
      await BookActions.setCoverPhotoPath(this.db, bookId!, 'covers/' + fileName);

      log({ coverPhotoPath: 'covers/' + fileName, page: cover.page + 1, skipped: cover.skipped });
    }
  }
}
