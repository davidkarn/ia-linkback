// Boethius's Consolation of Philosophy in H. R. James's translation (1897), from Project
// Gutenberg's HTML (eBook 14328), as pages: one per song (a metre, the work's poems) and per prose
// section, cited as the work is, by book and metre or prose ("iii, pros. 10", "v, metr. 2"). Pure
// functions; book_importers/consolation_gutenberg.ts reads the file and saves the book.
//
// The text runs from the first "BOOK I." heading to the translator's "EPILOGUE." Each book is an
// h2 ("BOOK III."), its songs h3s ("SONG IX.<br> The Hymn to God.") and its prose sections h3s
// of a numeral alone ("IX."); poems are div.poem, a span per line. The translator's footnotes are
// linked from the text ([A] -> div.footnote) and his "References to Quotations in the Text"
// (Bk. V., ch. i., p. 227, l. 16: Aristotle, 'Physics,' II. v. 5.) are by book and prose section:
// both are put on the pages they're about, as footnotes.
import { parse, NodeType, type HTMLElement, type Node } from 'node-html-parser';
import type { CitationPart } from './summa_thml.ts';
import { numberOf } from './fathers_thml.ts';
import type { PageBlock } from '../types.ts';

export type ConsolationPage = {
  pageNumber: number,
  printedPageNumber: string,
  citationParts: CitationPart[],
  blocks: PageBlock[],
};

type Section = {
  book: number,
  kind: 'metre' | 'prose',
  number: number,
  heading: string,
  blocks: PageBlock[],
  noteRefs: string[],
};

const BOOK_HEADING  = /^BOOK\s+([IVX]+)\.?$/;
const SONG_HEADING  = /^SONG\s+([IVX]+)\.?\s*(.*)$/s;
const PROSE_HEADING = /^([IVX]+)\.$/;
const END_HEADING   = /^EPILOGUE\.?$/;
const INLINE_TAGS   = new Set(['i', 'em', 'b', 'strong', 'sup', 'sub', 'small']);

const tagOf   = (el: HTMLElement) => el.rawTagName?.toLowerCase() ?? '';
const classOf = (el: HTMLElement) => (el.getAttribute('class') ?? '').split(/\s+/);
const squash  = (s: string) => s.replace(/\s+/g, ' ').trim();
const escape  = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const block   = (label: PageBlock['label'], html: string): PageBlock => (
  { bbox: [0, 0, 0, 0], label, html, citations: [] }
);

const ROMAN: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman                     = (n: number): string => {
  let rest = n;
  return ROMAN.reduce((out, [value, digits]) => {
    const times = Math.floor(rest / value);
    rest       -= times * value;
    return out + digits.repeat(times);
  }, '');
};

