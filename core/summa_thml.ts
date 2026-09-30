// The Summa Theologiae from CCEL's ThML edition (../thml/summa.xml) as book pages: one page per
// article, a contents page at the start of each question (its title, Aquinas' prologue, and its
// articles), and a page for each prologue or note that stands outside a question. Pure functions;
// book_importers/summa_thml.ts reads the file and saves the pages.
//
// The ThML nests div1 (a part: FP, FS, SS, TP, XP, and the appendix), div2 (a treatise), div3 (a
// question, id "FP_Q2") and div4 (an article, id "FP_Q2_A1"). It is parsed with regular expressions
// rather than an HTML parser: empty paragraphs are written <p id="..." />, which HTML parsers read
// as an open <p> swallowing what follows.
import type { Page, PageBlock } from '../types.ts';
import { scripRefCitations } from './thml.ts';

// The book's id in the database
export const SUMMA_BOOK_ID = 'summa-theologiae';

// The parts, by the id prefix of their questions: the name for page headers, and a short form for
// page labels
export const PARTS: Record<string, { name: string, short: string }> = {
  FP:  { name: 'Prima Pars', short: 'I' },
  FS:  { name: 'Prima Secundae Partis', short: 'I-II' },
  SS:  { name: 'Secunda Secundae Partis', short: 'II-II' },
  TP:  { name: 'Tertia Pars', short: 'III' },
  XP:  { name: 'Supplementum Tertiae Partis', short: 'Suppl.' },
  AP1: { name: 'Supplementum Tertiae Partis, Appendix 1', short: 'Suppl. App. 1' },
  AP2: { name: 'Supplementum Tertiae Partis, Appendix 2', short: 'Suppl. App. 2' },
};

// One part of a citation of a page: { type: 'question', value: 2 }
export type CitationPart = { type: string, value: number };

// The parts of the Summa as cited, by their short form in page labels: the book, numbered I = 1,
// I-II = 2, II-II = 3, III = 4, Supplement = 5, and for the appendices to the Supplement, which one
const CITED_PARTS: Record<string, CitationPart[]> = {
  'I':             [{ type: 'book', value: 1 }],
  'I-II':          [{ type: 'book', value: 2 }],
  'II-II':         [{ type: 'book', value: 3 }],
  'III':           [{ type: 'book', value: 4 }],
  'Suppl.':        [{ type: 'book', value: 5 }],
  'Suppl. App. 1': [{ type: 'book', value: 5 }, { type: 'appendix', value: 1 }],
  'Suppl. App. 2': [{ type: 'book', value: 5 }, { type: 'appendix', value: 2 }],
};

// How a Summa page is cited, from its label (its printed page number): "I-II q. 3 a. 2" -> book 2,
// question 3, article 2; a question's contents page "I q. 2" -> book 1, question 2; a prologue
// "III prol." -> book 4. null for a label that isn't one of these.
export const summaCitationParts = (printedPageNumber: string): CitationPart[] | null => {
  const m    = printedPageNumber.match(/^(.+?)(?: prol\.| q\. (\d+)(?: a\. (\d+))?)$/);
  const part = m ? CITED_PARTS[m[1]!] : undefined;

  if (!m || !part) {
    return null;
  }
  else {
    return [
      ...part,
      ...(m[2] ? [{ type: 'question', value: Number(m[2]) }] : []),
      ...(m[3] ? [{ type: 'article', value: Number(m[3]) }] : []),
    ];
  }
};

// div1s that are not part of the text
const SKIPPED_DIV1 = new Set(['i', 'viii']);   // the title page, the indexes

export type Div = {
  level: number,
  id: string,
  title: string,
  shortTitle: string,   // the label CCEL gives it in contents ("Chapter V", "Book I")
  kind: string,         // its ThML type ("Chapter", "Book"), '' when it has none
  own: string,          // this div's HTML without its child divs
  children: Div[],
};

const attr = (attrs: string, name: string) => (
  attrs.match(new RegExp(`\\b${ name }="([^"]*)"`))?.[1] ?? ''
);

