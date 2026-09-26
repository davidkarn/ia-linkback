import util from 'util';
import fs from 'node:fs/promises';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../api/database';
import type { Citation, CitationLocation, SuryaBook, SuryaPage } from '../types';
import dotenv from 'dotenv';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { JSONSchema7 } from "json-schema";

dotenv.config()

const db = new Kysely<Database>({
    dialect: new PostgresDialect({
        pool: new Pool({
            connectionString: process.env.DATABASE_URL
        })
    }),
});

const getNextBook = () => (
    db.selectFrom('queued_book_imports')
        .selectAll()
        .where('status', '=', 'inProgress')
        .orderBy('id')
        .limit(1)
        .executeTakeFirst()
);

const getBookContents = (book: Database.QueuedBookImportsTable): Promise<SuryaBook> => {
  const fileName = path.basename(book.pdf_url, path.extname(book.pdf_url));
  return fs.readFile(
    '../scholshelf/results/surya/' + fileName + '/results.json',
    { encoding: 'utf8' }
  ).then(data => JSON.parse(data));
}

// Two insights are the same when they differ only in case, spacing, quote style or trailing punctuation.
const insightKey = (insight: string) => (
  insight
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/[\s.;:,!]+$/, '')
    .trim()
);

// insights without repeats, keeping the first spelling of each, in order; blank insights are dropped
const removeDuplicateInsights = (insights: string[]): string[] => {
  const seen = new Set<string>();

  return insights.filter(insight => {
    const key = insightKey(insight);
    if (!key || seen.has(key)) {
      return false;
    }
    else {
      seen.add(key);
      return true;
    }
  });
};

// Every insight in footnote_extraction_insights, oldest first
const getInsights = () => (
  db.selectFrom('footnote_extraction_insights')
    .select('insight')
    .orderBy('id')
    .execute()
    .then(rows => rows.map(r => r.insight))
);

const log = (...items: any[]) => console.log(util.inspect(items, { depth: null }));

type ORMessage = {
  role: 'system' | 'user',
  content: string
};

type ORResponseFormat = {
  type: 'json_schema',
  json_schema: JSONSchema7
};

const makeOpenRouterRequest = (
  msgs: ORMessage[], responseFormat?: ORResponseFormat
) => (
  fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.OPENROUTER_KEY,
      'HTTP-Referer': 'https://webdever.net',
      'X-Title': 'Webdever',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o',
      messages: msgs,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  })
    .then(result => result.json())
);

const LOCATION_TYPES: CitationLocation['type'][] = [
  'page', 'chapter', 'book', 'volume', 'question', 'article', 'lecture', 'position', 'verse', 'part', 'bekker number', 'line', 'stephanus number', 'objection', 'sed contra', 'respondeo', 'ad', 'distinction', 
];

// What the model returns for one page: each footnote on it, and the citations in each footnote.
type PageFootnotes = {
  additionalInsights: string[],
  footnotes: {
    identifier: string,
    citations: {
      author: string,
      title: string,
      location: string,
      raw: string,
      locationsCited: { rawLabel: string, type: CitationLocation['type'], values: number[] }[][],
    }[],
  }[],
};

