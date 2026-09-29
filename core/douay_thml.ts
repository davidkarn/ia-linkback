// The Douay-Rheims Bible from CCEL's ThML edition (../thml/douayr.xml) as book pages: one page per
// chapter of each book, its verses a paragraph each, cited by book (its number in the Douay canon,
// core/bible.ts) and chapter. Pure functions; book_importers/douay_thml.ts reads the file and
// saves the pages.
//
// The ThML nests div1 (a testament), div2 (a book, id its OSIS code with a Roman prefix: "iKgs" is
// 3 Kings) and div3 (a chapter, "Gen.1"), its verses marked <scripture passage="Gen 1:1" /> and
// <sup>1</sup>. It follows the Protestant arrangement in two places, put back in the Vulgate's
// here, the numbering Catholic sources cite: the Prayer of Azariah is its own book (Daniel
// 3:24-90), with Daniel 3:24-4:3 numbered 3:24-30 and 4:1-3; and the Greek additions to Esther
// (10:4-16:24) are a book of their own.
import type { Page, PageBlock } from '../types.ts';
import { DOUAY_CANON, printedBookNumber } from './bible.ts';
import { block, cleanHtml, escapeHtml, parseDivs, type CitationPart, type Div } from './summa_thml.ts';

export const DOUAY_BOOK_ID = 'douay-rheims';

export type Verse = { number: number, html: string };

// number: null for a book's prologue (Ecclesiasticus has one, its id "Sir.i")
export type DouayChapter = { number: number | null, verses: Verse[] };

export type DouayBook = {
  id: string,              // the div2 id: "Gen", "iKgs", "PrAzar"
  name: string,            // "Genesis", "3 Kings", "1 Kings"
  heading: string,         // "The Book of Genesis"
  introduction: string,    // the note before its first chapter, HTML ('' when none)
  testament: string,       // "Old Testament"
  chapters: DouayChapter[],
};

const attrText = (html: string) => cleanHtml(html).replace(/<[^>]+>/g, '').trim();

const firstTag = (html: string, tag: string) => (
  html.match(new RegExp(`<${ tag }\\b[^>]*>([\\s\\S]*?)</${ tag }>`))?.[1] ?? ''
);

// A chapter's verses, in order: each <scripture /> marker starts one, its number in the <sup>
export const versesOf = (html: string): Verse[] => (
  html
    .replace(/<h\d\b[\s\S]*?<\/h\d>/g, '')
    .replace(/<\/?p\b[^>]*>/g, '')
    .split(/<scripture\b[^>]*\/>/)
    .flatMap((piece) => {
      const m = piece.match(/^\s*<sup>(\d+)<\/sup>([\s\S]*)$/);
      return m ? [{ number: Number(m[1]), html: cleanHtml(m[2]!) }] : [];
    })
);

// The books in the file, as it arranges them
export const parseDouay = (xml: string): DouayBook[] => {
  const body = xml.slice(xml.indexOf('<ThML.body'));

  return parseDivs(body).filter((d) => d.level === 1).flatMap((testament: Div) => (
    testament.children.filter((d) => d.level === 2).map((book) => ({
      id:           book.id,
      name:         book.title.replace(/,\s*alias\b.*$/, '').trim(),
      heading:      attrText(firstTag(book.own, 'h2')) || book.title,
      introduction: cleanHtml(firstTag(book.own, 'h4')),
      testament:    testament.title,
      chapters:     book.children.filter((d) => d.level === 3).map((chapter) => {
        const number = Number(chapter.id.split('.').pop());
        return { number: Number.isInteger(number) ? number : null, verses: versesOf(chapter.own) };
      }),
    }))
  ));
};

const renumber = (verses: Verse[], by: number) => verses.map((v) => ({ ...v, number: v.number + by }));

