// The page a citation's footnote is on, as a reader sees it beside the cited page: its blocks in
// reading order, without running headers and footers, and with only that citation's footnote of
// the page's footnotes. Pure functions; model/citation_source_pages.ts reads the blocks.

export type SourceBlock = { id: string, label: string, html: string };

// The footnote marker a paragraph starts with ("<p><sup>18</sup> ...", "<p>18 ...", "<p>1) ...", "<p>* ..."),
// without trailing ")" or "."; null for a paragraph that continues the footnote before it
const paragraph_marker = (p: string): string | null => {
  const m      = p.match(/^\s*<p>\s*(?:<sup>\s*([^<]+?)\s*<\/sup>|(\d{1,3}\)?|[*†‡])\s)/i);
  const marker = m?.[1] ?? m?.[2];

  return marker === undefined ? null : marker.trim().replace(/[).]+$/, '');
};

// The paragraphs of a citation's footnote among its page's Footnote blocks: from the paragraph in the
// citation's block whose marker is its identifier (or, for a footnote continued from the previous page, with
// no identifier, from the block's first paragraph) through the unmarked paragraphs after it, which can run on
// into later blocks, up to the next marked footnote. If no paragraph matches, the citation's whole block.
// Returns the kept paragraphs' HTML per block id.
const footnote_paragraphs = (footnoteBlocks: SourceBlock[], blockId: string, identifier: string) => {
  const paragraphs = footnoteBlocks.flatMap((b) => (
    b.html
      .split(/(?=<p[\s>])/i)
      .filter((p) => p.trim())
      .map((html) => ({
        blockId: b.id,
        html,
        marker:  paragraph_marker(html)
      }))
  ));

  const wanted = identifier.trim().replace(/[).]+$/, '');

  let start = paragraphs.findIndex(
    (p) => p.blockId === blockId && (wanted ? p.marker === wanted : true)
  );

  if (start >= 0 && !wanted && paragraphs[start]!.marker !== null) {
    start = -1;   // no identifier, but the block starts a new footnote: can't tell which
  }

  const kept = new Map<string, string[]>();
  if (start < 0) {
    const block = footnoteBlocks.find((b) => b.id === blockId);

    if (block) {
      kept.set(block.id, [block.html]);
    }

    return kept;
  }
  for (
    let i = start;
    i < paragraphs.length && (i === start || paragraphs[i]!.marker === null);
    i++
  ) {
    const p = paragraphs[i]!;
    kept.set(
      p.blockId,
      [...(kept.get(p.blockId) ?? []), p.html]
    );
  }
  return kept;
};

// sourcePageText: the HTML of the page a citation's footnote is on, one block per line in reading order,
// without running headers and footers, and with only the citation's own footnote of the page's footnotes
export const citation_page_html = (blocks: SourceBlock[], blockId: string, identifier: string) => {
  const footnote = footnote_paragraphs(
    blocks.filter((b) => b.label === 'Footnote'),
    blockId,
    identifier
  );

  return blocks
    .flatMap((b) => (
      b.label === 'PageHeader' || b.label === 'PageFooter' ? []
        : b.label === 'Footnote' ? (footnote.has(b.id) ? [footnote.get(b.id)!.join('').trim()] : [])
          : [b.html]
    ))
    .join('\n');
};
