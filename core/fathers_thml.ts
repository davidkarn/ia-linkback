// The Ante-Nicene and Nicene and Post-Nicene Fathers from CCEL's ThML editions
// (../thml/anf01.xml ... npnf214.xml) as books: each volume holds many works,
// each saved as a book of its own with a page per chapter, the scripture,
// notes and other references in its text footnoted. Pure functions;
// book_importers/anf_npnf_thml.ts reads the files and saves the books.
//
// The volumes nest their divs differently: an author's div holding works
// (ANF01 "CLEMENT OF ROME" > "First Epistle to the Corinthians" > chapters),
// a category holding works (ANF03 "Apologetic" > "The Apology"), a work
// divided into books and chapters (City of God > Book I > Chapter 1), or a
// collection of letters or homilies. So works are found by their shape: a
// work is a div, not itself a numbered division ("Book I", "Chapter V",
// "Homily 3"), that holds no other work. Front matter (title pages,
// prefaces, prolegomena, indexes) is left out.
import type { Page, PageBlock } from '../types.ts';
import { decode, norm } from './book_pages.ts';
import { scripRefCitations } from './thml.ts';
import {
  block, cleanHtml, escapeHtml, parseDivs, tidyTitle, type CitationPart, type Div,
} from './summa_thml.ts';

// Front matter by the editors and translators, left out wherever it is
const EDITORIAL = new RegExp('^\\s*(?:(?:second )?title pages?|series title'
  + '|(?:table of )?contents|translator|editor|american editor|introductory (?:notes?'
  + '|notices?|essay)|(?:general |special )?prolegomena|elucidations?|credits|dedication'
  + '|genealogical tables|chronological tables?|comparative table|historical (?:introduction'
  + '|notes?|excursus)|excursus|prefatory (?:note|notice)|additional (?:note|introduction)'
  + '|general note|supplementary notes|manuscripts and editions)\\b'
  + '|\\bindex(?:es)?\\b', 'i');

// More front matter, left out when it stands beside works rather than in one:
// a volume's or an author's preface or introduction
const FRONT = new RegExp('^\\s*(?:preface|introduction|general introduction|introductory'
  + '|bibliograph|works on analytical|dates of treatises|chief events|appended note'
  + '|notes?\\b|testimonies|st\\. chrysostom as a homilist|life and writings)', 'i');

const ORDINALS: Record<string, number>     = {
  first:      1,
  second:     2,
  third:      3,
  fourth:     4,
  fifth:      5,
  sixth:      6,
  seventh:    7,
  eighth:     8,
  ninth:      9,
  tenth:      10,
  eleventh:   11,
  twelfth:    12,
  thirteenth: 13,
  fourteenth: 14,
};
const ROMAN                                = /^(?=[ivxlcdm])m{0,4}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/i;
const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

// "V", "12", "First" as a number; null for anything else
export const numberOf = (token: string): number | null => {
  const t = token.toLowerCase();
  if (/^\d+$/.test(t)) {
    return Number(t);
  }
  else if (ROMAN.test(t)) {
    return [...t].reduce((n, ch, i) => {
      const v    = ROMAN_VALUES[ch]!;
      const next = ROMAN_VALUES[t[i + 1] ?? ''] ?? 0;
      return n + (v < next ? -v : v);
    }, 0);
  }
  else if (ORDINALS[t] !== undefined) {
    return ORDINALS[t];
  }
  else {
    return null;
  }
};

// The kinds of numbered divisions, and the citation location type each is
// cited by (see CitationLocation in types.ts): books, parts, questions and
// lectures by their own; chapters, homilies, letters, sermons, canons and the
// like as chapters
const DIVISION_TYPES: Record<string, string> = { book:     'book',
                                                 part:     'part',
                                                 question: 'question',
                                                 lecture:  'lecture' };
const DIVISION                               = new RegExp('^\\s*(book|chapter|chap|section|sect|part|tractate|tract'
  + '|homily|sermon|lecture|letter|epistle|ep|canon|argument|discourse|oration|question'
  + '|psalm|article|fragment|hymn|demonstration|dialogue|conference|session|paragraph'
  + '|vision|mandate|commandment|similitude|stromata|topic|anathematism)\\.?'
  + '\\s+(?:the\\s+)?([ivxlcdm]+|\\d+|[a-z]+)\\b\\.?', 'i');
