// Page insights: what other books in the collection say about a page they cite. Pure
// functions: which pages to send as context, the OpenRouter prompt, and turning its answer
// into the API response.
import type { ORMessage, ORResponseFormat } from '../lib/open_router.ts';

// Pages on either side of a citing page sent as context
export const CONTEXT_RADIUS = 2;

export type PageBlockText = { label: string, html: string };

export type ContextPage = {
  pageNumber: number,
  printedPageNumber: string,
  blocks: PageBlockText[],
};

// A citation of the page, as the model reads it from the database
export type CitingCitation = {
  sourceBookId: string,
  sourcePage: number,          // scan page (pages.page_number) of the footnote
  footnoteIdentifier: string,
};

// One page in another book that cites this page, possibly in several footnotes
export type CitingPage = {
  bookId: string,
  pageNumber: number,
  footnoteIdentifiers: string[],
};

export type CitingSource = CitingPage & {
  title: string,
  author: string,
  printedPageNumber: string,
  context: ContextPage[],      // the citing page with CONTEXT_RADIUS pages before and after
};

// What the model returns
export type InsightsAnswer = {
  overview: string,
  sources: { sourceId: string, summary: string }[],
};

// The API response (the PageInsights schema in api.yaml)
export type PageInsights = {
  bookId: string,
  pageId: number,
  printedPageNumber: string,
  overview: string,
  sources: {
    bookId: string,
    title: string,
    author: string,
    pageId: number,
    printedPageNumber: string,
    footnoteIdentifiers: string[],
    summary: string,
  }[],
};

// Citations give page numbers as integers, so a page printed with a Roman numeral, or none, can't
// be cited by number: null
export const citablePageNumber = (printedPageNumber: string): number | null => (
  /^\d+$/.test(printedPageNumber) ? Number(printedPageNumber) : null
);

// The citing pages, one per (book, page), in the order first cited, with their footnote markers
export const groupCitingPages = (citations: CitingCitation[]): CitingPage[] => {
  const byPage = new Map<string, CitingPage>();

  for (const c of citations) {
    const key      = c.sourceBookId + '\u0000' + c.sourcePage;
    const existing = byPage.get(key);

    if (!existing) {
      byPage.set(key, {
        bookId:              c.sourceBookId,
        pageNumber:          c.sourcePage,
        footnoteIdentifiers: c.footnoteIdentifier ? [c.footnoteIdentifier] : [],
      });
    }
    else if (
      c.footnoteIdentifier
        && !existing.footnoteIdentifiers.includes(c.footnoteIdentifier)
    ) {
      existing.footnoteIdentifiers.push(c.footnoteIdentifier);
    }
  }

  return [...byPage.values()];
};

// The page numbers sent as context for a citing page: it and CONTEXT_RADIUS on either side
export const contextPageNumbers = (
  pageNumber: number, radius = CONTEXT_RADIUS
): number[] => (
  Array.from({ length: 2 * radius + 1 }, (_, i) => pageNumber - radius + i)
    .filter((n) => n >= 1)
);

const ENTITIES: Record<string, string> = {
  '&amp;':  '&',
  '&lt;':   '<',
  '&gt;':   '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;':  "'",
  '&nbsp;': ' ',
};

// A page as plain text for the model: its blocks in reading order without running headers and
// footers, HTML removed, paragraphs on their own lines
export const pageText = (blocks: PageBlockText[]): string => (
  blocks
    .filter((b) => b.label !== 'PageHeader' && b.label !== 'PageFooter')
    .map((b) => (
      b.html
        .replace(/<br\s*\/?>|<\/(?:p|li|tr|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&(?:amp|lt|gt|quot|nbsp|#x27|#39);/g, (m) => ENTITIES[m]!)
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
    ))
    .filter(Boolean)
    .join('\n\n')
);

const pageHeading = (page: ContextPage) => (
  `[scan page ${ page.pageNumber }`
    + (page.printedPageNumber ? `, printed page ${ page.printedPageNumber }` : '')
    + ']'
);

// Sources are named S1, S2, ... in the prompt, in order
export const sourceId = (index: number) => 'S' + (index + 1);

export const INSIGHTS_PROMPT = `You help a reader of a scanned book understand how other
authors in the same collection use and respond to the page they are reading.

You are given that page, then passages from other books whose footnotes cite it. Each
source is named (S1, S2, ...), with its author, title, the footnote markers that cite the
page, and several consecutive pages around the citing page.

Summarize what the other authors say about what they cite from this page: the claims they
draw from it, whether they agree, build on, qualify or dispute it, and how they use it in
their own argument. Base the summary only on the passages given; if a source only mentions
the page in passing, say so.

Return:
- overview: a few sentences on how the sources, taken together, treat this page.
- sources: for each source, its sourceId and a short summary of what that author says about it.`;

export const buildInsightsMessages = ({ book, page, sources }: {
  book: { title: string, author: string },
  page: ContextPage,
  sources: CitingSource[],
}): ORMessage[] => {
  const parts = [
    `THE PAGE BEING READ: "${ book.title }" by ${ book.author }, ${ pageHeading(page) }`,
    pageText(page.blocks),
    ...sources
      .slice(0, 10)
      .flatMap((s, i) => [
        `SOURCE ${ sourceId(i) }: "${ s.title }" by ${ s.author }. `
          + `It cites the page in footnote `
          + `${ s.footnoteIdentifiers.join(', ') || '(unnumbered)' } on `
          + `scan page ${ s.pageNumber }.`,
        ...s.context.map((p) => (
          pageHeading(p) + (
            p.pageNumber === s.pageNumber
              ? ' (the citing page)'
              : ''
          ) + '\n' + pageText(p.blocks)
        )),
      ]),
  ];

  return [
    { role: 'system', content: INSIGHTS_PROMPT },
    { role: 'user', content: parts.join('\n\n') },
  ];
};

export const INSIGHTS_FORMAT: ORResponseFormat = {
  type:        'json_schema',
  json_schema: {
    name:   'page_insights',
    strict: true,
    schema: {
      type:                 'object',
      additionalProperties: false,
      required:             ['overview', 'sources'],
      properties:           {
        overview: { type: 'string' },
        sources:  {
          type:  'array',
          items: {
            type:                 'object',
            additionalProperties: false,
            required:             ['sourceId', 'summary'],
            properties:           {
              sourceId: { type: 'string' },
              summary:  { type: 'string' },
            },
          },
        },
      },
    },
  },
};

// The API response from the model's answer. Every source is listed, in prompt order; one the model
// didn't summarize gets an empty summary, and ids the model made up are ignored.
export const toPageInsights = ({ bookId, page, sources, answer }: {
  bookId: string,
  page: ContextPage,
  sources: CitingSource[],
  answer: InsightsAnswer,
}): PageInsights => {
  const summaries = new Map(answer.sources.map((s) => [s.sourceId, s.summary]));

  return {
    bookId,
    pageId:            page.pageNumber,
    printedPageNumber: page.printedPageNumber,
    overview:          answer.overview,
    sources:           sources.map((s, i) => ({
      bookId:              s.bookId,
      title:               s.title,
      author:              s.author,
      pageId:              s.pageNumber,
      printedPageNumber:   s.printedPageNumber,
      footnoteIdentifiers: s.footnoteIdentifiers,
      summary:             summaries.get(sourceId(i)) ?? '',
    })),
  };
};
