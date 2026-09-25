import { useEffect, useState } from 'react'
import { fetchBooks, type BookList } from './api'

const PAGE_LENGTH = 20

export default function App() {
  const [books, setBooks] = useState<BookList | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchBooks({ length: PAGE_LENGTH })
      .then(setBooks)
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <main>
      <h1>Books</h1>
      {error ? (
        <p className="error">Couldn't load books: {error}</p>
      ) : !books ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <p className="muted">
            Showing {books.items.length} of {books.meta.count} books
          </p>
          <ol className="books">
            {books.items.map(book => (
              <li key={book.id}>
                <span className="title">
                  {book.url ? <a href={book.url}>{book.title}</a> : book.title}
                </span>
                <span className="author">{book.author}</span>
                <span className="pages">{book.pageCount} pages</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  )
}