// The books in the Vulgate's arrangement (see the top of the file): the Prayer of Azariah back in
// Daniel 3, and the additions to Esther back in Esther. Left as they are if the file isn't shaped
// as expected.
export const toVulgate = (books: DouayBook[]): DouayBook[] => {
  const find      = (id: string) => books.find((b) => b.id === id);
  const prayer    = find('PrAzar')?.chapters[0];
  const additions = find('AddEsth');

  return books.flatMap((book): DouayBook[] => {
    const chapter = (n: number) => book.chapters.find((c) => c.number === n);
    const dan3    = chapter(3), dan4 = chapter(4);

    if (book.id === 'Dan' && prayer && dan3 && dan4 && dan3.verses.length === 30) {
      const daniel3 = [
        ...dan3.verses.slice(0, 23),
        ...renumber(prayer.verses, 23),        // 24-90
        ...renumber(dan3.verses.slice(23), 67), // 91-97
        ...renumber(dan4.verses.slice(0, 3), 97), // 98-100
      ];
      return [{ ...book,
                chapters: book.chapters.map((c) => (
                  c.number === 3 ? { number: 3, verses: daniel3 }
                    : c.number === 4 ? { number: 4, verses: renumber(dan4.verses.slice(3), -3) }
                      : c
                )) }];
    }
    else if (book.id === 'Esth' && additions) {
      const added  = (n: number) => additions.chapters.find((c) => c.number === n)?.verses ?? [];
      const merged = book.chapters.map((c) => ({ ...c, verses: [...c.verses, ...added(c.number)] }));
      const later  = additions.chapters.filter((c) => !book.chapters.some((b) => b.number === c.number));
      return [{ ...book, chapters: [...merged, ...later].sort((a, b) => a.number - b.number) }];
    }
    else if ((book.id === 'PrAzar' && prayer && find('Dan')) || (book.id === 'AddEsth' && find('Esth'))) {
      return [];
    }
    else {
      return [book];
    }
  });
};

// A book's number in the Douay canon (core/bible.ts), from its name ("3 Kings", "Canticle of
// Canticles"); null for a name that isn't one
export const douayBookNumber = (name: string): number | null => (
  name === 'Canticle of Canticles'
    ? DOUAY_CANON.indexOf('canticles') + 1
    : printedBookNumber(name) ?? (DOUAY_CANON.indexOf(name.toLowerCase()) + 1 || null)
);

export type DouayPage = Page & { citationParts: CitationPart[] };

// The pages of the Bible, a chapter each, the books in the order of the Douay canon (the file puts
// Tobias, Judith and others after the Machabees), numbered from 1: its testament and book as page
// headers, the book's introduction before its first chapter, and a paragraph per verse. Each is
// cited by book and chapter (a prologue as chapter 0). Throws on a book that isn't in the Douay
// canon.
export const douayPages = (books: DouayBook[]): DouayPage[] => {
  const numbered = books.map((book) => ({ book, number: douayBookNumber(book.name) }));
  const unknown  = numbered.find((b) => b.number === null);

  if (unknown) {
    throw new Error(`not a book of the Douay canon: ${ unknown.book.id } "${ unknown.book.name }"`);
  }
  else {
    return numbered
      .sort((a, b) => a.number! - b.number!)
      .flatMap(({ book, number }) => book.chapters.map((chapter, i) => ({
        // a prologue is chapter 0, as the file numbers its verses ("Sir 0:1"): cited by its book
        // alone, every citation of the book would count on it
        printedPageNumber: chapter.number === null ? `${ book.name }, Prologue` : `${ book.name } ${ chapter.number }`,
        citationParts:     [
          { type: 'book', value: number! },
          { type: 'chapter', value: chapter.number ?? 0 },
        ],
        blocks:            [
          block('PageHeader', `<p>${ escapeHtml(book.testament) }</p>`),
          block('PageHeader', `<p>${ escapeHtml(book.heading) }</p>`),
          block('SectionHeader', `<h3>${ escapeHtml(book.name) }, ${
            chapter.number === null ? 'Prologue' : `Chapter ${ chapter.number }` }</h3>`),
          ...(i === 0 && book.introduction
            ? [block('Text', `<p><i>${ book.introduction }</i></p>`)] : []),
          ...chapter.verses.map((v): PageBlock => (
            block('Text', `<p><sup>${ v.number }</sup> ${ v.html }</p>`)
          )),
        ],
      })))
      .map((page, i) => ({ pageNumber: i + 1, ...page }));
  }
};