// An element's HTML with only text markup kept: a footnote's anchor ([A]) becomes its letter,
// the print edition's page anchors are left out
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

    if (classOf(el).includes('fnanchor')) {
      return `<sup>${ escape(el.text.replace(/[[\]\s]/g, '')) }</sup>`;
    }
    else if (classOf(el).includes('pagenum') || classOf(el).includes('label')) {
      return '';
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

// A poem as HTML: a paragraph per stanza, a line per span
const poemHtml = (poem: HTMLElement): string[] => {
  const stanzas = poem.querySelectorAll('.stanza');
  return (stanzas.length > 0 ? stanzas : [poem]).map((stanza) => {
    const lines = stanza.querySelectorAll('span').filter((s) => !classOf(s).includes('pagenum'));
    return (lines.length > 0 ? lines : [stanza]).map((l) => squash(inlineHtml(l).replace(/<br\/>/g, ' ')))
      .filter((l) => l.length > 0)
      .join('<br/>');
  }).filter((s) => s.length > 0);
};

// The footnotes' text, by their ids ("Footnote_A_1")
const footnotesOf = (root: HTMLElement): Map<string, { label: string, html: string }> => new Map(
  root.querySelectorAll('div.footnote').flatMap((note) => {
    const id    = note.querySelectorAll('a[id]').map((a) => a.getAttribute('id')!).find((i) => i.startsWith('Footnote'));
    const label = squash(note.querySelector('.label')?.text ?? '').replace(/[[\]]/g, '');
    return id === undefined ? [] : [[id, { label, html: squash(inlineHtml(note.querySelector('p') ?? note)) }]];
  }),
);

// The "References to Quotations in the Text": each quotation's source, by book and prose section
export const quotationReferences = (text: string): { book: number, prose: number, source: string }[] => {
  const refs: { book: number, prose: number, source: string }[] = [];
  let book                                                      = 0;

  for (const m of squash(text).matchAll(
    /(?:Bk\.\s*([IVX]+)\.,\s*)?ch\.\s*([ivx]+)\.,\s*p\.\s*\d+\s*,\s*l\.\s*\d+:\s*(.*?)(?=\s*(?:Bk\.\s*[IVX]+\.,\s*)?ch\.\s*[ivx]+\.,\s*p\.|$)/g,
  )) {
    book = m[1] === undefined ? book : numberOf(m[1])!;
    refs.push({ book, prose: numberOf(m[2]!)!, source: m[3]!.trim() });
  }

  return refs;
};

// The work's pages, a page per song and prose section, in reading order
export const consolationPages = (html: string, title: string): ConsolationPage[] => {
  const root                = parse(html);
  const footnotes           = footnotesOf(root);
  const sections: Section[] = [];
  let book: number | null   = null;
  let ended                 = false;
  let referencesText        = '';
  let inReferences          = false;

  const current = () => sections[sections.length - 1];
  // the footnotes an element refers to ([A] -> "Footnote_A_1")
  const refsIn = (el: HTMLElement) => el.querySelectorAll('a.fnanchor')
    .map((a) => (a.getAttribute('href') ?? '').replace(/^#/, ''));

  const visit = (el: HTMLElement) => {
    const tag  = tagOf(el);
    const text = squash(el.text);

    if (tag === 'ul' && classOf(el).includes('Quot')) {
      referencesText += ' ' + el.text;
    }
    else if (tag === 'h2') {
      const b      = text.match(BOOK_HEADING);
      book         = b ? numberOf(b[1]!) : book;
      ended        = ended || END_HEADING.test(text);
      inReferences = /^REFERENCES TO QUOTATIONS/i.test(text);
    }
    else if (classOf(el).includes('footnote') || classOf(el).includes('TOC') || tag === 'footer'
      || tag === 'header') {
      // the contents, Gutenberg's header and licence, or notes (placed with their references)
    }
    else if ((ended || inReferences || book === null) && ['h3', 'p'].includes(tag)) {
      // before the text or after it
    }
    else if ((ended || inReferences || book === null) && tag === 'div' && classOf(el).includes('poem')) {
      // a poem before the text or after it
    }
    else if (tag === 'h3') {
      // the heading's text without its footnotes' anchors ("SONG IX.[I] Invocation.")
      const plain = el.innerHTML.replace(/<a[^>]*fnanchor[^>]*>.*?<\/a>/gi, '').replace(/<br\s*\/?>/gi, '\n');
      const song  = plain.replace(/<[^>]+>/g, '').trim().match(SONG_HEADING);
      const prose = text.match(PROSE_HEADING);
      if ((song || prose) && book !== null) {
        const number = numberOf((song ?? prose)![1]!)!;
        const kind   = song ? 'metre' : 'prose';
        sections.push({
          book,
          kind,
          number,
          heading:  song ? `Song ${ roman(number) }${ song[2] ? '. ' + squash(song[2]) : '' }` : `Prose ${ roman(number) }`,
          blocks:   [],
          noteRefs: refsIn(el),
        });
      }
    }
    else if (tag === 'div' && classOf(el).includes('poem')) {
      current()?.blocks.push(...poemHtml(el).map((s) => block('Text', `<p>${ s }</p>`)));
      current()?.noteRefs.push(...refsIn(el));
    }
    else if (tag === 'p') {
      if (text.length > 0 && !/^FOOTNOTES:?$/i.test(text) && current()) {
        current()!.blocks.push(block('Text', `<p>${ squash(inlineHtml(el)) }</p>`));
        current()!.noteRefs.push(...refsIn(el));
      }
    }
    else {
      el.childNodes.forEach((n) => n.nodeType === NodeType.ELEMENT_NODE && visit(n as HTMLElement));
    }
  };

  visit(root);

  const quotations = quotationReferences(referencesText);

  return sections.map((s, i) => {
    const label  = `Book ${ roman(s.book) }, ${ s.kind === 'metre' ? 'Song' : 'Prose' } ${ roman(s.number) }`;
    const notes  = s.noteRefs.flatMap((id) => footnotes.get(id) ?? []);
    const quoted = s.kind === 'prose'
      ? quotations.filter((q) => q.book === s.book && q.prose === s.number) : [];

    return {
      pageNumber:        i + 1,
      printedPageNumber: label,
      citationParts:     [{ type: 'book', value: s.book }, { type: s.kind, value: s.number }],
      blocks:            [
        block('PageHeader', `<p>${ escape(title) }</p>`),
        block('PageHeader', `<p>Book ${ roman(s.book) }</p>`),
        block('SectionHeader', `<h3>${ escape(s.heading) }</h3>`),
        ...s.blocks,
        ...notes.map((n) => block('Footnote', `<p><sup>${ escape(n.label) }</sup> ${ n.html }</p>`)),
        ...quoted.map((q) => block('Footnote', `<p>Quoted: ${ escape(q.source) }</p>`)),
      ],
    };
  });
};