// The div tree of the ThML body
export const parseDivs = (xml: string): Div[] => {
  const root: Div = {
    level: 0, id: '', title: '', shortTitle: '', kind: '', own: '', children: [],
  };
  const stack     = [root];
  const tag       = /<(\/?)div(\d)\b([^>]*)>/g;
  let last        = 0;

  for (let m = tag.exec(xml); m; m = tag.exec(xml)) {
    stack[stack.length - 1]!.own += xml.slice(last, m.index);
    last                          = m.index + m[0].length;

    if (m[1] === '/') {
      stack.pop();
    }
    else {
      const div: Div = {
        level:      Number(m[2]),
        id:         attr(m[3]!, 'id'),
        title:      attr(m[3]!, 'title'),
        shortTitle: attr(m[3]!, 'shorttitle'),
        kind:       attr(m[3]!, 'type'),
        own:        '',
        children:   [],
      };
      stack[stack.length - 1]!.children.push(div);
      if (!m[3]!.trim().endsWith('/')) {
        stack.push(div);
      }
    }
  }

  return root.children;
};

// A paragraph's HTML for the page: empty anchors dropped, links and scripture references kept as
// their text ("(Q[70], A[1])"), whitespace collapsed
export const cleanHtml = (html: string): string => (
  html
    .replace(/<a\b[^>]*\/>/g, '')
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/g, '$1')
    .replace(/<scripRef\b[^>]*>([\s\S]*?)<\/scripRef>/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
);

// The non-empty paragraphs of some HTML, as ThML (scripRefs and notes kept, for scripRefCitations)
const rawParagraphs = (html: string): string[] => (
  [...html.matchAll(/<p\b[^>]*?(?:\/>|>([\s\S]*?)<\/p>)/g)]
    .map((m) => m[1] ?? '')
    .filter((p) => cleanHtml(p))
);

// The non-empty paragraphs of some HTML, cleaned
export const paragraphs = (html: string): string[] => rawParagraphs(html).map(cleanHtml);

export const heading = (html: string, tagName: string): string => {
  const m = html.match(new RegExp(`<${ tagName }\\b[^>]*>([\\s\\S]*?)</${ tagName }>`));
  return m ? cleanHtml(m[1]!).replace(/<[^>]+>/g, '') : '';
};

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with',
]);

// A heading as the ThML gives it, tidied: "(EIGHT ARTICLES)" dropped, and an all-capitals heading
// put in title case ("OF THE SIMPLICITY OF GOD" -> "Of the Simplicity of God")
export const tidyTitle = (title: string): string => {
  const bare = title.replace(/\s*\((?:[A-Z-]+|\d+) ARTICLES?\)\s*$/i, '').trim();

  if (bare !== bare.toUpperCase()) {
    return bare;
  }
  else {
    return bare.toLowerCase().replace(/[\p{L}']+/gu, (word, offset: number) => (
      offset > 0 && SMALL_WORDS.has(word) ? word : word[0]!.toUpperCase() + word.slice(1)
    ));
  }
};

export const block = (label: PageBlock['label'], html: string): PageBlock => ({
  bbox: [0, 0, 0, 0], label, html, citations: [],
});

const headers = (items: string[]) => items.map((item) => block('PageHeader', `<p>${ item }</p>`));

export const escapeHtml = (text: string) => (
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
);

// A page's paragraphs as Text blocks, with a <sup> number after each citation in them (numbered from
// 1 across the page), and a Footnote block for each, carrying its citations: "<sup>3</sup> Jn. 14:6".
// The citations' footnotePage is set once pages are numbered (see summaPages).
const textWithFootnotes = (raw: string[], bookId: string) => {
  const text: PageBlock[]      = [];
  const footnotes: PageBlock[] = [];

  for (const paragraph of raw) {
    const marked = scripRefCitations(paragraph, { bookId, footnotePage: 0 }, footnotes.length + 1);
    text.push(block('Text', `<p>${ cleanHtml(marked.html) }</p>`));
    footnotes.push(...marked.footnotes.map((f) => ({
      ...block('Footnote', `<p><sup>${ f.identifier }</sup> ${ escapeHtml(f.raw) }</p>`),
      citations: f.citations,
    })));
  }

  return { text, footnotes };
};

type PagePlan = Omit<Page, 'pageNumber'>;

