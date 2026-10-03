// Judging how likely each book is to be in the public domain in the US, with an LLM, from its title
// and author and what the model knows of them: when the work was published, when its author died.
// Pure functions; cli/commands/check_copyright.command.ts makes the requests and carries out the
// actions.
import type { AppAction } from '../actions/app_actions.ts';
import type { ORResponseFormat } from '../lib/open_router.ts';

// From the most to the least likely to be in the public domain
export const COPYRIGHT_STATUSES = [
  'likely_public_domain', 'probably_public_domain', 'doubtful_public_domain', 'likely_copyrighted',
] as const;
export type CopyrightStatus = typeof COPYRIGHT_STATUSES[number];

// Books whose latest check gives one of these are withheld: left out of the library's searches,
// can't be opened, and their citations of other books aren't shown
export const HIDDEN_COPYRIGHT_STATUSES: CopyrightStatus[] = ['likely_copyrighted'];

// Why a withheld book can't be opened
export const WITHHELD_MESSAGE = 'This book is likely still under copyright, so it can\'t be shown.';

// Whether a book with this status (null: never checked) is shown: listed in the library's
// searches and opened (not withheld)
export const shownInSearches = (status: CopyrightStatus | null): boolean => (
  status === null || !HIDDEN_COPYRIGHT_STATUSES.includes(status)
);

export type BookToCheck = { id: string, title: string, author: string, url: string | null };
export type CopyrightCheck = { bookId: string, status: CopyrightStatus, notes: string };

// In the US, a work published in the year this is or earlier is in the public domain by now: on
// January 1 each year, the works published 96 years before enter it (95 years from publication)
export const publicDomainCutoffYear = (now: Date): number => now.getUTCFullYear() - 96;

export const COPYRIGHT_FORMAT: ORResponseFormat = {
  type:        'json_schema',
  json_schema: {
    name:   'copyright_statuses',
    strict: true,
    schema: {
      type:                 'object',
      additionalProperties: false,
      required:             ['results'],
      properties:           {
        results: {
          type:  'array',
          items: {
            type:                 'object',
            additionalProperties: false,
            required:             ['bookId', 'status', 'notes'],
            properties:           {
              bookId: { type: 'string' },
              status: { type: 'string', enum: [...COPYRIGHT_STATUSES] },
              notes:  { type: 'string' },
            },
          },
        },
      },
    },
  },
};

export const copyrightPrompt = (cutoffYear: number) => `You judge whether books are in the public domain
in the United States, for a library of scanned books (mostly theology, philosophy and the Church
Fathers, many from archive.org).

You will be given the books as a JSON array of {bookId, title, author, url}. The url, when there is
one, is often an archive.org item whose identifier can hint at the edition or its date. For each book,
work out when the edition was most likely published and when its author (and any translator or editor
whose work is in it) died, and give it one status:

- likely_public_domain: clearly published in ${ cutoffYear } or earlier (in the US, works published
  then are in the public domain now), e.g. the Church Fathers in 19th-century translations.
- probably_public_domain: most likely published in ${ cutoffYear } or earlier, or published later but
  very likely without a renewed copyright (US works of 1931-1963 whose copyright wasn't renewed), with
  some uncertainty about the edition or its date.
- doubtful_public_domain: it could go either way: the edition's date is unknown, or a later
  translation, revision or editorial apparatus may be under copyright.
- likely_copyrighted: published after ${ cutoffYear } with its copyright most likely in force.

When you aren't sure which edition this is, judge by the most likely one and say so. Don't guess dates
you have no basis for: say what you don't know.

Return one result per book given, with its bookId exactly as given, its status, and notes: one or
two sentences on the publication year and the author's dates as you know them, and why that status.`;

// The books as the model is given them
export const copyrightRequest = (books: BookToCheck[]): string => JSON.stringify(
  books.map((b) => ({ bookId: b.id, title: b.title, author: b.author, url: b.url }))
);

// The model's results checked against the books asked about: one check per book, the first the
// model gave for it (results for books not asked about are dropped), and the books it gave none
// for (missing), to ask about again on another run
export const checkCopyrightResults = (
  books: BookToCheck[], results: CopyrightCheck[]
): { checks: CopyrightCheck[], missing: string[] } => {
  const asked = new Set(books.map((b) => b.id));
  const first = new Map<string, CopyrightCheck>();

  for (const r of results) {
    if (asked.has(r.bookId) && !first.has(r.bookId) && COPYRIGHT_STATUSES.includes(r.status)) {
      first.set(r.bookId, { bookId: r.bookId, status: r.status, notes: r.notes.trim() });
    }
  }

  return {
    checks:  books.flatMap((b) => first.get(b.id) ?? []),
    missing: books.filter((b) => !first.has(b.id)).map((b) => b.id),
  };
};

// Saving the checks, each logged with its notes, and logging the books the model gave none for
export const copyrightCheckActions = (
  books: BookToCheck[], checks: CopyrightCheck[], missing: string[]
): AppAction[] => {
  const titles = new Map(books.map((b) => [b.id, b.title]));

  return [
    ...checks.flatMap((c): AppAction[] => [
      {
        cmd:  'modelAction',
        data: {
          model:  'CopyrightStatusChecks',
          act:    'saveCheck',
          params: [c],
        },
      },
      {
        cmd:  'log',
        data: [`${ c.status.padEnd(23) } ${ titles.get(c.bookId) } (${ c.bookId })\n    ${ c.notes }`],
      },
    ]),
    ...missing.map((id): AppAction => ({
      cmd:  'log',
      data: [`no result for ${ titles.get(id) } (${ id }): left for the next run`],
    })),
  ];
};
