// Add `citationLocations` to every citation in output/footnotes.json (idempotent).
//
// Usage (from src/):  npx tsx add_citation_locations.ts [path/to/footnotes.json]
// (extract_footnotes.ts now does the same thing when it writes footnotes.json.)
import fs from 'node:fs';
import { add_citation_locations } from './citation_locations';

const file = process.argv[2] ?? 'output/footnotes.json';
const books = JSON.parse(fs.readFileSync(file, 'utf8'));

let citations = 0, with_location = 0, empty_despite_location = 0, records = 0;
const type_counts: Record<string, number> = {};
const unparsed: string[] = [];

for (const book of books) {
  for (const footnote of book.footnotes) {
    add_citation_locations(footnote.citations);
    for (const c of footnote.citations) {
      citations++;
      records += c.citationLocations.length;
      if (c.location) {
        with_location++;
        if (!c.citationLocations.length) {
          empty_despite_location++;
          if (unparsed.length < 40) unparsed.push(`${c.kind} | ${c.title} | ${c.location}`);
        }
      }
      for (const l of c.citationLocations) type_counts[l.type] = (type_counts[l.type] ?? 0) + 1;
    }
  }
}

fs.writeFileSync(file, JSON.stringify(books, null, 1));
console.log({ citations, with_location, citations_with_locations: citations - empty_despite_location, empty_despite_location, records });
console.log('records by type:', type_counts);
if (unparsed.length) console.log('location text that produced no records (first 40):\n  ' + unparsed.join('\n  '));
