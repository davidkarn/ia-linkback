// Aristotle's works from Wikisource's EPUB exports (output/aristotle, see
// book_importers/aristotle_epub.ts) as books: a page per chapter, cited by book and chapter
// ("Metaph. vii, 3": book 7, chapter 3), or by chapter alone for a work of one book. Pure
// functions over the EPUBs' XHTML documents; the importer reads the files and saves the books.
//
// The exports are uneven: Wikisource splits a work into files by subpage (a book each, mostly,
// named "..._Book_II"), and translators and transcribers mark chapters in several ways: a heading
// or a paragraph of its own ("Part 3", "Chapter 3", "CHAPTER III.", "3"), a bold number opening a
// paragraph (the Oxford translation: "<b>3</b> ..."), or an anchor (id="Chapter_3"). Some mark
// books in the text instead ("BOOK II"). Tables of contents repeat the markers, with next to no
// text after each: those are dropped.
import { parse, NodeType, type HTMLElement, type Node } from 'node-html-parser';
import type { CitationPart } from './summa_thml.ts';
import { numberOf } from './fathers_thml.ts';
import type { PageBlock } from '../types.ts';

// A document of an EPUB, in reading order: its file name and its XHTML
export type EpubDocument = { name: string, html: string };

export type WorkPage = {
  pageNumber: number,
  printedPageNumber: string,
  citationParts: CitationPart[],
  blocks: PageBlock[],
};

// A book marker can open the book's first chapter too ("BOOK SECOND. CHAPTER I.")
type Marker = { kind: 'book' | 'chapter', value: number, chapter?: number };

// How a work's text is read, where the markers alone would mislead. textStartsAt: the block its
// text starts at, markers before it (a table of contents) being ignored; firstBook: the book the
// text starts in, when nothing marks it.
export type WorkReading = { textStartsAt?: RegExp, firstBook?: number };

// A paragraph-like block of a document: its cleaned HTML, its text, whether it's a heading, the
// book or chapter it starts, and the notes it refers to (by their ids in the document)
type Leaf = { html: string, text: string, heading: boolean, marker?: Marker, noteRefs: string[] };

// A document's footnotes, by their id in it ("cite_note-3"): their number and HTML
type Note = { id: string, number: string, html: string };

// The parts of a work between markers: the book and chapter it is, null for none (front matter, a
// book's opening before its first chapter)
type Segment = { book: number | null, chapter: number | null, leaves: Leaf[], notes: Map<string, Note> };

// A segment opened by a marker with fewer words than this is a table of contents' entry (or a
// stray heading), not a book or chapter
export const MIN_SEGMENT_WORDS = 30;

const BLOCK_TAGS   = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li',
                              'table', 'tbody', 'tr', 'td', 'th', 'section', 'dl', 'dd', 'dt', 'center', 'figure']);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const INLINE_TAGS  = new Set(['i', 'em', 'b', 'strong', 'sup', 'sub', 'br', 'small']);

// Wikisource's furniture, left out: page numbers, margin line and Bekker numbers, sidenotes,
// licence boxes, spacers, note backlinks
const SKIPPED_CLASSES = ['pagenum', 'ws-pagenum', 'wst-verse', 'wst-sidenote', 'wst-woach',
                         'licenseContainer', 'licenseBanner', 'licensetpl', 'mw-collapsible', 'wst-dhr', 'mw-cite-backlink',
                         'mw-empty-elt', 'wst-pagebreak', 'wst-license-container-title'];

const CHAPTER_LABEL = /^(?:part|chapter|chap\.?)\s*([ivxlc]+|\d+)\b\.?(?:\s*[:.—–-].*)?$/i;
// a bare Roman number is only taken of I, V and X: "C." and "L." are more often abbreviations
const BARE_NUMBER = /^([ivx]+|\d{1,3})\.?$/i;
const BOOK_WORD   = '([ivxlc]+|\\d+|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth'
  + '|fifth|sixth|seventh|eighth|ninth|tenth)';
const BOOK_LABEL  = new RegExp(`^book\\s+${ BOOK_WORD }\\.?(?:\\s+chapter\\s+([ivxlc]+|\\d+)\\.?)?$`, 'i');
// "1. Condemnation [of the Alcmeonidae]": a numbered heading (the Athenian Constitution)
const NUMBERED_HEADING = /^(\d{1,3})\.\s+\S/;
const ANCHOR_ID        = /^Chapter_([IVXLC]+|\d+)$/;

