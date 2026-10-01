// Extracting the citations in an OCR'd book's footnotes with an LLM, a request per page: the
// prompt and response format, the insights the model keeps about how works are cited
// (footnote_extraction_insights), and placing each citation in its footnote block. Pure functions;
// cli/commands/process_ocred_books.command.ts makes the requests and saves the results.
import type { ORResponseFormat } from '../lib/open_router.ts';
import type { Citation, CitationLocation, Page, SuryaPage } from '../types.ts';
import { strip_tags } from './book_pages.ts';

export const LOCATION_TYPES: CitationLocation['type'][] = [
  'page', 'chapter', 'book', 'volume', 'question', 'article', 'lecture', 'position', 'verse', 'part',
  'bekker number', 'line', 'stephanus number', 'objection', 'sed contra', 'respondeo', 'ad',
  'distinction',
];

// An insight with how widely it applies (see INSIGHT_SCORES); score null until scored
export type ScoredInsight = { insight: string, score: number | null };

// How the model scores an insight
export const INSIGHT_SCORES = `a score from 1 to 5 of how widely it applies: 1 for citations likely
to appear in a wide number of texts, up to 5 for very obscure ones, unlikely to be seen often`;

// Insights scored above this aren't given the model when extracting citations
export const MAX_PROMPT_SCORE = 2;

// What the model returns for one page: each footnote on it, the citations in each footnote, and
// the insights it learned, scored
export type PageFootnotes = {
  additionalInsights: { insight: string, score: number }[],
  footnotes: {
    identifier: string,
    citations: {
      author: string,
      title: string,
      location: string,
      raw: string,
      locationsCited: CitationLocation[][],
    }[],
  }[],
};

