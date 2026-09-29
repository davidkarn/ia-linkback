// A book open in a column: /books/<bookId>[/volumes/<volume>][/pages/<pageId>]. Without a volume
// it opens to the volume holding pageId, or volume 1.
export type OpenBook = { bookId: string, volume?: number, pageId?: number };

export const MAX_OPEN_BOOKS = 4;

export const parseOpenBooks = (pathname: string): OpenBook[] => {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const books: OpenBook[] = [];

  for (let i = 0; i + 1 < parts.length && parts[i] === 'books';) {
    const book: OpenBook = { bookId: parts[i + 1]! };
    i += 2;

    const volume = parts[i] === 'volumes'
      ? Number(parts[i + 1])
      : NaN;

    if (Number.isInteger(volume)) {
      book.volume = volume;
      i += 2;
    }

    const pageId = parts[i] === 'pages'
      ? Number(parts[i + 1])
      : NaN;
    
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
      + (b.volume === undefined ? '' : '/volumes/' + b.volume)
      + (b.pageId === undefined ? '' : '/pages/' + b.pageId))
    .join('') || '/'
);

// The books with the one in column `column` turned to pageId of `volume`
export const withPage = (
  books: OpenBook[], column: number, pageId: number, volume: number
): OpenBook[] => (
  books.map((b, i) => (i === column ? { ...b, volume, pageId } : b))
);

// The books after opening `book` from column `column`: it goes just right of that column, replacing any
// columns further right, and when that makes more than MAX_OPEN_BOOKS the leftmost ones are dropped
export const withBookOpened = (books: OpenBook[], column: number, book: OpenBook): OpenBook[] => (
  [...books.slice(0, column + 1), book].slice(-MAX_OPEN_BOOKS)
);

// The books with the one in column `column` closed
export const withBookClosed = (books: OpenBook[], column: number): OpenBook[] => (
  books.filter((_, i) => i !== column)
);