// Most words a block marking a chapter can have and be a heading, not a paragraph
const MAX_HEADING_WORDS = 15;

// Highest number a bare number can be as a chapter (a year, "1882", isn't one)
const MAX_CHAPTER = 200;

const classesOf = (el: HTMLElement) => (el.getAttribute('class') ?? '').split(/\s+/);
const isSkipped = (el: HTMLElement) => classesOf(el).some((c) => SKIPPED_CLASSES.includes(c));
const tagOf     = (el: HTMLElement) => el.rawTagName?.toLowerCase() ?? '';
const squash    = (s: string) => s.replace(/\s+/g, ' ').trim();
const escape    = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wordCount = (s: string) => (s.trim().length === 0 ? 0 : s.trim().split(/\s+/).length);

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const markerNumber = (raw: string): number | null => {
  const n = WORD_NUMBERS[raw.toLowerCase()] ?? numberOf(raw);
  return n !== null && n >= 1 && n <= MAX_CHAPTER ? n : null;
};

// A file's book, from its name ("..._Book_II.xhtml", "..._Book_Two.xhtml"); null for none
export const fileBook = (name: string): number | null => {
  const m = name.match(/_Book_([A-Za-z]+|\d+)(?=[._]|$)/);
  return m ? markerNumber(m[1]!) : null;
};

// An element's HTML with only text markup kept: notes' references become their number, and
// Wikisource's furniture is left out
const inlineHtml = (node: Node): string => {
  if (node.nodeType === NodeType.TEXT_NODE) {
    return escape(node.text);
  }
  else if (node.nodeType !== NodeType.ELEMENT_NODE) {
    return '';
  }
  else {
    const el  = node as HTMLElement;
    const tag = tagOf(el);

    if (isSkipped(el) || tag === 'style' || tag === 'script') {
      return '';
    }
    else if (classesOf(el).includes('mw-ref')) {
      return `<sup>${ escape(el.text.replace(/[[\]\s]/g, '')) }</sup>`;
    }
    else if (tag === 'br') {
      return '<br/>';
    }
    else {
      const inner = el.childNodes.map(inlineHtml).join('');
      return INLINE_TAGS.has(tag) && inner.trim().length > 0 ? `<${ tag }>${ inner }</${ tag }>` : inner;
    }
  }
};

// The text a leaf shows: its HTML's text, furniture left out
const leafText = (el: HTMLElement) => squash(parse(inlineHtml(el)).text);

// The marker a block opens with, if any
const markerOf = (el: HTMLElement, text: string, heading: boolean): Marker | undefined => {
  const anchor = el.querySelectorAll('[id]').map((a) => a.getAttribute('id')?.match(ANCHOR_ID)).find(Boolean);
  const book   = text.match(BOOK_LABEL);
  const label  = text.length < 200 ? text.match(CHAPTER_LABEL) : null;
  const bare   = text.match(BARE_NUMBER);
  const head   = heading ? text.match(NUMBERED_HEADING) : null;
  // a bold number or label the block opens with: "<b>3</b> If ..."
  const first   = el.childNodes.find((n) => n.text.trim().length > 0);
  const opening = first && first.nodeType === NodeType.ELEMENT_NODE ? first as HTMLElement : null;
  const bold    = opening === null ? ''
    : squash((tagOf(opening) === 'b' ? opening : opening.querySelector('b'))?.text ?? '');
  const lead    = text.startsWith(bold) && bold.length > 0
    ? (bold.match(BARE_NUMBER) ?? bold.match(CHAPTER_LABEL)) : null;

  const number  = (raw: string | undefined) => (raw === undefined ? null : markerNumber(raw));
  const chapter = number(anchor?.[1]) ?? number(label?.[1]) ?? number(bare?.[1]) ?? number(head?.[1])
    ?? number(lead?.[1]);

  if (book && number(book[1]) !== null) {
    const opens = number(book[2]);
    return { kind: 'book', value: number(book[1])!, ...(opens === null ? {} : { chapter: opens }) };
  }
  else if (chapter !== null) {
    return { kind: 'chapter', value: chapter };
  }
  else {
    return undefined;
  }
};