const BARE_NUMBER                            = /^\s*([ivxlcdm]+|\d+)\.?\s*$/i;

export type Division = { label: string, type: string | null, value: number };

// A div's numbered division, from its contents label or title: "Chapter V.—
// The martyrdom of Peter and Paul" -> chapter 5, "Book I" -> book 1, "II" ->
// 2 of no type yet (its siblings' type). null for a div that isn't numbered.
export const divisionOf = (div: Pick<Div, 'title' | 'shortTitle'>): Division | null => {
  const found = [div.shortTitle, div.title].map((t) => decode(t)).flatMap((t): Division[] => {
    const labelled = t.match(DIVISION);
    const bare     = t.match(BARE_NUMBER);
    const value    = numberOf(labelled?.[2] ?? bare?.[1] ?? '');

    if (labelled && value !== null) {
      const kind = labelled[1]!.toLowerCase();
      return [{ label: `${ kind[0]!.toUpperCase() + kind.slice(1) } ${ labelled[2] }`,
                type:  DIVISION_TYPES[kind] ?? 'chapter',
                value }];
    }
    else if (bare && value !== null) {
      return [{ label: bare[1]!, type: null, value }];
    }
    else {
      return [];
    }
  });

  return found[0] ?? null;
};

const titleOf = (div: Div) => decode(div.title || div.shortTitle).replace(/\s+/g, ' ').trim();

const isEditorial = (div: Div) => EDITORIAL.test(titleOf(div)) || EDITORIAL.test(div.shortTitle);
const isFront     = (div: Div) => isEditorial(div) || FRONT.test(titleOf(div));

// The divs in a div that are part of the text, and those that could be works
const textChildren = (div: Div) => div.children.filter((c) => !isEditorial(c));
const workChildren = (div: Div) => div.children.filter((c) => !isFront(c));

// Whether a div holds a work, and whether it is one (see the top of the file)
const holdsWork = (div: Div): boolean => workChildren(div).some((c) => isWork(c) || holdsWork(c));
const isWork    = (div: Div): boolean => (
  divisionOf(div) === null && workChildren(div).length > 0 && !holdsWork(div)
);

// A work, found in a volume: its div, and the titles of the divs it is in, the
// nearest first ("CLEMENT OF ROME")
export type FoundWork = { div: Div, within: string[] };

// A work's title naming one of its books or parts: "Against Heresies: Book
// I", "The Conferences of John Cassian. Part II. Containing Conferences XI-XVII"
const BOOK_OF = /^(.+?)[\s:.,;—–-]+(book|part)\s+([ivxlc]+|\d+)\b\.?\s*(?:containing\b.*)?$/i;

// Works that are the books of one work, numbered from 1 in turn, as that work
const mergeBooks = (works: FoundWork[]): FoundWork[] => {
  const made = new Set<Div>();   // the works made here, to add later books to

  return works.reduce<FoundWork[]>((merged, w) => {
    const m        = titleOf(w.div).match(BOOK_OF);
    const last     = merged[merged.length - 1];
    const lastBook = last?.div.children.at(-1);
    const book     = m ? { title: m[1]!, kind: m[2]!, value: numberOf(m[3]!) } : null;
    const asBook   = book && { ...w.div, shortTitle: `${ book.kind } ${ m![3] }` };

    if (book && asBook && last && lastBook && made.has(last.div) && last.div.title === book.title
    && divisionOf(lastBook)?.value === book.value! - 1) {
      last.div.children.push(asBook);
      return merged;
    }
    else if (book && asBook && book.value === 1) {
      const div = { ...w.div, title: book.title, shortTitle: book.title, own: '', children: [asBook] };
      made.add(div);
      return [...merged, { div, within: w.within }];
    }
    else {
      return [...merged, w];
    }
  }, []).map((w) => (
    // a lone "Book I" is left as it was
    made.has(w.div) && w.div.children.length === 1 ? { ...w, div: w.div.children[0]! } : w
  ));
};

