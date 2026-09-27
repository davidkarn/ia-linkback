// The books open side by side, left to right, and the URL that holds them:
//   /books/<id>[/pages/<pageId>]/books/<id>[/pages/<pageId>]...
// A book without a page opens at its first page, so /books/<id> and /books/<id>/pages/<n> are one open book.

export type OpenBook = { bookId: string, pageId?: number };

export const MAX_OPEN_BOOKS = 4;

// The open books in a path like the above; stops at the first part that doesn't fit the pattern
export const parseOpenBooks = (pathname: string): OpenBook[] => {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const books: OpenBook[] = [];

  for (let i = 0; i + 1 < parts.length && parts[i] === 'books';) {
    const book: OpenBook = { bookId: parts[i + 1]! };
    i += 2;

    const pageId = parts[i] === 'pages' ? Number(parts[i + 1]) : NaN;
    if (Number.isInteger(pageId)) {
      book.pageId = pageId;
      i += 2;
    }
    books.push(book);
  }

  return books.slice(-MAX_OPEN_BOOKS);
};

export const openBooksPath = (books: OpenBook[]): string => (
  books
    .map((b) => '/books/' + encodeURIComponent(b.bookId)
      + (b.pageId === undefined ? '' : '/pages/' + b.pageId))
    .join('') || '/'
);

// The books with the one in column `column` turned to pageId
export const withPage = (books: OpenBook[], column: number, pageId: number): OpenBook[] => (
  books.map((b, i) => (i === column ? { ...b, pageId } : b))
);

// The books after opening `book` from column `column`: it goes just right of that column, replacing any
// columns further right, and when that makes more than MAX_OPEN_BOOKS the leftmost ones are dropped
export const withBookOpened = (books: OpenBook[], column: number, book: OpenBook): OpenBook[] => (
  [...books.slice(0, column + 1), book].slice(-MAX_OPEN_BOOKS)
);
