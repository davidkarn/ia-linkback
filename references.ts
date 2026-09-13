import fs from 'node:fs';
import { parse } from 'node-html-parser';

type SuryaBlock = {
  polygon: [number, number][],
  confidence: number,
  label: "SectionHeader"|"Text"|"PageHeader"|"PageFooter"|"Footnote",
  raw_label: "Section-Header"|"Text"|"Page-Header"|"Page-Footer"|"Footnote",
  reading_order: number,
  html: string,
  skipped: boolean,
  error: boolean,
  bbox: [number, number, number, number]
};

type SuryaPage = {
  blocks: SuryaBlock[],
  page: number,
  image_bbox: [number, number, number, number]
};

type CitationPartName = (
 "number"
| "chapter"
| "verse"
| "book"
| "article"
| "lecture"
| "disputation"
| "question"
| "page"
);

type CitationPart = (
  {part: CitationPartName, type: 'range', start: number, end: number}
| {part: CitationPartName, type: 'single', value: number}
)

type VolumeRef = {
  title: string,
  query: string[],
  author: string,
  format: CitationPartName[]
};

const scholastic_volumes: VolumeRef[] = [{
  title: 'Confessions',
  query: ["Confessions"],
  author: 'St. Augustine',
  format: ["book", "chapter"]
}, {
  title: "Liber de similitudinibus et exemplis",
  query: ["Lib. de similtudinibus"],
  author: "Giovanni da San Gimignano",
  format: ["chapter"]
}, {
  title: "Summa Theologica",
  query: ["Summa Theologica", "Summa", "ST", "Summ. Theol", "Sum. Theol"],
  author: "St. Thomas Aquinas",
  format: ["book", "question", "article"]
}, {
  title: "Cursus Theologica",
  query: ["Cursus Theol."],
  author: "John Poinsot",
  format: ["part", "question", "disputation", "article", "number"]
}, {
  title: "Commentary on the Trinity of Boethius",
  query: ["In Lib. Boet. de Trin.", "Lib. Boet. de Trin."],
  author: "St. Thomas Aquinas",
  format: ["question", "article"]
}, {
  title: "Summa Contra Gentiles",
  query: ["Summa Contra Gentiles", "SCG", "Contra Gentiles"],
  author: "St. Thomas Aquinas",
  format: ["book", "question"]
}, {
  title: "De Potentia",
  query: ["De Potentia", "De Pot."],
  author: "St. Thomas Aquinas",
  format: ["question", "article"]
}, {
  title: "Commentary on the Book of Metaphysics",
  query: ["Comm. in Metaph. Arist"],
  author: "St. Thomas Aquinas",
  format: ["book", "lecture"]
}, {
  title: "Commentary on the Book of Physics",
  query: ["In Libros Physicorum"],
  author: "St. Thomas Aquinas",
  format: ["book", "lecture"]
}, {
  title: "Sententia libri Ethicorum",
  query: ["Ethicorum", "In Lib. Ethic. ad Nichom."],
  author: "St. Thomas Aquinas",
  format: ["book", "chapter"]
}, {
  title: "Quodlibetal Questions",
  query: ["Quodlibet."],
  author: "St. Thomas Aquinas",
  format: ["book", "article"]
}, {
  title: "Metaphysics",
  query: ["Metaphysics", "Metaph.", "Met."],
  author: "Aristotle",
  format: ["number"]
}, {
  title: "1. Corinthians",
  query: ["I Cor."],
  format: ["chapter", "verse"]
}];


function parse_roman(str1) {
  if (str1 == null) {
    return -1;
  }
  if (str1.match(/^\d+$/)) {
    return Number.parseInt(str1);
  }
  else {
    var num = char_to_int(str1.charAt(0));
    var pre, curr

    for (var i = 1; i < str1.length; i++){
	    curr     = char_to_int(str1.charAt(i));
	    pre      = char_to_int(str1.charAt(i - 1));
    
	    if(curr <= pre) {
	      num   += curr;
      }
	    else {
	      num    = num - (pre * 2) + curr;
      }
    }
	
    return num;
  }
}

function char_to_int(c: string): number {
  switch (c.toUpperCase()) {
    case 'I': return 1;
    case 'V': return 5;
    case 'X': return 10;
    case 'L': return 50;
    case 'C': return 100;
    case 'D': return 500;
    case 'M': return 1000;
    default: return 0;
  }
}


const parse_num = (num: string) => {
  if (num.match(/[a-f]/i)) {
    return num;
  }
  else if (num.match(/[ivxlcdm]+/i)) {
    return parse_roman(num);
  }
  else {
    return parseInt(num);
  }
};
  