// The works in some divs, in reading order. A div beside works that has text
// but no divs of its own ("Letter to a Young Widow") is a work of one page.
// Front matter holding works (NPNF2-09's title page, holding Hilary) is
// looked through.
export const findWorks = (divs: Div[], within: string[] = []): FoundWork[] => mergeBooks(
  divs.flatMap((d) => {
    if (isFront(d)) {
      return holdsWork(d) ? findWorks(d.children, within) : [];
    }
    else if (isWork(d)) {
      return [{ div: d, within }];
    }
    else if (holdsWork(d)) {
      return findWorks(d.children, [titleOf(d), ...within]);
    }
    else if (workChildren(d).length === 0 && blocksOf(d).length > 0) {
      return [{ div: d, within }];
    }
    else {
      return [];
    }
  })
);

// The authors of the works in each volume. A work's author is found by its
// own title (`works`), then by the titles of the divs it is in, the nearest
// first (`within`: an author's div, "CLEMENT OF ROME"), then the volume's
// `author`. Titles are matched in lower case, without accents, "æ" as "ae".
type VolumeAuthors = { works?: [RegExp, string][], within?: [RegExp, string][], author?: string };

const ANONYMOUS = 'Anonymous';

export const VOLUME_AUTHORS: Record<string, VolumeAuthors> = {
  anf01: {
    works:  [[/martyrdom of polycarp/, 'Church of Smyrna'], [/martyrdom of (?:ignatius|justin)/, ANONYMOUS]],
    within: [
      [/clement of rome/, 'Clement of Rome'], [/mathetes/, 'Mathetes'], [/polycarp/, 'Polycarp'],
      [/ignatius/, 'Ignatius of Antioch'], [/barnabas/, 'Barnabas'], [/papias/, 'Papias'],
      [/justin/, 'Justin Martyr'], [/irenaeus/, 'Irenaeus'],
    ],
  },
  anf02: {
    works:  [[/hermas/, 'Hermas']],
    within: [
      [/tatian/, 'Tatian'], [/theophilus/, 'Theophilus of Antioch'], [/athenagoras/, 'Athenagoras'],
      [/clement of alexandria/, 'Clement of Alexandria'],
    ],
  },
  anf03: { author: 'Tertullian' },
  anf04: {
    works:  [[/to origen from africanus/, 'Julius Africanus']],
    within: [
      [/tertullian/, 'Tertullian'], [/minucius/, 'Minucius Felix'], [/commodian/, 'Commodian'],
      [/origen/, 'Origen'],
    ],
  },
  anf05: {
    works: [
      [/by pontius/, 'Pontius the Deacon'], [/council of carthage/, 'Council of Carthage'],
      [/attributed to cyprian/, 'Pseudo-Cyprian'], [/appendix to the works of hippolytus/, 'Pseudo-Hippolytus'],
    ],
    within: [
      [/hippolytus/, 'Hippolytus'], [/cyprian/, 'Cyprian'], [/caius/, 'Caius'], [/novatian/, 'Novatian'],
      [/appendix/, ANONYMOUS],
    ],
  },
  anf06: {
    works: [
      [/julius africanus/, 'Julius Africanus'], [/^pieri?us/, 'Pierius of Alexandria'],
      [/^pamphilus/, 'Pamphilus'], [/^malchion/, 'Malchion'],
    ],
    within: [
      [/gregory thaumaturgus/, 'Gregory Thaumaturgus'], [/anatolius of alexandria/, 'Anatolius of Alexandria'],
      [/alexander of cappadocia/, 'Alexander of Jerusalem'], [/theognostus/, 'Theognostus of Alexandria'],
      [/theonas/, 'Theonas of Alexandria'], [/phileas/, 'Phileas of Thmuis'], [/archelaus/, 'Archelaus'],
      [/alexander of lycopolis/, 'Alexander of Lycopolis'], [/peter of alexandria/, 'Peter of Alexandria'],
      [/alexander of alexandria/, 'Alexander of Alexandria'], [/methodius/, 'Methodius'],
      [/arnobius/, 'Arnobius'], [/^dionysius/, 'Dionysius of Alexandria'],
    ],
  },
  anf07: {
    works: [
      [/^venantius/, 'Venantius'], [/asterius/, 'Asterius Urbanus'], [/^dionysius/, 'Dionysius of Rome'],
      [/teaching of the twelve apostles|constitutions of the holy apostles|liturgies/, ANONYMOUS],
      [/second epistle of clement/, 'Pseudo-Clement'], [/nicene creed/, 'First Council of Nicaea'],
    ],
    within: [[/lactantius/, 'Lactantius'], [/victorinus/, 'Victorinus of Pettau']],
  },
  anf08: {
    works: [
      [/twelve patriarchs/, ANONYMOUS], [/theodotus/, 'Clement of Alexandria'],
      [/zephyrinus/, 'Zephyrinus'], [/pope urban/, 'Urban I'], [/pontianus/, 'Pontianus'],
      [/anterus/, 'Anterus'], [/decrees of fabian/, 'Fabian'], [/mar jacob/, 'Jacob of Serugh'],
      [/moses of chorene/, 'Moses of Chorene'], [/bardesan/, 'Bardaisan'],
      [/mara,? son of serapion/, 'Mara bar Serapion'], [/^ambrose/, 'Ambrose (Syriac apologist)'],
      [/^quadratus/, 'Quadratus of Athens'], [/^aristo of pella/, 'Aristo of Pella'],
      [/^melito/, 'Melito of Sardis'], [/^dionysius, bishop of corinth/, 'Dionysius of Corinth'],
      [/^rhodon/, 'Rhodon'], [/^maximus/, 'Maximus of Jerusalem'],
      [/^claudius apollinaris/, 'Claudius Apollinaris'], [/^polycrates/, 'Polycrates of Ephesus'],
      [/^theophilus, bishop of caesarea/, 'Theophilus of Caesarea'], [/^serapion/, 'Serapion of Antioch'],
      [/^apollonius/, 'Apollonius'], [/^pantaenus/, 'Pantaenus'], [/^pseud-irenaeus/, 'Pseudo-Irenaeus'],
    ],
    within: [
      [/two epistles concerning virginity|pseudo-clementine/, 'Pseudo-Clement'],
      [/pope callistus/, 'Callistus I'], [/pope fabian/, 'Fabian'], [/hegesippus/, 'Hegesippus'],
      [/apocrypha|memoirs of edessa/, ANONYMOUS],
    ],
  },
  anf09: {
    works: [
      [/gospel of peter|apocalypse of peter|vision of paul|apocalypse of the virgin|sedrach/, ANONYMOUS],
      [/testament of abraham|xanthippe|zosimus|scillitan/, ANONYMOUS],
      [/second epistle of clement/, 'Pseudo-Clement'], [/aristides/, 'Aristides of Athens'],
      [/origen/, 'Origen'],
    ],
    within: [[/diatessaron/, 'Tatian'], [/epistles of clement/, 'Clement of Rome'], [/origen/, 'Origen']],
  },
  npnf101: { author: 'Augustine of Hippo' },
  npnf102: { author: 'Augustine of Hippo' },
  npnf103: { author: 'Augustine of Hippo' },
  npnf104: { author: 'Augustine of Hippo' },
  npnf105: { author: 'Augustine of Hippo' },
  npnf106: { author: 'Augustine of Hippo' },
  npnf107: { author: 'Augustine of Hippo' },
  npnf108: { author: 'Augustine of Hippo' },
  npnf109: { author: 'John Chrysostom' },
  npnf110: { author: 'John Chrysostom' },
  npnf111: { author: 'John Chrysostom' },
  npnf112: { author: 'John Chrysostom' },
  npnf113: { author: 'John Chrysostom' },
  npnf114: { author: 'John Chrysostom' },
  npnf201: { works: [[/oration of constantine/, 'Constantine the Great']], author: 'Eusebius of Caesarea' },
  npnf202: { works: [[/socrates/, 'Socrates Scholasticus'], [/sozomen/, 'Sozomen']] },
  npnf203: {
    works: [
      [/anathemas of cyril/, 'Cyril of Alexandria'], [/theodoret/, 'Theodoret'],
      [/^jerome|jerome's apology/, 'Jerome'], [/^gennadius/, 'Gennadius of Massilia'],
      [/letter of anastasius/, 'Anastasius I'], [/pamphilus' defence/, 'Pamphilus'],
    ],
    within: [[/theodoret/, 'Theodoret'], [/rufinus/, 'Rufinus of Aquileia']],
  },
  npnf204: {
    works:  [[/letter of eusebius/, 'Eusebius of Caesarea'], [/historia acephala/, ANONYMOUS]],
    author: 'Athanasius',
  },
  npnf205: { author: 'Gregory of Nyssa' },
  npnf206: { author: 'Jerome' },
  npnf207: {
    works:  [[/cyril/, 'Cyril of Jerusalem'], [/gregory nazianzen/, 'Gregory of Nazianzus']],
    within: [[/gregory nazianzen/, 'Gregory of Nazianzus']],
  },
  npnf208: { author: 'Basil of Caesarea' },
  npnf209: { within: [[/john of damascus/, 'John of Damascus']], author: 'Hilary of Poitiers' },
  npnf210: { author: 'Ambrose of Milan' },
  npnf211: {
    works:  [[/vincent of lerins/, 'Vincent of Lérins']],
    within: [[/sulpitius/, 'Sulpicius Severus'], [/cassian/, 'John Cassian']],
  },
  npnf212: { within: [[/leo the great/, 'Leo the Great'], [/gregory the great/, 'Gregory the Great']] },
  npnf213: {
    works:  [[/gregory the great/, 'Gregory the Great'], [/ephraim/, 'Ephrem the Syrian'], [/aphrahat/, 'Aphrahat']],
  },
  npnf214: {
    works: [
      [/(?:epistle|letter|anathematisms?) of (?:st\. )?cyril/, 'Cyril of Alexandria'],
      [/tome of st\. leo/, 'Leo the Great'], [/pope coelestine/, 'Celestine I'],
      [/under nectarius/, 'Council of Constantinople (394)'], [/under cyprian/, 'Council of Carthage (256)'],
      [/second council of constantinople/, 'Second Council of Constantinople'],
      [/third council of constantinople/, 'Third Council of Constantinople'],
      [/apostolical canons|appendix containing canons/, ANONYMOUS],
    ],
    within: [
      [/first council of nice/, 'First Council of Nicaea'], [/ancyra/, 'Council of Ancyra'],
      [/neocaesarea/, 'Council of Neocaesarea'], [/gangra|grangra/, 'Council of Gangra'],
      [/antioch in encaeniis/, 'Synod of Antioch'], [/laodicea/, 'Synod of Laodicea'],
      [/first council of constantinople/, 'First Council of Constantinople'],
      [/council of ephesus/, 'Council of Ephesus'], [/chalcedon/, 'Council of Chalcedon'],
      [/trullo/, 'Council in Trullo'], [/sardica/, 'Council of Sardica'], [/carthage/, 'Council of Carthage'],
      [/second council of nice/, 'Second Council of Nicaea'],
    ],
  },
};

const plain = (title: string) => (
  title.toLowerCase().replace(/æ/g, 'ae').replace(/œ/g, 'oe').normalize('NFKD')
    .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
);

// The author of a work in a volume (see VOLUME_AUTHORS); null when unknown
export const authorOf = (volume: string, work: FoundWork): string | null => {
  const authors = VOLUME_AUTHORS[volume] ?? {};
  const match   = (rules: [RegExp, string][] | undefined, title: string) => (
    rules?.find(([pattern]) => pattern.test(plain(title)))?.[1]
  );

  return match(authors.works, titleOf(work.div))
    ?? work.within.map((t) => match(authors.within, t)).find((a) => a !== undefined)
    ?? authors.author
    ?? null;
};

// Tags that mark up the text without being part of it, and tags to unwrap
const DROPPED = /<(?:index|pb|scripCom|insertIndex|added)\b[^>]*\/>|<scripCom\b[^>]*>[\s\S]*?<\/scripCom>/g;
const UNWRAP  = /<\/?(?:name|cite|term|def|foreign|unclear|abbr|date|insertIndex)\b[^>]*>/g;

// The text blocks in a div's own HTML, as ThML (notes and scripRefs kept, for
// scripRefCitations), each with the tag to wrap it in: paragraphs, verse,
// lists, tables, and headings other than the div's title. Notes have
// paragraphs of their own, so they are set aside while the blocks are found.
export const blocksOf = (div: Div): { tag: string, html: string }[] => {
  const notes: string[] = [];
  const masked          = div.own
    .replace(DROPPED, '')
    .replace(/<note\b[\s\S]*?<\/note>/g, (note) => `${ notes.push(note) - 1 }`);
  const unmask          = (html: string) => html.replace(/(\d+)/g, (_, i: string) => notes[Number(i)]!);
  const title           = norm(titleOf(div));
  const found           = /<(p|verse|ul|ol|table|h[1-6])\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1>)/g;

  return [...masked.matchAll(found)].flatMap((m) => {
    const tag   = m[1]!;
    const inner = unmask(m[2] ?? '').replace(UNWRAP, '');
    const text  = norm(cleanHtml(inner).replace(/<[^>]+>/g, ''));

    if (text.length === 0) {
      return [];
    }
    else if (/^h\d$/.test(tag) && (title.startsWith(text) || text.startsWith(title))) {
      return [];
    }
    else if (tag === 'verse') {
      const lines = [...inner.matchAll(/<l\b[^>]*>([\s\S]*?)<\/l>/g)].map((l) => l[1]!);
      return [{ tag: 'p', html: lines.length > 0 ? lines.join('<br />') : inner }];
    }
    else if (/^h\d$/.test(tag)) {
      return [{ tag: 'h5', html: inner }];
    }
    else {
      return [{ tag, html: inner }];
    }
  });
};

// Blocks as Text blocks, with a <sup> number after each citation in them
// (numbered from 1 across the page), and a Footnote block for each, carrying
// its citations. Their footnotePage is set once pages are numbered.
const textWithFootnotes = (blocks: { tag: string, html: string }[], bookId: string) => {
  const text: PageBlock[]      = [];
  const footnotes: PageBlock[] = [];

  for (const b of blocks) {
    const marked = scripRefCitations(b.html, { bookId, footnotePage: 0 }, footnotes.length + 1);
    text.push(block('Text', `<${ b.tag }>${ cleanHtml(marked.html) }</${ b.tag }>`));
    footnotes.push(...marked.footnotes.map((f) => ({
      ...block('Footnote', `<p><sup>${ f.identifier }</sup> ${ escapeHtml(f.raw) }</p>`),
      citations: f.citations,
    })));
  }

  return { text, footnotes };
};

// A page of a work, and how it is cited: the numbered divisions it is in
// alsoCitedAs: the other places a page is cited by, for a page of several chapters (a translation's
// "Chapters XXXIII, XXXVI."), its citationParts being its first
export type WorkPage = Page & { citationParts: CitationPart[], alsoCitedAs?: CitationPart[][] };

type PagePlan = Omit<WorkPage, 'pageNumber'>;

const MAX_LABEL = 100;

// The pages of a work: one for each div in it with text of its own (a
// chapter, or the opening of a book before its chapters), in reading order.
// A page is labelled and cited by the numbered divisions down to it ("Book
// I, Chapter 5" -> book 1, chapter 5); a division numbered alone ("II")
// takes the type of its labelled siblings ("Book I"), or else is a chapter.
const workPlans = (
  work: Div, workTitle: string, bookId: string, path: (Division & { type: string })[] = [],
  headings: string[] = [],
): PagePlan[] => {
  const blocks = blocksOf(work);
  const title  = titleOf(work);
  const own    = blocks.length === 0 ? [] : [(() => {
    const { text, footnotes } = textWithFootnotes(blocks, bookId);
    const label               = path.length > 0 ? path.map((d) => d.label).join(', ') : title;
    return {
      printedPageNumber: label.slice(0, MAX_LABEL),
      citationParts:     path.map((d) => ({ type: d.type, value: d.value })),
      blocks:            [
        ...[workTitle, ...headings].map((h) => block('PageHeader', `<p>${ escapeHtml(h) }</p>`)),
        block('SectionHeader', `<h3>${ escapeHtml(tidyTitle(title)) }</h3>`),
        ...text,
        ...footnotes,
      ],
    };
  })()];

  const children  = textChildren(work);
  const divisions = numberByKind(children, children.map(divisionOf));
  const sibling   = divisions.find((d) => d?.type)?.type ?? 'chapter';

  return [
    ...own,
    ...children.flatMap((child, i) => {
      const division = divisions[i];
      const typed    = division ? { ...division, type: division.type ?? sibling } : null;
      return workPlans(
        child, workTitle, bookId,
        typed ? [...path, typed] : path,
        typed ? [...headings, typed.label] : headings,
      );
    }),
  ];
};

// Divisions for divs CCEL types as divisions ("Chapter") but gives no number, only a title (Book
// I of the Exact Exposition of the Orthodox Faith: "Chapter I", then "Proof that there is a God",
// ...): numbered by their place among their siblings of that type, when every numbered one of
// them has the number of its place
export const numberByKind = (
  children: Pick<Div, 'kind'>[], divisions: (Division | null)[]
): (Division | null)[] => {
  const kinds = children.map((c) => c.kind.toLowerCase());

  // each child's place among its siblings of its kind, from 1
  const places = kinds.map((kind, i) => kinds.slice(0, i + 1).filter((k) => k === kind).length);

  return divisions.map((division, i) => {
    const kind    = kinds[i]!;
    const same    = kinds.flatMap((k, j) => (k === kind ? [j] : []));
    const inPlace = same.every((j) => divisions[j] === null || divisions[j]!.value === places[j]);

    if (division !== null || kind.length === 0 || !DIVISION.test(`${ kind } 1`) || !inPlace) {
      return division;
    }
    else {
      return {
        label: `${ kind[0]!.toUpperCase() + kind.slice(1) } ${ toRoman(places[i]!) }`,
        type:  DIVISION_TYPES[kind] ?? 'chapter',
        value: places[i]!,
      };
    }
  });
};

const ROMAN_DIGITS: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'],
  [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

// 14 -> "XIV"
const toRoman = (n: number): string => ROMAN_DIGITS.reduce(
  (out, [value, digits]) => ({
    rest: out.rest % value,
    text: out.text + digits.repeat(Math.floor(out.rest / value)),
  }),
  { rest: n, text: '' },
).text;

// A book's id from its volume and title: "anf01-first-epistle-to-the-corinthians"
export const workBookId = (volume: string, title: string): string => (
  `${ volume }-${ title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '') }`
);

export type Work = {
  id: string,
  title: string,
  author: string,
  url: string,
  pages: WorkPage[],
};

// The works of a volume ("anf01") as books, in reading order, with their
// pages numbered from 1 and their footnotes' citations on their pages, by
// their authors ("Unknown" when not in VOLUME_AUTHORS). Works
// whose titles would give the same id get "-2", "-3" after it.
export const volumeWorks = (volume: string, xml: string): Work[] => {
  const body = xml.slice(xml.indexOf('<ThML.body'));
  const ids  = new Map<string, number>();

  return findWorks(parseDivs(body)).flatMap((found) => {
    const title = tidyTitle(titleOf(found.div)).replace(/\.$/, '');
    const base  = workBookId(volume, title);
    const seen  = (ids.get(base) ?? 0) + 1;
    const id    = seen > 1 ? `${ base }-${ seen }` : base;
    ids.set(base, seen);

    const pages = workPlans(found.div, title, id).map((p, i) => ({
      pageNumber: i + 1,
      ...p,
      blocks:     p.blocks.map((b) => ({
        ...b,
        citations: b.citations.map((c) => ({ ...c, source: { ...c.source, footnotePage: i + 1 } })),
      })),
    }));

    return pages.length === 0 ? [] : [{
      id,
      title,
      author: authorOf(volume, found) ?? 'Unknown',
      url:    `https://www.ccel.org/ccel/schaff/${ volume }.${ found.div.id }.html`,
      pages,
    }];
  });
};

// The chapters a chapter's title names, in order: "Chapter LXIV. That God governs ..." -> [64];
// several, for chapters a translation gives together: "Chapters XXXIII, XXXVI." -> [33, 36],
// "Chapters XLI–XLV." -> [41 ... 45]. Lenient with a transcription's slips ("Chapter Chapter
// XCVIII", "Chapte CVII", "LXX. How ...", "Chapter 12."). [] for a title naming no chapter.
export const chapterNumbers = (title: string): number[] => {
  const head = decode(title).replace(/^\s*(?:chap[a-z]*\.?\s*)+/i, '').split(/\.(?:\s|$)/)[0]!.trim();

  if (!/^[ivxlcdm\d][ivxlcdm\d\s,&–-]*$/i.test(head)) {
    return [];
  }
  else {
    const numbers = head.split(/\s*(?:,|&)\s*/).flatMap((part) => {
      const range = part.match(/^(\w+)\s*[–-]\s*(\w+)$/);
      const from  = numberOf(range ? range[1]! : part);
      const to    = range ? numberOf(range[2]!) : from;
      return from === null || to === null || to < from || to - from > 20
        ? [NaN]
        : Array.from({ length: to - from + 1 }, (_, k) => from + k);
    });
    return numbers.some(Number.isNaN) ? [] : numbers;
  }
};

// The chapters of a book's divs (see chapterNumbers), a div naming none taking the one its
// neighbours leave out (between chapters 48 and 50, 49), when they leave exactly one
export const bookChapters = (titles: string[]): number[][] => {
  const named = titles.map(chapterNumbers);

  return named.map((chapters, i) => {
    const before = named.slice(0, i).reverse().find((c) => c.length > 0);
    const after  = named.slice(i + 1).find((c) => c.length > 0);
    const prev   = before === undefined ? 0 : Math.max(...before);
    const next   = after === undefined ? undefined : Math.min(...after);

    return chapters.length > 0 || next === undefined || next - prev !== 2 ? chapters : [prev + 1];
  });
};

// A file holding a single work (CCEL's Summa Contra Gentiles, Boethius's Consolation) as one book:
// its numbered top-level divisions (Books I-IV, and their chapters) are the work; the rest of the
// file (title page, preface, afterword, notes on the translation, indexes) is left out. Pages are
// made as volumeWorks makes them, a page per div with text of its own, cited by its divisions.
export const singleWork = (
  xml: string, work: { id: string, title: string, author: string, url: string },
): Work => {
  const books = parseDivs(xml.slice(xml.indexOf('<ThML.body'))).filter((d) => divisionOf(d) !== null);
  // the chapters each page covers, by its label ("Book II, Chapter XXXIII" -> 33 and 36)
  const covers = new Map<string, number[]>();

  // a book's chapter divs labelled by their first chapter, however their titles name them
  const chaptered = books.map((book) => {
    const chapters = bookChapters(book.children.map((c) => c.title || c.shortTitle));
    const label    = divisionOf(book)!.label;
    return {
      ...book,
      children: book.children.map((child, i) => {
        const numbers = chapters[i]!;
        if (numbers.length === 0) {
          return child;
        }
        else {
          covers.set(`${ label }, Chapter ${ toRoman(numbers[0]!) }`, numbers);
          return { ...child, shortTitle: `Chapter ${ toRoman(numbers[0]!) }` };
        }
      }),
    };
  });
  const root: Div = {
    level: 0, id: '', title: work.title, shortTitle: '', kind: '', own: '', children: chaptered,
  };

  return {
    ...work,
    pages: workPlans(root, work.title, work.id).map((p, i) => ({
      pageNumber:  i + 1,
      ...p,
      alsoCitedAs: (covers.get(p.printedPageNumber) ?? []).slice(1).map((chapter) => [
        ...p.citationParts.filter((c) => c.type !== 'chapter'), { type: 'chapter', value: chapter },
      ]),
      blocks:     p.blocks.map((b) => ({
        ...b,
        citations: b.citations.map((c) => ({ ...c, source: { ...c.source, footnotePage: i + 1 } })),
      })),
    })),
  };
};