// A document's blocks, in order, and its footnotes. Blocks are the innermost block-level
// elements; the notes' list is read for the notes and isn't a block.
export const documentLeaves = (xhtml: string): { leaves: Leaf[], notes: Map<string, Note> } => {
  const body           = parse(xhtml).querySelector('body') ?? parse(xhtml);
  const leaves: Leaf[] = [];
  const notes          = new Map<string, Note>();
  let ended            = false;

  const visit = (el: HTMLElement) => {
    const tag = tagOf(el);

    if (ended || isSkipped(el) || tag === 'style' || tag === 'script' || tag === 'nav') {
      // furniture, or past the end of the text
    }
    else if (classesOf(el).includes('references') || classesOf(el).includes('mw-references')) {
      for (const li of el.querySelectorAll('li')) {
        const id   = li.getAttribute('id') ?? '';
        const text = li.querySelector('.reference-text') ?? li;
        notes.set(id, {
          id,
          number: li.getAttribute('data-mw-footnote-number') ?? String(notes.size + 1),
          html:   inlineHtml(text).trim(),
        });
      }
    }
    else if (el.childNodes.some((n) => (
      n.nodeType === NodeType.ELEMENT_NODE && BLOCK_TAGS.has(tagOf(n as HTMLElement))
        && !isSkipped(n as HTMLElement)
    ))) {
      el.childNodes.forEach((n) => n.nodeType === NodeType.ELEMENT_NODE && visit(n as HTMLElement));
    }
    else if (BLOCK_TAGS.has(tag) || tag === 'body') {
      const text    = leafText(el);
      const heading = HEADING_TAGS.has(tag) || classesOf(el).includes('wst-heading');

      if (heading && /^external links$/i.test(text)) {
        ended = true;
      }
      else if (text.length > 0) {
        const marker = markerOf(el, text, heading);
        leaves.push({
          html:     inlineHtml(el).trim(),
          text,
          // a marker's block is a heading when it's only the marker ("Chapter 2"), not a
          // paragraph it opens ("2 Since, then, ...")
          heading:  heading || (marker !== undefined && wordCount(text) <= MAX_HEADING_WORDS),
          noteRefs: el.querySelectorAll('.mw-ref a').map((a) => (a.getAttribute('href') ?? '').replace(/^#/, '')),
          ...(marker ? { marker } : {}),
        });
      }
    }
  };

  visit(body);
  return { leaves, notes };
};

const segmentWords = (s: Segment) => s.leaves.reduce((n, l) => n + wordCount(l.text), 0);

// A work's segments: its documents' blocks split at each marker. A file of a book starts that
// book; a book marker starts a book; a chapter marker a chapter of the book it's in.
export const segmentsOf = (documents: EpubDocument[], reading: WorkReading = {}): Segment[] => {
  const segments: Segment[] = [];
  let book: number | null   = null;
  let started               = reading.textStartsAt === undefined;

  for (const doc of documents) {
    const { leaves, notes } = documentLeaves(doc.html);
    const named             = fileBook(doc.name);
    if (named !== null) {
      book = named;
    }
    let current: Segment = { book, chapter: null, leaves: [], notes };
    segments.push(current);

    for (const leaf of leaves) {
      if (!started && reading.textStartsAt!.test(leaf.text)) {
        started = true;
        book    = reading.firstBook ?? book;
      }

      if (!started) {
        current.leaves.push(leaf);
      }
      else if (leaf.marker?.kind === 'book') {
        book    = leaf.marker.value;
        current = { book, chapter: leaf.marker.chapter ?? null, leaves: [leaf], notes };
        segments.push(current);
      }
      else if (leaf.marker?.kind === 'chapter') {
        current = { book, chapter: leaf.marker.value, leaves: [leaf], notes };
        segments.push(current);
      }
      else {
        current.leaves.push(leaf);
      }
    }
  }

  return segments.filter((s) => s.leaves.length > 0);
};

// A segment's place in the work, to tell when the numbering goes back: book, then chapter
const placeOf = (s: Segment) => (s.book ?? 0) * 1000 + (s.chapter ?? 0);

// Segments whose markers are a table of contents' (an analytic one, a summary under each chapter,
// as Owen's translations open each book with): within a document, when the books and chapters
// marked go back (to chapter 1 again), what was marked before is a table of contents, and is made
// one segment, of no chapter, with the book it was in
export const withoutContents = (segments: Segment[]): Segment[] => {
  const out: Segment[] = [];
  let docStart         = 0;
  let furthest         = -1;

  segments.forEach((s) => {
    const sameDoc = out.length > docStart && out[docStart]!.notes === s.notes;
    if (!sameDoc) {
      docStart = out.length;
      furthest = -1;
    }

    const marked = s.chapter !== null || s.leaves[0]?.marker?.kind === 'book';
    if (marked && placeOf(s) <= furthest) {
      // everything marked so far in this document was its contents
      const contents = out.splice(docStart);
      out.push({
        book:    contents[0]!.book,
        chapter: null,
        leaves:  contents.flatMap((c) => c.leaves),
        notes:   s.notes,
      });
      docStart = out.length;
      furthest = -1;
    }

    out.push(s);
    furthest = marked ? Math.max(furthest, placeOf(s)) : furthest;
  });

  return out;
};

// Segments without tables of contents' entries: a marker with almost no text after it is merged
// into what it belongs to (a chapter's into the segment before it; a book's, a heading, into the
// segment after). A book's opening long enough to be a chapter, before its chapter 2, is its
// chapter 1 (a first chapter left unmarked).
export const cleanSegments = (segments: Segment[]): Segment[] => {
  const out: Segment[] = [];

  withoutContents(segments).forEach((s, i, all) => {
    const tiny = segmentWords(s) < MIN_SEGMENT_WORDS;
    const prev = out[out.length - 1];
    const next = all[i + 1];

    if (tiny && s.chapter !== null && prev && prev.notes === s.notes) {
      prev.leaves.push(...s.leaves);
    }
    else if (tiny && s.chapter === null && next && next.notes === s.notes) {
      next.leaves.unshift(...s.leaves);
      if (next.book === null || s.book !== null) {
        next.book = s.book ?? next.book;
      }
    }
    else {
      out.push(s);
    }
  });

  return out.map((s, i) => {
    const next = out[i + 1];
    return s.chapter === null && s.book !== null && next?.book === s.book && next.chapter === 2
      && segmentWords(s) >= 100
      ? { ...s, chapter: 1 }
      : s;
  });
};

const ROMAN: [number, string][] = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'],
                                   [5, 'V'], [4, 'IV'], [1, 'I']];
const roman                     = (n: number): string => {
  let rest = n;
  return ROMAN.reduce((out, [value, digits]) => {
    const times = Math.floor(rest / value);
    rest       -= times * value;
    return out + digits.repeat(times);
  }, '');
};

// A segment's label: "Book II, Chapter 3", "Chapter 3", "Book II", or for front matter its first
// heading ("Preface")
const labelOf = (s: Segment): string => [
  ...(s.book === null ? [] : [`Book ${ roman(s.book) }`]),
  ...(s.chapter === null ? [] : [`Chapter ${ s.chapter }`]),
].join(', ') || (s.leaves.find((l) => l.heading)?.text.slice(0, 60) ?? 'Introduction');

const block = (label: PageBlock['label'], html: string): PageBlock => (
  { bbox: [0, 0, 0, 0], label, html, citations: [] }
);

// A work's pages: a page per segment, in order, numbered from 1, cited by its book and chapter
// (its chapter alone for a work of one book; front matter, and a book's opening, by what it has).
// Each page is headed by the work's title, and has the footnotes its text refers to.
export const workPages = (
  title: string, documents: EpubDocument[], reading: WorkReading = {}
): WorkPage[] => {
  const segments = cleanSegments(segmentsOf(documents, reading));
  const hasBooks = segments.some((s) => s.book !== null);
  const placed   = new Set<Note>();

  return segments.map((s, i) => {
    const notes = s.leaves.flatMap((l) => l.noteRefs).flatMap((id) => {
      const note = s.notes.get(id);
      if (note && !placed.has(note)) {
        placed.add(note);
        return [note];
      }
      else {
        return [];
      }
    });
    const parts: CitationPart[] = [
      ...(hasBooks && s.book !== null ? [{ type: 'book', value: s.book }] : []),
      ...(s.chapter === null || (hasBooks && s.book === null) ? [] : [{ type: 'chapter', value: s.chapter }]),
    ];

    return {
      pageNumber:        i + 1,
      printedPageNumber: labelOf(s),
      citationParts:     parts,
      blocks:            [
        block('PageHeader', `<p>${ escape(title) }</p>`),
        ...s.leaves.map((l) => (
          l.heading ? block('SectionHeader', `<h3>${ l.html }</h3>`) : block('Text', `<p>${ l.html }</p>`)
        )),
        ...notes.map((n) => block('Footnote', `<p><sup>${ escape(n.number) }</sup> ${ n.html }</p>`)),
      ],
    };
  });
};
