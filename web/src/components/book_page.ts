import { createElement as __, useEffect, useMemo, useRef, useState } from 'react'
import './book_page.scss';
import { fetchPage, type Book, type BookPage, type PageBlock, type PageCitation } from '../api';
import { match } from 'ts-pattern';
import { assertCond } from '../lib';
import BookPager from './book_pager';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatLocations, useBookTitles } from '../core/page_rendering';
import { highlightFootnote, stripUnhighlightedBlocks } from '../core/citations';
import { PageInsightsSummary } from './page_insights';

// One book's page, in one of the side-by-side columns. hrefForPage(pageId) is the URL with this column turned
// to that page; hrefForCitingBook(bookId, pageId) is the URL with that book opened to this column's right.
export const BookPageView = ({
  book, index, pageId, hrefForPage, hrefForCitingBook
}: {
  book: Book,
  index: number,
  pageId: number,
  hrefForPage: (pageId: number) => string,
  hrefForCitingBook: (bookId: string, pageId: number) => string,
}) => {
  const bookId   = book.id;
  const allPages = book.pageOrder;
  
  const [page, setPage]   = useState<BookPage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // ignore a slow response for a page we've already turned past
    let current = true;
    setError(null);
    fetchPage(bookId, pageId)
      .then(p => { if (current) setPage(p); })
      .catch((e: Error) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [bookId, pageId])

  // keep showing the previous page, dimmed, until the next one arrives
  const loading = !page || page.bookId !== bookId || page.pageNumber !== pageId;

  const headerBlocks = page?.blocks.filter((block) => block.label === 'PageHeader') ?? [];
  const bodyBlocks   = page?.blocks.filter((block) => block.label !== 'PageHeader') ?? [];

  const thisPageIndex = allPages.findIndex(p => p.pageId === pageId);
  const nextEntry     = thisPageIndex >= 0 ? allPages[thisPageIndex + 1] : undefined;
  const prevEntry     = thisPageIndex > 0 ? allPages[thisPageIndex - 1] : undefined;
  const nextPage      = nextEntry && hrefForPage(nextEntry.pageId);
  const prevPage      = prevEntry && hrefForPage(prevEntry.pageId);

  return match<boolean, React.ReactElement>(true)
    .with(!!error, () => __('p', {className: "error"}, "Couldn't load this page: ", error))
    .with(!page, () => __('p', {className: "muted"}, 'Loading'))
    .otherwise(() => (
      assertCond(page !== null),
        __('div', {className: 'page-with-citations'},
          __(BookPager, {pages: book.pageOrder, hrefForPage}),
          __('div', {className: 'full-page-layout' + (loading ? ' loading' : '')},
            __('header', {className: 'book-header'},
              __('div', {className: 'page-header'},
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
                        'Previous page',
                      )
                    )
                  ),
                  nextPage && (
                    __(Link, {to: nextPage},
                      __('div', {className: 'pager-button'},
                        'Next page', 
                        __(ChevronRight, {})
                      )
                    )
                  )
                ),
              ),              
              __('h1', {className: 'book-title'}, book.title),
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
                c => __(CitedBy, {key: c.id, citation: c, hrefForCitingBook})
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


// Its title opens the citing book, at the citing page, to the right of this column
function CitedBy({citation, hrefForCitingBook}: {
  citation: PageCitation,
  hrefForCitingBook: (bookId: string, pageId: number) => string,
}) {
  const titles = useBookTitles();
  const source = citation.source;

  return (
    __('li', {},
      __(Link, {to: hrefForCitingBook(source.bookId, Number(source.footnotePage))},
        __('cite', {}, titles.get(source.bookId) ?? source.bookId)
      ),
      __('div', {className: 'muted'},
        'footnote ' + source.footnoteIdentifier,
        citation.locationsCited.length > 0 && ' · cites ' + formatLocations(citation.locationsCited)
      ),
      citation.sourcePageText && __(SourcePage, {citation})
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