const FOOTNOTES_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'page_footnotes',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['footnotes', 'additionalInsights'],
      properties: {
        additionalInsights: {
          type: "array",
          items: {type: "string"}
        },
        footnotes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['identifier', 'citations'],
            properties: {
              identifier: { type: 'string' },
              citations: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['author', 'title', 'location', 'raw', 'locationsCited'],
                  properties: {
                    author: { type: 'string' },
                    title: { type: 'string' },
                    location: { type: 'string' },
                    raw: { type: 'string' },
                    locationsCited: {
                      type: 'array',
                      items: {
                        type: 'array',
                        items: {
                          type: 'object',
                          additionalProperties: false,
                          required: ['rawLabel', 'type', 'values'],
                          properties: {
                            rawLabel: { type: 'string' },
                            type: { type: 'string', enum: LOCATION_TYPES },
                            values: { type: 'array', items: { type: 'integer' } },
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

// The system prompt for extracting one page's citations. insights: footnote_extraction_insights rows.
const footnotesPrompt = (insights: string[]) => `You extract bibliographic citations from the footnotes of one page of a scanned book.
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
    ("1-3" -> [1, 2, 3], "sqq" adds nothing). Types: ${LOCATION_TYPES.join(', ')}. Use "position" for §,
    n., col., and other locators without a matching type. For the Bible, a "book" entry whose value is
    the book's position in the Catholic (Douay) canon (1-73), then "chapter" and "verse".

    Following is a list of insights that will assist with recognizing cited works and their location parts:
 
${insights.map(insight => '    - ' + insight).join('\n')}

    Track any insights learned during the extraction of citations that will help with future extractions into the 'additionalInsights' field.
`;

const footnoteHtml = (page: SuryaPage) => (
  page.blocks
    .filter(b => b.label === 'Footnote')
    .sort((a, b) => a.reading_order - b.reading_order)
    .map(b => b.html)
    .join('\n')
);

const requestPageFootnotes = async (page: SuryaPage, prompt: string, attempts = 3): Promise<PageFootnotes> => {
  let lastError: unknown;
  
  const response = await makeOpenRouterRequest([
    { role: 'system', content: prompt },
    { role: 'user', content: footnoteHtml(page) },
  ], FOOTNOTES_FORMAT);
  log(response);
  
  if (response.error) {
    throw new Error(response.error.message ?? JSON.stringify(response.error));
  }
  else {
    const content = response.choices?.[0]?.message?.content;
    
    if (typeof content !== 'string') {
      throw new Error('no content in response: ' + JSON.stringify(response));
    }
    else {
      return JSON.parse(content);
    }
  }
};

const mapLimited = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next           = 0;
  
  const worker = async () => {
    while (next < items.length) {
      const i    = next++;
      results[i] = await fn(items[i]!);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

// Every citation in the footnotes of a book, one OpenRouter request per page that has Footnote blocks.
// source.footnotePage is the scan page (SuryaPage.page), as in build_book.ts; referenceBookId is left
// null for link_citations.ts to fill. Pages whose request keeps failing are returned in failedPages
// rather than failing the whole book.
const extractFootnoteCitations = async (
  book: SuryaBook,
  opts: { concurrency?: number } = {}
): Promise<{
  citations: Citation[],
  failedPages: { page: number, error: string }[],
  insights: string[]
}> => {
  const [bookId, pages] = Object.entries(book)[0] ?? [];
  if (!bookId || !pages) {
    throw new Error('SuryaBook has no pages');
  }

  const failedPages: { page: number, error: string }[] = [];
  
  const footnotePages = pages.filter(p => p.blocks.some(b => b.label === 'Footnote'));
  let   insights      = await getInsights();
  const allNotes      = [];

  const perPage = await mapLimited(footnotePages, opts.concurrency ?? 1, async page => {
    try {
      const result = await requestPageFootnotes(page, footnotesPrompt(insights));
      
      insights = removeDuplicateInsights(insights.concat(result.additionalInsights));

      await setTimeout(3200); // 20 per minute rate limit

      result.footnotes.map(footnote => footnote.citations.map((c) => {
        allNotes.push({
          source: {
            bookId,
            footnoteIdentifier: footnote.identifier,
            footnotePage: page.page
          },
          referenceBookId: null,
          author: c.author,
          title: c.title,
          location: c.location,
          raw: c.raw,
          locationsCited: c.locationsCited,
        });
      }));
      
      return [];
    } catch (e) {
      failedPages.push({
        page: page.page,
        error: (e as Error).message ?? String(e)
      });
      
      return [];
    }
  });

  return { citations: allNotes, failedPages, insights };
};

getNextBook()
  .then(book => getBookContents(book))
  .then(contents => {
  
  extractFootnoteCitations(contents).then(extracted => {
    log(extracted);
    log(JSON.stringify(extracted));
  });
});