const detect_citation = (
  text: string,
  volumes: {
    title: string,
    query: string[],
    author: string,
    format: ("number"|"chapter"|"verse"|"book"|"article"|"lecture"|"disputation"|"question"|"page")[]
  }[]
) => {
  const citation_parts = {
    number: ["number", "num", "numb", "n"],
    chapter: ["Chapter", "ch", "c", "chap", "chapt"], 
    verse: ["verse", "v", "ver"],
    book: ["book", "bk", "vol", "volume"], 
    article: ["a", "art", "article"],
    lecture: ["l", "lect", "lec", "lecture"],
    disputation: ["disputation", "disp"],
    question: ["q", "quest", "question"],
    page: ["page", "p", "pp"]
  };
  const number_regex = "([ivxmcIVXMC]+|[0-9]+|[0-9]+[a-f][0-9]*)";

  const possible_citation_regex = new RegExp(
    "(<i>)?(cf. ([^ ]+\\s+){1,5}[,:. ]+)?"
      + "(\".*?\"|(<i>)[^<>]{3,200}(</i>))(\\s+in\\s+(\".*?\"|<i>.*?</i>))?"
      + "[-,. :]*"
      + "(" + Object.values(citation_parts).flat().concat("").map(
        part => part + "[- ,.;]*" + number_regex + "(-" + number_regex + "[- ,.;]*)?[- ,.;]*"
      ).join("|")
      + ")+(</i>)?", "ig"
  );

  const read_parts = (text: string): CitationPart[] => {
    const parts_section = new RegExp(
      "(\\b" + Object.values(citation_parts).flat().concat("").map(
        part => part + "[- ,.;]+" + number_regex + "(-" + number_regex + "[- ,.;]*)?[- ,.;]+"
      ).join("|")
        + "\\b|\\b[0-9]+[a-f]*[0-9]*[-,. :]+\\b)+.*?$",
      "i"
    );

    const parts_text = text.match(parts_section)?.[0] ?? ''
    const parts_regex = new RegExp(
      "(" + Object.values(citation_parts).flat().concat("").map(
        part => part + "[- ,.;]+" + number_regex + "(-" + number_regex + "[- ,.;]*)?[- ,.;]*"
      ).join("|")
        + "|[0-9]+[a-f]*[0-9]+)",
      "ig"
    );
    const matches = parts_text.match(parts_regex) ?? [];

    const numbers = matches.map(match => {
      const test_str                   = match.toLowerCase().replace(/[- ;.,:]+$/, '');        
      const [part_label, part_matched] = Object.entries(citation_parts)
        .map(([label, names]): [string, bool][] => [
          label, names.find(n => test_str.startsWith(n.toLowerCase()))
        ]).find(n => n[1]) ?? ['', ''];
      
      const tokens  = test_str.slice(part_matched.length + 1)
        .replace(/[- ;.,:]+$/, '')
        .replace(/^[- ;.,:]+/, '')
        .split(/[ ;.,:]+$/);
      const num     = tokens[tokens.length - 1];

      if (num.includes('-')) {
        const parts = num.split('-');
        
        return {
          part: part_label,
          type: 'range',
          start: parse_num(parts[0]),
          end: parse_num(parts[1])
        };
      }
      else {
        return {
          part: part_label,
          type: 'single',
          value: parse_num(num)
        };
      }
    });

    return numbers;
  };

  return (text.match(possible_citation_regex) ?? []).map(matched_text => {
    const matching_vols = volumes
      .flatMap(v => v.query.map(
        (query): [VolumeRef, string, bool] => [v, query, !!matched_text.match(
          new RegExp('("|<i>)' + query + '("|</i>|[.,:; ]+)', "i")
        )]
      ))
      .filter(val => val[2]);

    const [matching_vol, matched_query] = matching_vols[0] ?? [];
    let title: string, author: string, parts: CitationPart[];

    if (matching_vol) {
      title = matching_vol.title;
      author = matching_vol.author;
      parts = read_parts(
        matched_text.slice(matched_text.search(new RegExp(matched_query, "i")))
      );
    }
    else {
      title = matched_text.match(/(".*?"|<i>.*?<\/i>)/i)?.[0] ?? null;
      author = '';
      parts = read_parts(
        matched_text
      );
    }

    return title ? {title, author, parts} : null;
  }).filter(x => x);
};

