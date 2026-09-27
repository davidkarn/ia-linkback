// Reading CCEL's ThML (Theological Markup Language) books: shared by the ThML importers, such as
// core/summa_thml.ts. Pure functions.
import type { Citation, CitationLocation } from '../types.ts';
import { bookName, osisBookNumber, printedBookNumber } from './bible.ts';

// One cited passage: a chapter, and verses in it (none for a whole chapter)
type Passage = { book: number, chapter: number, verses: number[] };

const range = (from: number, to: number) => (
  Array.from({ length: Math.max(to - from, 0) + 1 }, (_, i) => from + i)
);

// Passages from a scripRef's parsed attribute: "vul|John|14|6|0|0", several joined with ";".
// Fields: version|book|chapter|verse|end chapter|end verse; 0 for none. A range over chapters keeps
// only its chapters.
const parsedPassages = (parsed: string): Passage[] => (
  parsed.split(';').flatMap((one) => {
    const [, code, ch, v, endCh, endV] = one.split('|');
    const book                         = osisBookNumber(code ?? '');
    const chapter                      = Number(ch);
    const verse                        = Number(v);
    const toCh                         = Number(endCh);
    const toVerse                      = Number(endV);

    if (!book || !chapter) {
      return [];
    }
    else if (toCh && toCh !== chapter) {
      return range(chapter, toCh).map((c) => ({ book, chapter: c, verses: [] }));
    }
    else {
      return [{ book, chapter, verses: verse ? range(verse, toVerse || verse) : [] }];
    }
  })
);

// Passages from a scripRef's passage text, for one without a parsed form: "3 Kings 10:4,5",
// "4 Kings 6:16", "3 Kings 3". Not scripture ("Ep. 137"): none.
const printedPassages = (passage: string): Passage[] => {
  const m    = passage.match(/^\s*((?:[1-4]\s*)?[A-Za-z]+)\.?\s+(\d+)(?:\s*:\s*([\d\s,-]+))?/);
  const book = m ? printedBookNumber(m[1]!) : null;

  if (!m || !book) {
    return [];
  }
  else {
    const verses = (m[3] ?? '').split(',').flatMap(
      (part) => {
        const [from, to] = part
          .split('-')
          .map((n) => Number(n.trim()));
        
        return from ? range(from, to || from) : [];
      });
    
    return [{ book, chapter: Number(m[2]), verses }];
  }
};

// "4-5", "3, 23, 28": consecutive verses as ranges
const verseLabel = (verses: number[]) => (
  verses
    .reduce<number[][]>((runs, v) => {
      const last = runs[runs.length - 1];

    if (last && v === last[last.length - 1]! + 1) {
        last.push(v);
      }
      else {
        runs.push([v]);
      }
    
      return runs;
    }, [])
    .map((run) => (
      run.length > 1
        ? `${ run[0] }-${ run[run.length - 1] }`
        : String(run[0])
    ))
    .join(', ')
);

// "14:6", "10:4-5; 11:2", "15"
const locationText = (passages: Passage[]) => (
  passages
    .map((p) => (
      p.verses.length ? `${ p.chapter }:${ verseLabel(p.verses) }` : String(p.chapter)
    ))
    .join('; ')
);

// One group per passage: its book, chapter and verses (the shape build_book.ts gives Bible
// citations)
const passageLocations = (passages: Passage[]): CitationLocation[][] => (
  passages.map((p) => [
    { rawLabel: bookName(p.book), type: 'book', values: [p.book] },
    { rawLabel: String(p.chapter), type: 'chapter', values: [p.chapter] },
    ...(p.verses.length
      ? [{ rawLabel: verseLabel(p.verses), type: 'verse' as const, values: p.verses }]
      : []),
  ])
);

const attribute = (attrs: string, name: string) => (
  attrs.match(new RegExp(`\\b${ name }="([^"]*)"`))?.[1]
);

const plainText = (html: string) => (
  html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
);

export const scripRefCitations = (
  thml: string,
  source: { bookId: string, footnotePage: number },
  firstIdentifier = 1,
): Citation[] => {
  const citations: Citation[] = [];

  for (const m of thml.matchAll(/<scripRef\b([^>]*)>([\s\S]*?)<\/scripRef>/g)) {
    const attrs    = m[1]!;
    const parsed   = attribute(attrs, 'parsed');
    const passage  = attribute(attrs, 'passage') ?? plainText(m[2]!);
    const passages = parsed ? parsedPassages(parsed) : printedPassages(passage);

    if (passages.length) {
      citations.push({
        source: {
          bookId:             source.bookId,
          footnoteIdentifier: String(firstIdentifier + citations.length),
          footnotePage:       source.footnotePage,
        },
        referenceBookId: null,
        author:          'Bible',
        title:           bookName(passages[0]!.book),
        location:        locationText(passages),
        raw:             plainText(m[2]!) || passage.trim(),
        locationsCited:  passageLocations(passages),
      });
    }
  }

  return citations;
};
