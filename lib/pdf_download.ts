// Downloading a book's PDF (from archive.org) for OCR
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';

// Download url to dest, through dest + ".part" so a failed download leaves nothing at dest. Throws
// when the request fails or what comes back isn't a PDF.
export const downloadPdf = async(url: string, dest: string) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'references-citation-linker/1.0' } });

  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${ res.status } ${ url }`);
  }
  else {
    const part = dest + '.part';
    try {
      await pipeline(Readable.fromWeb(res.body as ReadableStream<Uint8Array>), createWriteStream(part));

      const file  = await fs.open(part);
      const magic = Buffer.alloc(5);
      await file.read(magic, 0, 5, 0);
      await file.close();

      if (magic.toString('latin1') !== '%PDF-') {
        throw new Error(`not a PDF: ${ url }`);
      }
      else {
        await fs.rename(part, dest);
      }
    }
    catch (e) {
      await fs.rm(part, { force: true });
      throw e;
    }
  }
};