export const FOOTNOTES_FORMAT: ORResponseFormat = {
  type:        'json_schema',
  json_schema: {
    name:   'page_footnotes',
    strict: true,
    schema: {
      type:                 'object',
      additionalProperties: false,
      required:             ['footnotes', 'additionalInsights'],
      properties:           {
        additionalInsights: {
          type:  'array',
          items: {
            type:                 'object',
            additionalProperties: false,
            required:             ['insight', 'score'],
            properties:           {
              insight: { type: 'string' },
              score:   { type: 'integer', enum: [1, 2, 3, 4, 5] },
            },
          },
        },
        footnotes: {
          type:  'array',
          items: {
            type:                 'object',
            additionalProperties: false,
            required:             ['identifier', 'citations'],
            properties:           {
              identifier: { type: 'string' },
              citations:  {
                type:  'array',
                items: {
                  type:                 'object',
                  additionalProperties: false,
                  required:             ['author', 'title', 'location', 'raw', 'locationsCited'],
                  properties:           {
                    author:         { type: 'string' },
                    title:          { type: 'string' },
                    location:       { type: 'string' },
                    raw:            { type: 'string' },
                    locationsCited: {
                      type:  'array',
                      items: {
                        type:  'array',
                        items: {
                          type:                 'object',
                          additionalProperties: false,
                          required:             ['rawLabel', 'type', 'values'],
                          properties:           {
                            rawLabel: { type: 'string' },
                            type:     { type: 'string', enum: LOCATION_TYPES },
                            values:   { type: 'array', items: { type: 'integer' } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

// The system prompt for extracting one page's citations. insights: those to give the model (see
// insightsForPrompt).
export const footnotesPrompt = (insights: string[]) => `You extract bibliographic citations from the footnotes of one page of a scanned book.
The footnotes are OCR output as HTML, in reading order. Return every footnote on the page, in order:

- identifier: the footnote's marker as printed ("12", "*", "†"), without <sup> tags. A footnote that
  continues from the previous page has no marker: use "".
- citations: one entry per work the footnote cites (none if it cites nothing):
  - author: the author as written ("Pohle-Preuss", "St. Thomas"). For the Bible use "Bible".
  - title: the work's title, without edition or location ("Christology", "Summa Theologica"). For the
    Bible, the book ("2 Corinthians"). For "Ibid." or "op. cit.", use the author and title of the work it
    refers back to when that appears earlier on this page; otherwise leave author and title as written.
  - location: the part of the work cited, as written ("Vol. I, pp. 33 sqq.", "qu. 13, art. 9").
  - raw: the citation's full text as printed, without HTML tags.
  - locationsCited: the location as groups of {rawLabel, type, values}. Start a new group for each
    separately cited place ("Bk II ch 1-3, also Bk III ch 5" -> two groups). rawLabel is the printed
    locator ("Vol. IV", "ch 1-3", "pp. 33 sqq"). values are integers: convert Roman numerals, expand ranges
    ("1-3" -> [1, 2, 3], "sqq" adds nothing). Types: ${ LOCATION_TYPES.join(', ') }. Use "position" for §,
    n., col., and other locators without a matching type. For the Bible, a "book" entry whose value is
    the book's position in the Catholic (Douay) canon (1-73), then "chapter" and "verse".

    Following is a list of insights that will assist with recognizing cited works and their location parts:

${ insights.map((insight) => '    - ' + insight).join('\n') }

    Track any insights learned during the extraction of citations that will help with future extractions into the 'additionalInsights' field,
    each with ${ INSIGHT_SCORES }.
`;

// The insights to give the model: those scored up to MAX_PROMPT_SCORE, most widely applying
// first, then those not scored yet (saved before scores), in the order given
export const insightsForPrompt = (insights: ScoredInsight[]): string[] => (
  insights
    .filter((i) => i.score === null || i.score <= MAX_PROMPT_SCORE)
    .map((i, order) => ({ ...i, order }))
    .sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity) || a.order - b.order)
    .map((i) => i.insight)
);

// A page's Footnote blocks' HTML, in reading order: what the model is given
export const footnoteHtml = (page: SuryaPage) => (
  page.blocks
    .filter((b) => b.label === 'Footnote')
    .sort((a, b) => a.reading_order - b.reading_order)
    .map((b) => b.html)
    .join('\n')
);

// The citations of a page's footnotes as the model returned them. source.footnotePage is the scan
// page (SuryaPage.page); referenceBookId is left null for find-and-queue-cited-books to fill.
export const pageCitations = (
  bookId: string, page: number, result: PageFootnotes
): Citation[] => (
  result.footnotes.flatMap((footnote) => footnote.citations.map((c) => ({
    source: {
      bookId,
      footnoteIdentifier: footnote.identifier,
      footnotePage:       page,
    },
    referenceBookId: null,
    author:          c.author,
    title:           c.title,
    location:        c.location,
    raw:             c.raw,
    locationsCited:  c.locationsCited,
  })))
);

// Two insights are the same when they differ only in case, spacing, quote style or trailing
// punctuation
export const insightKey = (insight: string) => (
  insight
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/[\s.;:,!]+$/, '')
    .trim()
);

// Insights without repeats, keeping the first of each (its spelling and score), in order; blank
// insights are dropped
export const removeDuplicateInsights = (insights: ScoredInsight[]): ScoredInsight[] => {
  const seen = new Set<string>();

  return insights.filter(({ insight }) => {
    const key = insightKey(insight);
    if (key.length === 0 || seen.has(key)) {
      return false;
    }
    else {
      seen.add(key);
      return true;
    }
  });
};

// The insights learned that aren't among those saved already (by insightKey), without repeats
export const newInsights = (learned: ScoredInsight[], saved: string[]): ScoredInsight[] => {
  const existing = new Set(saved.map(insightKey));
  return removeDuplicateInsights(learned).filter((i) => !existing.has(insightKey(i.insight)));
};

// The Footnote block a citation belongs to: the one on its page where its marker starts a footnote
// ("<sup>12</sup>", or "12 " at the start of a line), else, for a footnote continued from the page
// before (no marker), the page's first Footnote block. blocks: the page's, in reading order.
export const footnoteBlockFor = <B extends { html: string }>(
  blocks: B[], identifier: string
): B | undefined => {
  if (identifier.length > 0) {
    const marker = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sup    = new RegExp('<sup>\\s*' + marker + '\\s*</sup>');
    const line   = new RegExp('(^|\\n)\\s*' + marker + '[\\s.)]');

    return blocks.find((b) => (
      sup.test(b.html) || line.test(strip_tags(b.html.replace(/<\/p>|<br\s*\/?>/gi, '\n')))
    ));
  }
  else {
    return blocks[0];
  }
};

// A citation in the footnote block at `position` among its page's blocks (as the book's pages are
// saved, see BookActions.saveBook in model/books.ts)
export type PlacedCitation = { pageNumber: number, position: number, citation: Citation };

// Each citation in its footnote block (see footnoteBlockFor) among the book's pages, and those
// whose page has no block with their marker
export const placeCitations = (
  pages: Page[], citations: Citation[]
): { placed: PlacedCitation[], unplaced: Citation[] } => {
  const footnotes = new Map(pages.map((p) => [
    p.pageNumber,
    p.blocks.flatMap((b, position) => (
      b.label === 'Footnote'
        ? [{ position, html: b.html }]
        : []
    )),
  ]));

  return citations.reduce<{
    placed: PlacedCitation[],
    unplaced: Citation[]
  }>(
    (out, citation) => {
      const page  = citation.source.footnotePage;
      const block = footnoteBlockFor(
        footnotes.get(page) ?? [],
        citation.source.footnoteIdentifier
      );

      return block === undefined
        ? { ...out, unplaced: [...out.unplaced, citation] }
        : { ...out,
            placed: [
              ...out.placed,
              { pageNumber: page, position: block.position, citation }
            ] };
    },
    { placed: [], unplaced: [] }
  );
};