//   "<p><sup>11</sup> Sertillanges: <i>St. Thomas d'Aguin I</i>, p. 157.</p>",
//  '<p><sup>8</sup> <i>Comm. in Metaph. Arist. Lib. II. Lect. 1.</i></p>',
//   '<p><sup>4</sup> <i>Metaph.</i> 998b9.</p>',
//  '<p><sup>3</sup> Cf. Rocco, "The Political Doctrine of Fascism," in <i>International Conciliation</i>, Oct., 1926, p. 295.</p>',
//  "<p><sup>6</sup> Cf. Grabmann, Martin, <i>St. Thomas' Philosophy of Civilization</i>.</p>",
// '<p><sup>20</sup> For fuller treatment of this question see Garrigou-Lagrange, <i>God: His Existence and Nature</i>, Vol. I, pp. 199 ff., pp. 331 ff.; Lehu, <i>Philosophia Moralis</i>, p. 124, p. 250; Farrell, <i>The Natural Moral Law</i>, pp. 130 ff.</p>',

//detect_citation('<p><sup>8</sup> <i>Comm. in Metaph. Arist. Lib. II. Lect. 1.</i></p>', scholastic_volumes);
//detect_citation('<p><sup>20</sup> For fuller treatment of this question see Garrigou-Lagrange, <i>God: His Existence and Nature</i>, Vol. I, pp. 199 ff., pp. 331 ff.; Lehu, <i>Philosophia Moralis</i>, p. 124, p. 250; Farrell, <i>The Natural Moral Law</i>, pp. 130 ff.</p>', scholastic_volumes);

const read_folder = (foldername: string) => {
  const files = fs.readdirSync('../' + foldername + "/results/surya/");
  return files
    .filter(f => f[0] !== '.')
    .map(f => foldername + "/results/surya/" + f + "/results.json");  
};

const parse_footnote = (block: SuryaBlock) => {
  const html = parse(block.html);
  const sup = html.querySelector('sup');

  return {number: parseInt(sup?.textContent), contents: block.html};
};

const is_block_el = (el: parse.HTMLElement): boolean => (
  el.tagName === "p"
    || el.tagName === "div"
    || el.tagName === "center"
    || el.tagName === "li"
);

const get_outer_text_block = (el: parse.HTMLElement): parse.HTMLElement => (
  !el.parentNode || is_block_el(el)
    ? el
    : get_outer_text_block(el.parentNode)
);
  
const extract_fn_references = (block: SuryaBlock, fn_numbers: number[]) => {
  const html = parse(block.html);

  return html.querySelectorAll('sup')
    .map(sup => [sup, parseInt(sup.innerText)])
    .filter(sup => fn_numbers.includes(sup[1]))
    .map(sup => ({
      fn_number:     sup[1],
      text_contents: get_outer_text_block(sup[0]).outerHTML
  }));
};

const scan_references = (filename: string) => {
  const data  = JSON.parse(fs.readFileSync('../' + filename, 'utf8'));
  const pages = data[Object.keys(data)[0]];

  return pages.map(parse_page);
}

const parse_page  = (page: SuryaPage) => {
  const blocks: SuryaBlock[] = page.blocks;
  const page_number          = page.page;

  const footnotes = blocks
    .filter(block => block.label === "Footnote")
    .map(parse_footnote);

  const fn_numbers = footnotes.map(fn => fn.number);

  const blocks_referencing_footnotes = blocks
    .filter(block => block.label === "Text")
    .flatMap(block => extract_fn_references(block, fn_numbers));
  
  return {footnotes, page_number, blocks_referencing_footnotes}
};

const file = read_folder("thomist")[0];

//console.log('<p><sup>20</sup> For fuller treatment of this question see Garrigou-Lagrange, <i>God: His Existence and Nature</i>, Vol. I, pp. 199 ff., pp. 331 ff.; Lehu, <i>Philosophia Moralis</i>, p. 124, p. 250; Farrell, <i>The Natural Moral Law</i>, pp. 130 ff.</p>',
//  detect_citation('<p><sup>20</sup> For fuller treatment of this question see Garrigou-Lagrange, <i>God: His Existence and Nature</i>, Vol. I, pp. 199 ff., pp. 331 ff.; Lehu, <i>Philosophia Moralis</i>, p. 124, p. 250; Farrell, <i>The Natural Moral Law</i>, pp. 130 ff.</p>', scholastic_volumes))xo;
//console.log(file);
console.dir(
  scan_references(file)
    .flatMap(page => page.footnotes)
    .map(fn => fn.contents)
    .map(fn => [fn, detect_citation(fn, scholastic_volumes)]),
  { depth: null, colors: true }
  );
