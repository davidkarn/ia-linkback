// A footnote marker as printed, for comparing: "18", "1)", "18." -> "18", "1", "18"
const markerKey = (marker: string) => marker.trim().replace(/[).]+$/, '');

// The citing page's HTML with every occurrence of the citation's footnote marker wrapped in <mark>: the note
// reference in the body text ("...Christology<sup>18</sup>") and the marker that starts the footnote itself,
// whether superscript or a plain "18 " at the start of its paragraph.
export const highlightFootnote = (html: string, identifier: string): string => {
  const key = markerKey(identifier);
  if (!key) {
    return html;
  }
  else {
    const template = document.createElement('template');
    template.innerHTML = html;
    
    const wrap = (node: Node) => {
      const mark = document.createElement('mark');
      node.parentNode!.replaceChild(mark, node);
      mark.appendChild(node);
    };

    for (const sup of [...template.content.querySelectorAll('sup')]) {
      if (markerKey(sup.textContent ?? '') === key) {
        wrap(sup);
      }
    }
    
    for (const p of [...template.content.querySelectorAll('p')]) {
      const first = p.firstChild;
      const match = first?.nodeType === Node.TEXT_NODE
        ? first.textContent!.match(/^\s*(\S+)\s/)
        : null;

      if (first && match && markerKey(match[1]!) === key) {
        // split "18 Cfr. ..." into "18" (marked) and " Cfr. ..."
        const text   = first as Text;
        const start  = text.textContent!.indexOf(match[1]!);
        const marker = text.splitText(start);
        marker.splitText(match[1]!.length);
        wrap(marker);
      }
    }
    return template.innerHTML;
  }
};

export const stripUnhighlightedBlocks = (highligtedText: string): string => {
  const template = document.createElement('template');
  template.innerHTML = highligtedText;
    
  for (const p of [...template.content.querySelectorAll('p, div, ul, ol, blockquote')]) {
    if (!p.innerHTML.includes('<mark>')) {
      p.parentNode.removeChild(p);
    }
  }

  return template.innerHTML;
};
