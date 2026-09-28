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

// A footnote made for a citation in the text: its number (the <sup> inserted after the citation),
// whether it cites scripture or other works, the citation as printed, and its Citations: one, or
// several for a parenthesis citing several works ("Metaph. xii; De Anima iii")
//
// A <note> in the text is a footnote of kind 'note': raw is its plain text, and its citations are
// what it cites (scripture and works within it, or the whole note when it is a citation itself,
// "Ecc. Hist. v. 19. p. 146.")
export type ThmlFootnote = {
  identifier: string,
  kind: 'scripture' | 'work' | 'note',
  raw: string,
  citations: Citation[],
};

// A citation of another work, from the text in parentheses: "Coel. Hier. xii" -> title
// "Coel. Hier.", location "xii"; "Dionysius, De Div. Nom. iv" also names the author
export type WorkReference = { author: string, title: string, location: string };

const ROMAN = /^(?=[ivxlcdm])m{0,4}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/;

// A number, a Roman numeral all in lower or upper case (a capitalized word such as "Civ." is part
// of a title), or a section mark, with its punctuation
const isLocator = (token: string) => {
  const bare = token.replace(/[.,;:]+$/, '');
  return /^(?:\d+[a-z]?|§+\s*\d*|\d+[–-]\d+)$/.test(bare)
    || ((bare === bare.toLowerCase() || bare === bare.toUpperCase())
      && ROMAN.test(bare.toLowerCase()));
};

// Title words: capitalized, abbreviated ("lit."), or joining words ("De Coelo et Mundo"); no digits
const CONNECTORS  = new Set([
  'de', 'in', 'ad', 'et', 'contra', 'cont', 'super', 'ex', 'pro', 'adv', 'of', 'on', 'the', 'and',
]);
const isTitleWord = (token: string) => (
  !/\d/.test(token) && (
    /^[A-ZÀ-Þ]/.test(token) || /\.$/.test(token)
      || CONNECTORS.has(token.toLowerCase().replace(/[.,]$/, ''))
  )
);

// Words that start a location when a number follows: "p. 133", "sec. 28", "lib. i", "col. 391"
const LOCATION_LABELS = new Set([
  'p', 'pp', 'col', 'c', 'cap', 'sec', 'sect', 'lib', 'vol', 'n', 'no', 'lect', 'text', 't', 'art',
  'q', 'qu', 'ch', 'chap', 'l',
]);
const isLabel         = (token: string, next: string | undefined) => (
  LOCATION_LABELS.has(token.toLowerCase().replace(/\.$/, '')) && !!next && isLocator(next)
);

// References within the book itself, not citations of another work
const INTERNAL_TITLES = new Set([
  'chapter', 'chap', 'ch', 'book', 'bk', 'vol', 'part', 'question', 'q', 'article', 'art', 'note',
  'page', 'p', 'sect', 'section', 'see', 'cf',
]);

// The citation in a parenthesis, or null if it isn't one: "(1)", "(i.e., the prophets)",
// "(Q[70], A[1])", "(FOUR ARTICLES)" and "(Orthodox)" are not
export const workReference = (text: string): WorkReference | null => {
  const plain = text.replace(/^\s*(?:cf|see)\.?\s+/i, '').replace(/\s+/g, ' ').trim();
  const named = plain.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)?),\s+(.*)$/);

  // "Dionysius, De Div. Nom. iv" names the author; in "Stromata, lib. i" the name is the title
  return (named && parseWorkReference(plain, named)) || parseWorkReference(plain, null);
};

