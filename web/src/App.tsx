import { useEffect, useState, createElement as __, Fragment } from 'react'
import { fetchBooks, type BookList } from './api'
import { match } from 'ts-pattern';
import { assertCond } from './lib';
import './app.scss';

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
    __('main', {},
      __('h1', {}, 'Aurea Tela'),

      match<boolean, React.ReactElement>(true)
        .with(!!error, () => __('p', {className: "error"}, "Couldn't load books: ", error))
        .with(!books, () => __('p', {className: "muted"}, 'Loading'))
        .otherwise(() => (
          assertCond(books !== null),
          __(Fragment, {}, 
            __('p', {className: "muted"},
              'Showing ' + books.items.length + ' of ' + books.meta.count + ' books.'
            ),
            __('ol', {className: "bookshelf"},
              books.items.map(book => (
                __('li', {key: book.id, className: 'book'},
                  __('img', {
                    className: 'book-cover',
                    src: book.coverPhotoPath,
                    title: 'Cover page'
                  }),
                  __('div', {className: 'book-details'},
                    __('span', {className: "title"},
                      book.url
                        ? __('a', {href: book.url}, book.title)
                        : book.title
                    ),
                    __('span', {className: "author"}, book.author),
                    __('span', {className: "pages"}, book.pageCount, ' pages')
                  )
                )
              ))
            )
          )
        ))
    )
  );
}
