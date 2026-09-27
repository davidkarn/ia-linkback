import { createElement as __, useEffect, useState } from 'react'
import './book_page.scss';
import { fetchPage, type Book, type BookPage } from '../api';
import { match } from 'ts-pattern';
import { assertCond } from '../lib';
import BookPager from '../BookPager';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatLocations } from '../core/page_rendering';

export const BookPageView = ({
  book, index, pageId
}: {
  book: Book,
  index: number,
  pageId: number
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
  const nextPage = thisPageIndex && thisPageIndex < allPages.length - 1 && (
    '/books/' + encodeURIComponent(bookId) + '/pages/' + allPages[thisPageIndex + 1].pageId
  );
  const prevPage = thisPageIndex && thisPageIndex > 0 && (
    '/books/' + encodeURIComponent(bookId) + '/pages/' + allPages[thisPageIndex - 1].pageId 
  );

  return match<boolean, React.ReactElement>(true)
    .with(!!error, () => __('p', {className: "error"}, "Couldn't load this page: ", error))
    .with(!page, () => __('p', {className: "muted"}, 'Loading'))
    .otherwise(() => (
      assertCond(page !== null),
        __('div', {className: 'page-with-citations'},
          __(BookPager, {pages: book.pageOrder, bookId: book.id}),
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
            __('h2', {}, 'Cited by'),
            page.foreignCitations.length === 0
              ? __('p', {className: 'muted'}, 'No other books in the collection cite this page.')
              : __('ul', {}, page.foreignCitations.map(c => __(CitedBy, {key: c.id, citation: c})))
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


function CitedBy({citation}: {citation: PageCitation}) {
  const titles = useBookTitles();
  const source = citation.source;

  return (
    __('li', {},
      __(Link, {to: '/books/' + encodeURIComponent(source.bookId) + '/pages/' + source.footnotePage},
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

// A footnote marker as printed, for comparing: "18", "1)", "18." -> "18", "1", "18"
const markerKey = (marker: string) => marker.trim().replace(/[).]+$/, '');

// The citing page's HTML with every occurrence of the citation's footnote marker wrapped in <mark>: the note
// reference in the body text ("...Christology<sup>18</sup>") and the marker that starts the footnote itself,
// whether superscript or a plain "18 " at the start of its paragraph.
const highlightFootnote = (html: string, identifier: string): string => {
  const key = markerKey(identifier);
  if (!key) return html;

  const template = document.createElement('template');
  template.innerHTML = html;
  const wrap = (node: Node) => {
    const mark = document.createElement('mark');
    node.parentNode!.replaceChild(mark, node);
    mark.appendChild(node);
  };

  for (const sup of [...template.content.querySelectorAll('sup')]) {
    if (markerKey(sup.textContent ?? '') === key) wrap(sup);
  }
  for (const p of [...template.content.querySelectorAll('p')]) {
    const first = p.firstChild;
    const match = first?.nodeType === Node.TEXT_NODE ? first.textContent!.match(/^\s*(\S+)\s/) : null;
    if (first && match && markerKey(match[1]!) === key) {
      // split "18 Cfr. ..." into "18" (marked) and " Cfr. ..."
      const text = first as Text;
      const start = text.textContent!.indexOf(match[1]!);
      const marker = text.splitText(start);
      marker.splitText(match[1]!.length);
      wrap(marker);
    }
  }
  return template.innerHTML;
};

// The citing page's text under a "Cited by" entry, scrolled to the first highlighted marker (usually where the
// body text cites this page)
function SourcePage({citation}: {citation: PageCitation}) {
  const box = useRef<HTMLDivElement>(null);
  const html = useMemo(
    () => highlightFootnote(citation.sourcePageText, citation.source.footnoteIdentifier),
    [citation.sourcePageText, citation.source.footnoteIdentifier]
  );

  useEffect(() => {
    const mark = box.current?.querySelector('mark');
    if (box.current && mark) {
      box.current.scrollTop = Math.max(0, mark.offsetTop - box.current.clientHeight / 3);
    }
  }, [html]);

  return __('div', {className: 'source-page', ref: box, dangerouslySetInnerHTML: {__html: html}});
}