const parseWorkReference = (plain: string, named: RegExpMatchArray | null): WorkReference | null => {
  const cited = named ? named[2]! : plain;
  const words = cited.split(' ');

  // a number before the first title word is part of the title ("1 Poster.")
  const lead = /^\d$/.test(words[0] ?? '') && isTitleWord(words[1] ?? '') ? 1 : 0;
  // where the location starts: a locator, or a label before one ("p. 133"). A single capital
  // before a title word is an initial ("C. Ar."), not a numeral.
  const at       = words.findIndex((w, i) => i >= lead && (
    isLabel(w, words[i + 1])
      || (isLocator(w) && !(
        /^[A-Z]\.$/.test(w) && isTitleWord(words[i + 1] ?? '')
          && !isLocator(words[i + 1] ?? '') && !isLabel(words[i + 1] ?? '', words[i + 2])
      ))
  ));
  const title    = at > lead ? words.slice(0, at) : [];
  const location = words.slice(Math.max(at, 0));
  // lowercase words ("Ath. Ap. de fuga") are title words only in a title with an abbreviation
  const titleOk = title.slice(lead).every((w) => (
    isTitleWord(w) || (!/\d/.test(w) && title.some((t) => /[a-z]\.$/i.test(t)))
  ));

  // a place and a year ("Rome, 1742", "Verona, 1745") is where a book was published, not a
  // location in it; after a title like "Relig. Hist." the number is a page
  const yearOnly = location.length === 1 && /^\d{4}[.,]?$/.test(location[0]!)
    && title.length === 1 && !/\.$/.test(title[0]!.replace(/,$/, ''));

  if (plain.length > 120 || /\[/.test(plain) || plain === plain.toUpperCase() || location.length > 16
    || yearOnly) {
    return null;
  }
  else if (named && at === 0 && ROMAN.test(words[0]!.replace(/[.,;:]+$/, '').toLowerCase())) {
    // an author and a location only: "Neale, i. 61", "Sozomen, vi, 19"
    return { author: named[1]!, title: '', location: cited.replace(/[.,;]+$/, '') };
  }
  else if (!title.length || title.length > 6 || !/^(?:\d\s)?[A-ZÀ-Þ]/.test(cited)) {
    return null;
  }
  else if (!titleOk || (title.length === 1 && /^[A-Z]$/.test(title[0]!))) {
    return null;
  }
  else if (title.length === 1 && INTERNAL_TITLES.has(title[0]!.toLowerCase().replace(/[.,]$/, ''))) {
    return null;
  }
  else {
    return {
      author:   named ? named[1]! : '',
      title:    title.join(' ').replace(/,$/, ''),
      location: location.join(' ').replace(/[.,;]+$/, ''),
    };
  }
};

// The works cited in a parenthesis: one per ";"-separated part ("Metaph. xii, text. 51; De Anima
// iii"). A part that is only a location ("i, 3; ii, 5") is in the work before it. None when the
// first part isn't a citation.
export const workReferences = (text: string): WorkReference[] => {
  const refs: WorkReference[] = [];

  for (const part of text.split(/;\s*/).filter((p) => p.trim())) {
    const ref  = workReference(part);
    const prev = refs[refs.length - 1];

    if (ref) {
      refs.push(ref);
    }
    else if (prev && isLocator(part.trim().split(/\s+/)[0]!)) {
      refs.push({ ...prev, location: part.trim().replace(/[.,;]+$/, '') });
    }
    else if (!prev) {
      return [];
    }
  }

  return refs;
};

// Capitalized words that start sentences or name God, not authors
const NOT_AUTHORS = new Set([
  'Therefore', 'But', 'Further', 'Hence', 'Now', 'Thus', 'For', 'And', 'Again', 'Moreover',
  'Wherefore', 'Consequently', 'Accordingly', 'Objection', 'Reply', 'As', 'So', 'Since', 'Whence',
  'Also', 'Or', 'Yet', 'If', 'When', 'While', 'Because', 'Nor', 'Then', 'The', 'God', 'Christ',
  'Lord',
]);

// The author named just before a citation: "Dionysius says (", "as Damascene says (", "the
// Philosopher (", "Tertullian (". "" when there is none.
const authorBefore = (html: string, at: number): string => {
  const before = plainText(html.slice(Math.max(0, at - 200), at));
  const m      = before.match(new RegExp(
    '\\b([A-Z][a-z]+(?: [A-Z][a-z]+)?)\\s*(?:,?\\s*(?:says|said|writes|states|observes|declares'
      + '|teaches|remarks|tells us|affirms|explains|argues|adds))?[\\s,:]*$'
  ));
  // "As Augustine says" matches "As Augustine": keep the name
  return m ? m[1]!.split(' ').filter((w) => !NOT_AUTHORS.has(w)).join(' ') : '';
};

type Found = {
  at: number,
  insertAt: number,
  replaces?: number,     // characters at insertAt the <sup> replaces (a note's placeholder)
  kind: ThmlFootnote['kind'],
  raw: string,
  make: (identifier: string) => Citation[],
};

// Mark the citations in a piece of ThML with footnote numbers, and return the footnotes. First
// each <note> is replaced by its number and becomes a footnote of its own; then, in the text around
// the notes, the citations:
// scripture (<scripRef> elements, and untagged ones like "(Ps. 118)") and other works
// ("(Coel. Hier. xii)", "(Apol. XVI.)"). A <sup>n</sup> goes after each citation, or after its
// closing parenthesis when the citation fills it. Numbers run from firstIdentifier in the order
// the citations appear, so a page can be numbered across several calls (the next one starts at
// firstIdentifier + footnotes.length). source is the page the footnotes will be on.
//
// A work's Citation has the author named in or just before the parentheses, if any ("Dionysius",
// "Philosopher" for "the Philosopher"; a guess from the text), and no parsed locations. A scripRef that isn't scripture
// (CCEL also tags letters: "Ep. 137") gets no footnote.
// Placeholders for <note>s while the text is searched: NOTE_MARK + index + NOTE_MARK, with a
// private-use character, which doesn't occur in ThML text
const NOTE_MARK  = '\ue000';
const NOTE_MARKS = /\ue000(\d+)\ue000/g;

export const scripRefCitations = (
  thml: string,
  source: { bookId: string, footnotePage: number },
  firstIdentifier = 1,
): { html: string, footnotes: ThmlFootnote[] } => {
  const citation = (
    identifier: string, rest: Omit<Citation, 'source' | 'referenceBookId'>
  ): Citation => ({
    source: {
      bookId:             source.bookId,
      footnoteIdentifier: identifier,
      footnotePage:       source.footnotePage,
    },
    referenceBookId: null,
    ...rest,
  });
  const bible    = (raw: string, passages: Passage[]) => (identifier: string) => [citation(identifier, {
    author:         'Bible',
    title:          bookName(passages[0]!.book),
    location:       locationText(passages),
    raw,
    locationsCited: passageLocations(passages),
  })];

  // the text with each <note> swapped for a placeholder, so that what a note contains isn't taken
  // for citations in the text; the placeholder is where the note's <sup> goes
  const notes: string[] = [];
  const text            = thml.replace(/<note\b[^>]*>([\s\S]*?)<\/note>/g, (_, content: string) => {
    notes.push(content);
    return NOTE_MARK + (notes.length - 1) + NOTE_MARK;
  });
  const withoutNotes    = (html: string) => html.replace(NOTE_MARKS, '');

  // what a note cites, all under the note's number: the scripture and works in it, or, when it has
  // none, the whole note if it is a citation ("Ep. LXXXI.", "cf. Ecc. Hist. p. 146.")
  const noteCitations = (content: string, identifier: string): Citation[] => {
    const within = scripRefCitations(content, source).footnotes.flatMap((f) => f.citations);
    const whole  = within.length ? [] : workReferences(plainText(content)).map((w) => citation('', {
      author:         w.author,
      title:          w.title,
      location:       w.location,
      raw:            plainText(content),
      locationsCited: [],
    }));

    return [...within, ...whole].map((c) => ({
      ...c, source: { ...c.source, footnoteIdentifier: identifier },
    }));
  };

  const found: Found[] = [];

  for (const m of text.matchAll(NOTE_MARKS)) {
    const content = notes[Number(m[1])]!;
    found.push({
      at:       m.index,
      insertAt: m.index,
      replaces: m[0].length,
      kind:     'note',
      raw:      plainText(content),
      make:     (identifier) => noteCitations(content, identifier),
    });
  }

  for (const m of text.matchAll(/<scripRef\b([^>]*)>([\s\S]*?)<\/scripRef>/g)) {
    const parsed   = attribute(m[1]!, 'parsed');
    const passage  = attribute(m[1]!, 'passage') ?? plainText(m[2]!);
    const passages = parsed ? parsedPassages(parsed) : printedPassages(passage);
    const end      = m.index + m[0].length;
    // "(Jn. 14:6)": the number goes after the parenthesis
    const filled = /\(\s*$/.test(text.slice(Math.max(0, m.index - 20), m.index))
      && /^\s*\)/.test(text.slice(end, end + 20));
    const raw    = plainText(m[2]!) || passage.trim();

    if (passages.length) {
      found.push({
        at:       m.index,
        insertAt: filled ? text.indexOf(')', end) + 1 : end,
        kind:     'scripture',
        raw,
        make:     bible(raw, passages),
      });
    }
  }

  for (const m of text.matchAll(/\(([^()]{1,200})\)/g)) {
    const inner    = withoutNotes(m[1]!);
    const raw      = plainText(inner);
    const works    = /<scripRef\b|<\/?(?:p|div\d?)\b/.test(inner) ? [] : workReferences(raw);
    const passages = works.length === 1 && !works[0]!.title.includes(' ') ? printedPassages(raw) : [];
    const insertAt = m.index + m[0].length;

    if (passages.length) {
      found.push({ at: m.index, insertAt, kind: 'scripture', raw, make: bible(raw, passages) });
    }
    else if (works.length) {
      // the text just before, without notes (authorBefore reads the last 200 characters)
      const preceding = withoutNotes(text.slice(Math.max(0, m.index - 400), m.index));
      const before    = authorBefore(preceding, preceding.length);
      found.push({
        at:   m.index,
        insertAt,
        kind: 'work',
        raw,
        make: (identifier) => works.map((w) => citation(identifier, {
          author:         w.author || before,
          title:          w.title,
          location:       w.location,
          raw,
          locationsCited: [],
        })),
      });
    }
  }

  found.sort((a, b) => a.at - b.at);
  const footnotes = found.map((f, i): ThmlFootnote => {
    const identifier = String(firstIdentifier + i);
    return { identifier, kind: f.kind, raw: f.raw, citations: f.make(identifier) };
  });

  // the text with each <sup> at its place (in place of a note's placeholder), in one pass
  const inserts          = found
    .map((f, i) => ({
      at: f.insertAt, replaces: f.replaces ?? 0, sup: `<sup>${ footnotes[i]!.identifier }</sup>`,
    }))
    .sort((a, b) => a.at - b.at);
  const pieces: string[] = [];
  let from               = 0;
  for (const { at, replaces, sup } of inserts) {
    pieces.push(text.slice(from, at), sup);
    from = at + replaces;
  }
  pieces.push(text.slice(from));

  return { html: pieces.join(''), footnotes };
};
