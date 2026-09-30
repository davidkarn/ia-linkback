import { createElement as __, useCallback, useEffect, useMemo, useState } from 'react'
import './book_page.scss';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type Book, type BookPage, type Citation, type PageBlock } from '../api';
import { citationSourcePageQuery, pageQuery } from '../queries';
import { match, P } from 'ts-pattern';
import { assertCond } from '../lib';
import BookPager from './book_pager';
import { Link } from 'react-router';
import {
  ArrowLeftToLine, ArrowRightToLine, ChevronDown, ChevronLeft, ChevronRight,
  TableOfContents as ContentsIcon, X,
} from 'lucide-react';
import { formatLocations } from '../core/page_rendering';
import { highlightFootnote, stripUnhighlightedBlocks } from '../core/citations';
import { PageInsightsSummary } from './page_insights';
import { TableOfContents } from './table_of_contents';

const MAX_CITATIONS_BEFORE_COLLAPSING = 3;

export const BookPageView = ({
  book, index, pageId, hrefForPage, hrefForCitingBook, hrefToClose, showCitedBy
}: {
  book: Book,
  index: number,
  pageId: number,
  // a page of the volume open, or of `volume`
  hrefForPage: (pageId: number, volume?: number) => string,
  hrefForCitingBook: (bookId: string, pageId: number) => string,
  hrefToClose?: string,
  // the "Cited by" aside, shown only in the rightmost of several open columns
  showCitedBy: boolean,
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
  const citingBooks  = new Map(page?.foreignCitationTitles.map((b) => [b.bookId, b]) ?? []);

  const thisPageIndex = allPages.findIndex(p => p.pageId === pageId);
  const nextEntry     = thisPageIndex >= 0 ? allPages[thisPageIndex + 1] : undefined;
  const prevEntry     = thisPageIndex > 0 ? allPages[thisPageIndex - 1] : undefined;
  // past either end of the volume: the nearest page of the next or previous volume
  const nextVolume    = book.volumes.find((v) => v.volume === book.volume + 1);
  const prevVolume    = book.volumes.find((v) => v.volume === book.volume - 1);
  const nextPage      = match({entry: nextEntry, volume: nextVolume})
    .with({entry: P.nonNullable}, ({entry}) => hrefForPage(entry.pageId))
    .with({volume: P.nonNullable}, ({volume}) => hrefForPage(volume.firstPageId, volume.volume))
    .otherwise(() => undefined);
  const prevPage      = match({entry: prevEntry, volume: prevVolume})
    .with({entry: P.nonNullable}, ({entry}) => hrefForPage(entry.pageId))
    .with({volume: P.nonNullable}, ({volume}) => hrefForPage(volume.lastPageId, volume.volume))
    .otherwise(() => undefined);

  // the pager or table of contents left of the page, hidden and shown by the first button of
  // the page header
  const [navigationOpen, setNavigationOpen] = useState(true);
  const navigationLabel                     = navigationOpen ? 'Hide navigation' : 'Show navigation';

  // the table of contents, opened by the button left of the title; a click outside the title
  // row closes it
  const [contentsOpen, setContentsOpen] = useState(false);
  const closeContents                   = useCallback(() => setContentsOpen(false), []);

  return match<boolean, React.ReactElement>(true)
    .with(!!error, () => __('p', {className: "error"}, "Couldn't load this page: ", error))
    .with(!page, () => __('p', {className: "muted"}, 'Loading'))
    .otherwise(() => (
      assertCond(page !== null),
        __('div', {className: 'page-with-citations ' + (
          navigationOpen ? ' with-navigation' : ' without-navigation'
        )},
          navigationOpen && __(BookNavigation, {book, hrefForPage, pageId}),
          __('div', {className: 'full-page-layout' + (loading ? ' loading' : '')},
              __('div', {className: 'page-header'},
                __('div', {className: 'page-header-item header-buttons'},
                  __(Link, {
                    to:           hrefForPage(pageId),
                    className:    'navigation-toggle',
                    title:        navigationLabel,
                    'aria-label': navigationLabel,
                    onClick:      (e: React.MouseEvent) => {
                      e.preventDefault();
                      setNavigationOpen(!navigationOpen);
                    },
                  },
                    navigationOpen ? __(ArrowLeftToLine, {}) : __(ArrowRightToLine, {})
                  ),
                  hrefToClose && (
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
            __('header', {className: 'book-header'},
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
          showCitedBy && __('aside', {className: 'cited-by'},
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
                  citing: citingBooks.get(c.source.bookId),
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



// citing: the title and author of the book the citation is in
function CitedBy({citation, citing, hrefForCitingBook, startCollapsed}: {
  citation: Citation,
  citing: BookPage['foreignCitationTitles'][number] | undefined,
  hrefForCitingBook: (bookId: string, pageId: number) => string,
  startCollapsed: boolean,
}) {
  const source                    = citation.source;
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
      !collapsed && __(SourcePage, {citation})
    )
  );
}

// The page the citation's footnote is on, with the footnote highlighted; fetched when it is first
// shown
function SourcePage({citation}: {citation: Citation}) {
  const result = useQuery(citationSourcePageQuery(citation.id));
  const text   = result.data?.sourcePageText;
  const html   = useMemo(
    () => (
      text === undefined
        ? ''
        : stripUnhighlightedBlocks(highlightFootnote(text, citation.source.footnoteIdentifier))
    ),
    [text, citation.source.footnoteIdentifier]
  );

  return match(result)
    .with({status: 'pending'}, () => __('p', {className: 'source-page muted'}, 'Loading'))
    .with({status: 'error'}, (r) => (
      __('p', {className: 'source-page error'}, "Couldn't load the citing page: ", r.error.message)
    ))
    .otherwise(() => (
      html.length === 0
        ? null
        : __('div', {className: 'source-page', dangerouslySetInnerHTML: {__html: html}})
    ));
}

const BookNavigation = ({book, hrefForPage, pageId}: {
  book: Book,
  pageId: number,
  hrefForPage: (pageId: number, volume?: number) => string,
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
        book.contents.length > 0 && (
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
        )
      ),

      __('div', {className: 'navigation-contents'},
        match(currentMode)
          .with('pages', () => (
            __(BookPager, {
              pages:   book.pageOrder,
              volume:  book.volume,
              volumes: book.volumes,
              hrefForPage,
            })
          ))
          .with('contents', () => (
            __(TableOfContents, {
              contents: book.contents,
              volumes:  book.volumes,
              volume:   book.volume,
              pageId,
              hrefForPage,
            })
          ))
          .exhaustive()
      )
    )
  );
};
