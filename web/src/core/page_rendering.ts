import { type Citation } from "../api";


export const LOCATION_LABELS: Record<string, string> = {
  page: 'p.', chapter: 'ch.', book: 'bk.', volume: 'vol.', question: 'q.', article: 'a.',
  lecture: 'lect.', position: '§', verse: 'v.', part: 'pt.',
};


export const formatLocations = (locations: Citation['locationsCited']): string => {
  const groups: { type: string, values: number[] }[] = [];
  
  for (const loc of locations) {
    const last = groups[groups.length - 1];
    if (last && last.type === loc.type) {
      last.values.push(loc.value);
    }
    else {
      groups.push({ type: loc.type, values: [loc.value] });
    }
  }

  return groups.map(g => {
    const ranges: string[] = [];
    for (let i = 0; i < g.values.length; i++) {
      let j = i;
      while (
        j + 1 < g.values.length
          && g.values[j + 1] === g.values[j]! + 1
      ) {
        j++;
      }
      
      ranges.push(
        j > i
          ? g.values[i] + '–' + g.values[j]
          : String(g.values[i])
      );
      
      i = j;
    }
    
    return (LOCATION_LABELS[g.type] ?? g.type) + ' ' + ranges.join(', ');
  }).join(', ');
};
