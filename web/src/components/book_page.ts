import { createElement as __, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './book_page.scss';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type Book, type PageBlock, type PageCitation } from '../api';
import { bookSummariesQuery, pageQuery } from '../queries';
import { match } from 'ts-pattern';
import { assertCond } from '../lib';
import BookPager from './book_pager';
import { Link } from 'react-router';
import { ChevronDown, ChevronLeft, ChevronRight, TableOfContents as ContentsIcon, X } from 'lucide-react';
import { formatLocations } from '../core/page_rendering';
import { highlightFootnote, stripUnhighlightedBlocks } from '../core/citations';
import { PageInsightsSummary } from './page_insights';
import { TableOfContents } from './table_of_contents';

const MAX_CITATIONS_BEFORE_COLLAPSING = 3;

export const BookPageView = ({
  book, index, pageId, hrefForPage, hrefForCitingBook, hrefToClose
}: {
  book: Book,
  index: number,
  pageId: number,
  hrefForPage: (pageId: number) => string,
  hrefForCitingBook: (bookId: string, pageId: number) => string,
  hrefToClose?: string,
}) => {
  const bookId   = book.id;
  const allPages = book.pageOrder;
  
  // the previous page stays up, dimmed, until the next one arrives
  const pageResult = useQuery({...pageQuery(bookId, pageId), placeholderData: keepPreviousData});
  const page       = pageResult.data ?? null;
  const error      = pageResult.error?.message ?? null;
  const loading    = pageResult.isPlaceholderData;

  const headerBlocks = page?.blocks.filter((block) => block.label === 'PageHeader') ?? [];
  const bodyBlocks   = page?.blocks.filter((block) => block.label !== 'PageHeader') ?? [];

  const thisPageIndex = allPages.findIndex(p => p.pageId === pageId);
  const nextEntry     = thisPageIndex >= 0 ? allPages[thisPageIndex + 1] : undefined;
  const prevEntry     = thisPageIndex > 0 ? allPages[thisPageIndex - 1] : undefined;
  const nextPage      = nextEntry && hrefForPage(nextEntry.pageId);
  const prevPage      = prevEntry && hrefForPage(prevEntry.pageId);

  // the table of contents, opened by the button left of the title; a click outside the title
  // row closes it
  const [contentsOpen, setContentsOpen] = useState(false);
  const closeContents                   = useCallback(() => setContentsOpen(false), []);

  return match<boolean, React.ReactElement>(true)
    .with(!!error, () => __('p', {className: "error"}, "Couldn't load this page: ", error))
    .with(!page, () => __('p', {className: "muted"}, 'Loading'))
    .otherwise(() => (
      assertCond(page !== null),
        __('div', {className: 'page-with-citations'},
          __(BookNavigation, {book, hrefForPage, pageId}),
          __('div', {className: 'full-page-layout' + (loading ? ' loading' : '')},
            __('header', {className: 'book-header'},
              __('div', {className: 'page-header'},
                hrefToClose && (
                  __('div', {className: 'page-header-item'},                  
                    __(Link, {
                      to:           hrefToClose,
                      className:    'close-button',
                      title:        'Close this book',
                      'aria-label': 'Close this book',
                    },
                      __(X, {})
                    )
                  )
                ),                
                headerBlocks.map((block) => (
                  __('div', {className: 'page-header-item'},
                    __('div', {dangerouslySetInnerHTML: {__html: block.html}}),
                  )
                )),
                __('div', {className: 'spacer'}),
                __('div', {className: 'pager-buttons'},
                  prevPage && (
                    __(Link, {to: prevPage}, 
                      __('div', {className: 'pager-button'},
                        __(ChevronLeft, {}),
                        'previous',
                      )
                    )
                  ),
                  nextPage && (
                    __(Link, {to: nextPage},
                      __('div', {className: 'pager-button'},
                        'next',
                        __(ChevronRight, {})
                      )
                    )
                  )
                ),
              ),
              __('div', {className: 'book-title-row'},
                __('h1', {className: 'book-title'}, book.title),                
              ),
              __('div', {className: 'book-author'}, book.author)
            ),
            __('article', {className: 'page'},
              page.blocks.length === 0
                ? __('p', {className: 'muted'}, 'No text on this page.')
                : bodyBlocks.map((block, i) => __(Block, {key: i, block}))
            )
          ),
          __('aside', {className: 'cited-by'},
            page.foreignCitations.length > 0
              && __(PageInsightsSummary, {bookId, pageId}),
            
            __('h2', {}, 'Cited by'),
            
            page.foreignCitations.length === 0
              ? __('p', {className: 'muted'},
                'No other books in the collection cite this page.'
              )
              : __('ul', {}, page.foreignCitations.map(
                c => __(CitedBy, {
                  key: c.id,
                  citation: c,
                  hrefForCitingBook,
                  startCollapsed: page.foreignCitations.length > MAX_CITATIONS_BEFORE_COLLAPSING,
                })
              ))
          )
        )
    ));
};

