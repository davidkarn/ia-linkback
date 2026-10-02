// A page of a Bible (a chapter) as rows of a verse and the citations of it
// (see components/book_page.ts). Its blocks are a paragraph per verse, the
// verse's number first (<p><sup>3</sup> For this is he...), and its
// citations' locations a flat list of places (book 47, chapter 3, verse 7,
// verse 9, book 40, verse 2): a verse is of the book and chapter before it.
import type { ReactElement } from 'react';
import type { Citation, ContentsEntry, PageBlock, VolumeSummary } from '../api';
import { pathToPageInVolume } from './contents';
import { Link } from 'react-router';

// citations: those of the block's verse; those of the chapter but no verse
// on the page go with its heading (or, without one, its first block)
export type VerseRow = { block: PageBlock, verse: number | null, citations: Citation[] };

// the book and chapter a page is, by their numbers
export type ChapterPlace = { book: number, chapter: number };

const VERSE_NUMBER = /^\s*<p>\s*<sup>\s*(\d+)\s*<\/sup>/;

// A block's verse number; null for a block that isn't a verse
export const verseOf = (block: PageBlock): number | null => {
  const m = block.label === 'Text' ? block.html.match(VERSE_NUMBER) : null;
  return m === null ? null : Number(m[1]);
};

// The verses of a chapter a citation cites: each verse in its locations
// under that book and chapter (the latest book and chapter before it)
export const versesCited = (citation: Citation, place: ChapterPlace): number[] => {
  let book: number | undefined;
  let chapter: number | undefined;
  const verses: number[] = [];

  for (const loc of citation.locationsCited) {
    if (loc.type === 'book') {
      book = loc.value;
    }
    else if (loc.type === 'chapter') {
      chapter = loc.value;
    }
    else if (loc.type === 'verse' && book === place.book && chapter === place.chapter) {
      verses.push(loc.value);
    }
  }

  return verses;
};

// The book and chapter of a page, from the table of contents (book >
// chapter); null when it isn't under one
export const chapterOfPage = (
  contents: ContentsEntry[], volumes: VolumeSummary[], volume: number, pageId: number
): ChapterPlace | null => {
  const path    = pathToPageInVolume(contents, pageId, volumes, volume);
  const entries = path.reduce<{ level: ContentsEntry[], along: ContentsEntry[] }>(
    ({ level, along }, i) => ({
      level: level[i]?.childEntries ?? [],
      along: level[i] === undefined ? along : [...along, level[i]],
    }),
    { level: contents, along: [] },
  ).along;
  const book    = entries.find((e) => e.partType === 'book');
  const chapter = entries.find((e) => e.partType === 'chapter');

  return book === undefined || chapter === undefined
    ? null
    : { book: Number(book.partValue), chapter: Number(chapter.partValue) };
};

// A row per block (the page's headers left out by the caller), each verse's
// with the citations of it. A citation of several verses is in each of their
// rows; one of no verse on the page (or when the page's chapter isn't known),
// in the heading's row.
export const verseRows = (
  blocks: PageBlock[], citations: Citation[], place: ChapterPlace | null
): VerseRow[] => {
  const rows: VerseRow[] = blocks.map((block) => ({ block, verse: verseOf(block), citations: [] }));
  const byVerse          = new Map(rows.flatMap((r) => (r.verse === null ? [] : [[r.verse, r] as const])));
  const heading          = rows.find((r) => r.block.label === 'SectionHeader') ?? rows[0];

  for (const citation of citations) {
    const verses = place === null ? [] : versesCited(citation, place);
    const placed = [...new Set(verses)].flatMap((v) => byVerse.get(v) ?? []);

    if (placed.length > 0) {
      placed.forEach((r) => r.citations.push(citation));
    }
    else if (heading !== undefined) {
      heading.citations.push(citation);
    }
  }

  return rows;
};

// how many of a verse's citing authors its summary names
export const MAX_AUTHORS_SHOWN = 8;

// A verse's citations summed up by who cites it, the most citations first
// (ties in the order they come): "3 - Augustine, 1 - Aquinas", then
// "...and 4 more" for the authors past MAX_AUTHORS_SHOWN. authorOf: the
// author of the book a citation is in.
export const citingAuthorsSummaryForMany = (
  citations: Citation[], authorOf: (citation: Citation) => string
): string => {
  const counts = new Map<string, number>();
  for (const c of citations) {
    const author = authorOf(c);
    counts.set(author, (counts.get(author) ?? 0) + 1);
  }

  const authors = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  
  const shown = authors.slice(0, MAX_AUTHORS_SHOWN)
    .map(([author, n]) => `${ author } (${ n })`);

  const more = authors.length - MAX_AUTHORS_SHOWN;

  return shown.join(', ') + (more > 0 ? ` ...and ${ more } more` : '');
};


