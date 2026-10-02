import { createElement as __ } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { match } from 'ts-pattern';
import { authorQuery } from '../queries'
import { Header } from '../components/header';
import { Library } from '../components/library';
import './home.scss';
import './authors.scss';

// One author's books (/authors/<id>), searchable (?q=) by title
export default function AuthorPage() {
  const authorId = useParams().authorId ?? '';
  const result   = useQuery(authorQuery(authorId));
  const author   = result.data ?? null;

  return (
    __('main', {className: 'home author'},
      __(Header, {}),
      match(result)
        .with({status: 'error'}, (r) => (
          __('section', {className: 'page-body'},
            __('p', {className: 'error'}, "Couldn't load this author: ", r.error.message)
          )
        ))
        .otherwise(() => (
          __(Library, {
            heading:     author?.name ?? 'Loading',
            subheading:  __('div', {className: 'author-subheading'},
              __(Link, {to: '/authors'}, 'All authors'),
              author && __('span', {},
                ' · ' + author.bookCount + (author.bookCount === 1 ? ' book' : ' books')
                  + ' · cited by ' + author.citedByCount
              ),
            ),
            authorId,
            searchLabel: 'Search titles',
          })
        ))
    )
  );
}