const prologuePage = (partId: string, title: string, raw: string[], bookId: string): PagePlan => {
  const { text, footnotes } = textWithFootnotes(raw, bookId);

  return {
    printedPageNumber: PARTS[partId]!.short + ' prol.',
    blocks:            [
      ...headers([PARTS[partId]!.name, 'Prologue']),
      block('SectionHeader', `<h3>${ tidyTitle(title) }</h3>`),
      ...text,
      ...footnotes,
    ],
  };
};

const questionPages = (partId: string, question: Div, bookId: string): PagePlan[] => {
  const part     = PARTS[partId]!;
  const number   = Number(question.id.match(/_Q(\d+)$/)![1]);
  const title    = tidyTitle(heading(question.own, 'h3') || question.title);
  const articles = question.children
    .filter((d) => /_A\d+$/.test(d.id))
    .map((d) => ({
      number: Number(d.id.match(/_A(\d+)$/)![1]),
      title:  heading(d.own, 'h4'),
      body:   textWithFootnotes(rawParagraphs(d.own), bookId),
    }));
  const prologue = textWithFootnotes(rawParagraphs(question.own), bookId);

  const contents: PagePlan = {
    printedPageNumber: `${ part.short } q. ${ number }`,
    blocks:            [
      ...headers([part.name, `Question ${ number }`]),
      block('SectionHeader', `<h3>Question ${ number }: ${ title }</h3>`),
      ...prologue.text,
      ...(articles.length
        ? [block('Text', '<ul>' + articles.map((a) => (
            `<li><b>Article ${ a.number }.</b> ${ a.title }</li>`
          )).join('') + '</ul>')]
        : []),
      ...prologue.footnotes,
    ],
  };

  return [
    contents,
    ...articles.map((a) => ({
      printedPageNumber: `${ part.short } q. ${ number } a. ${ a.number }`,
      blocks:            [
        ...headers([part.name, `Question ${ number }`, `Article ${ a.number }`]),
        block('SectionHeader', `<h4>Article ${ a.number }. ${ a.title }</h4>`),
        ...a.body.text,
        ...a.body.footnotes,
      ],
    })),
  ];
};

// The part a question or prologue belongs to, from its id ("FS_Q1", "AP1_Q2") or, for a prologue,
// its part's div1 id
const partOf = (id: string, div1Id: string): string | undefined => {
  const prefix = id.match(/^([A-Z]+\d?)_Q\d+$/)?.[1];
  return prefix && PARTS[prefix] ? prefix : PARTS[div1Id] ? div1Id : undefined;
};

// The pages of the Summa, in reading order, numbered from 1, their citations footnoted
export const summaPages = (xml: string, bookId = SUMMA_BOOK_ID): Page[] => {
  const body              = xml.slice(xml.indexOf('<ThML.body'));
  const plans: PagePlan[] = [];

  for (const div1 of parseDivs(body).filter((d) => d.level === 1 && !SKIPPED_DIV1.has(d.id))) {
    for (const div2 of div1.children) {
      const questions = div2.children.filter((d) => /_Q\d+$/.test(d.id));
      const intro     = rawParagraphs(div2.own);
      // the appendix's note has no part of its own: it goes with the first appendix
      const introPart = partOf(questions[0]?.id ?? '', div1.id);

      if (intro.length && introPart) {
        plans.push(prologuePage(introPart, heading(div2.own, 'h2') || div2.title, intro, bookId));
      }

      for (const div3 of div2.children) {
        const part = partOf(div3.id, div1.id);

        if (!part) {
          continue;
        }
        else if (/_Q\d+$/.test(div3.id)) {
          plans.push(...questionPages(part, div3, bookId));
        }
        else {
          // a prologue written as its own section (the Prologue to the First Part of the Second Part)
          plans.push(prologuePage(
            part, heading(div3.own, 'h3') || div3.title, rawParagraphs(div3.own), bookId
          ));
        }
      }
    }
  }

  // now that pages are numbered, the footnotes' citations can say which page they are on
  return plans.map((p, i) => ({
    pageNumber: i + 1,
    ...p,
    blocks:     p.blocks.map((b) => ({
      ...b,
      citations: b.citations.map((c) => ({ ...c, source: { ...c.source, footnotePage: i + 1 } })),
    })),
  }));
};