function Block({block}: {block: PageBlock}) {
  return (
    __('div', {className: 'block block-' + block.label},
      __('div', {dangerouslySetInnerHTML: {__html: block.html}}),
      block.citations.length > 0 && __('ul', {className: 'citations'},
        block.citations.map(c => (
          __('li', {key: c.id},
            c.author && __('span', {className: 'author'}, c.author, ', '),
            __('cite', {}, c.title),
            c.locationsCited.length > 0 && ', ' + formatLocations(c.locationsCited)
          )
        ))
      )
    )
  );
}



function CitedBy({citation, hrefForCitingBook, startCollapsed}: {
  citation: PageCitation,
  hrefForCitingBook: (bookId: string, pageId: number) => string,
  startCollapsed: boolean,
}) {
  const books = useQuery(
    bookSummariesQuery()
  ).data ?? new Map<string, never>();
  
  const source                    = citation.source;
  const citing                    = books.get(source.bookId);
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const toggle                    = () => setCollapsed(!collapsed);

  return (
    __('li', {className: 'cited-by-item' + (collapsed ? ' collapsed' : '')},
      __('div', {
        className: 'cited-by-heading',
        role: 'button',
        tabIndex: 0,
        'aria-expanded': !collapsed,
        onClick: toggle,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        },
      },
        __('div', {className: 'cited-by-names'},
          __(Link, {
            to: hrefForCitingBook(source.bookId, Number(source.footnotePage)),
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
          },
            __('cite', {}, citing?.title ?? source.bookId)
          ),
          citing?.author && __('div', {className: 'muted'}, citing.author),
        ),
        __(ChevronDown, {className: 'cited-by-toggle'}),
      ),
      !collapsed && citation.sourcePageText && __(SourcePage, {citation})
    )
  );
}

function SourcePage({citation}: {citation: PageCitation}) {
  const box = useRef<HTMLDivElement>(null);
  const html = useMemo(
    () => stripUnhighlightedBlocks(highlightFootnote(
      citation.sourcePageText,
      citation.source.footnoteIdentifier
    )),
    [citation.sourcePageText, citation.source.footnoteIdentifier]
  );

  return __('div', {
    className: 'source-page',
    ref: box,
    dangerouslySetInnerHTML: {__html: html}
  });
}

const BookNavigation = ({book, hrefForPage, pageId}: {
  book: Book,
  pageId: number,
  hrefForPage: (pageId: number) => string,
}) => {
  const [currentMode, setCurrentMode] = useState<'pages'|'contents'>('pages');

  const hasContents = book.contents.length > 0;

  return (
    __('div', {
      className: 'page-navigation' + (
        currentMode === 'contents' ? ' open-to-contents' : ' open-to-pager'
      )
    },
      __('div', {className: 'page-navigation-controls'},
        __('button', {
          type:            'button',
          className:       'contents-button' + (currentMode === 'contents' ? ' open' : ''),
          title:           'Table of contents',
          'aria-label':    'Table of contents',
          'aria-expanded': currentMode === 'contents',
          onClick:         () => setCurrentMode(
            currentMode === 'contents' ? 'pages' : 'contents'
          ),
        }, __(ContentsIcon, {}))
      ),

      __('div', {className: 'navigation-contents'},
        match(currentMode)
          .with('pages', () => (
            __(BookPager, {pages: book.pageOrder, hrefForPage})
          ))
          .with('contents', () => (
            __(TableOfContents, {
              contents:  book.contents,
              pageOrder: book.pageOrder,
              pageId,
              hrefForPage,
            })
          ))
          .exhaustive()
      )
    )
  );
};
