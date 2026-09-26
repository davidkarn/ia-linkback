// Search archive.org for a cited work: an item whose title and creator match the citation's (the rules in
// citation_matching.ts) that isn't lending-library only and has a public PDF. Used by link_citations.ts and
// spider/find_and_queue_cited_books.ts.
//
// Answers, including "not found", are cached in output/archive_cache.json (relative to the working directory,
// src/), so the same author and title are only searched once. Requests are spaced ~1s apart.

import fs from 'node:fs';
import { fold, sameAuthor, sameTitle, surnames, tokens } from './citation_matching.ts';

const ARCHIVE_BASE = process.env.ARCHIVE_BASE ?? 'https://archive.org';
const CACHE_FILE   = 'output/archive_cache.json';

export type ArchiveHit = {
  identifier: string,
  title: string,
  creator: string,
  pdf: string
} | null;

const cache: Record<string, ArchiveHit> = (
  fs.existsSync(CACHE_FILE)
    ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
    : {}
);

const saveCache = () => {
  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1));
};

let lastRequest = 0;
const getJson = async (url: string): Promise<any> => {
  const wait = lastRequest + 1000 - Date.now();
  
  if (wait > 0) {
    await new Promise(r => setTimeout(r, wait));
  }
  
  lastRequest = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'references-citation-linker/1.0' }
      });
      
      if (res.status === 429 || res.status >= 500) {
        await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
        continue;
      }
      
      if (!res.ok) {
        throw new Error(`${res.status} ${url}`);
      }
      
      return await res.json();
    } catch (e) {
      if (attempt === 2) {
        throw e;
      }
      await new Promise(r => setTimeout(r, 3000));
    }
  }
};

const one = (v: unknown) => (
  Array.isArray(v)
    ? v.join('; ')
    : (typeof v === 'string' ? v : '')
);

const queryWords = (s: string, max: number) =>
  tokens(s).filter(
    t => t.length > 2
      && !['the', 'and', 'for', 'with', 'from'].includes(t)
  ).slice(0, max);

export const searchArchive = async (
  author: string, title: string
): Promise<ArchiveHit> => {
  const key = `${fold(author)}|${fold(title)}`;

  if (key in cache && cache[key]) {
    return cache[key];
  }
  else {
    const words         = queryWords(title, 8), names = surnames(author);
    let hit: ArchiveHit = null;
    
    if (words.length && names.length) {
      const q = `title:(${words.join(' ')}) AND creator:`
        + `(${names.join(' OR ')}) AND mediatype:texts`;
      
      const url = `${ARCHIVE_BASE}/advancedsearch.php?q=${encodeURIComponent(q)}` 
        + '&fl[]=identifier&fl[]=title&fl[]=creator&rows=15&output=json';
      
      const docs: any[] = (await getJson(url))?.response?.docs ?? [];
      const candidates  = docs.filter(
        d => sameTitle(title, one(d.title))
          && sameAuthor(author, one(d.creator))
      ).slice(0, 4);
      
      for (const d of candidates) {
        const meta = await getJson(
          `${ARCHIVE_BASE}/metadata/` + encodeURIComponent(d.identifier)
        );
            
        if (!meta?.metadata || one(meta.metadata['access-restricted-item']) === 'true') {
          continue;   // lending library only
        }
        else {
          const pdfs = (
            meta.files ?? []
          ).filter(
            (f: any) => /\.pdf$/i.test(f.name)
              && f.private !== 'true'
              && f.private !== true
          );
          
          const pdf = pdfs.find(
            (f: any) => f.format === 'Text PDF'
          ) ?? pdfs.find((f: any) => !/_bw\.pdf$/i.test(f.name)) ?? pdfs[0];
          
          if (!pdf) {
            continue;
          }
          else {
            hit = {
              identifier: d.identifier,
              title: one(meta.metadata.title) || one(d.title),
              creator: one(meta.metadata.creator) || one(d.creator),
              pdf: ARCHIVE_BASE.replace(/^http:/, 'https:')
                + '/download/' + encodeURIComponent(d.identifier)
                + '/' + pdf.name.split('/').map(encodeURIComponent).join('/'),
            };
            break;
          }
        }
      }
    }
    
    cache[key] = hit;
    saveCache();
    
    return hit;
  }
};
