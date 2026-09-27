// Matching a citation's author and title against a book's: shared by link_citations.ts and
// link_citation_pages.ts. See link_citations.ts for what counts as the same author and the same title.

// also re-joins words broken at a line end by the OCR: "Knowabil- ity" -> "knowability"
export const fold = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/(\p{L})[-\u00ad]\s+(\p{Ll})/gu, '$1$2');
// "Christian Philosophy: God, 2nd ed" / ", Chapter XV" / ", vol. II" -> "Christian Philosophy: God"
export const citedTitle = (s: string) =>
  s.replace(/,\s*(?:\d+(?:st|nd|rd|th)\s+ed|ed\.|edition|chapter|chap\.|ch\.|vol|vols|book|bk|part|pt|tom|tome|lib|p\.|pp\.)(?![a-z]).*$/i, '').trim();
// "Vol. II" / "vol. iii" / "Volume 2" in a title or location -> 2
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
const roman = (r: string) => [...r].reduce((n, ch, k, a) => {
  const v = ROMAN[ch], next = ROMAN[a[k + 1]] ?? 0;
  return n + (v < next ? -v : v);
}, 0);
export const volumeOf = (s: string | null | undefined): number | null => {
  const m = (s ?? '').match(/\b(?:vol|vols|volume|tom)\.?\s*([ivxlc]+|\d+)\b/i);
  if (!m) return null;
  return /^\d+$/.test(m[1]) ? +m[1] : roman(m[1].toLowerCase());
};
export const tokens = (s: string) => fold(s).replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean).map(t => (t === 'st' ? 'saint' : t));
// main title: before the first ":" / ";" (subtitle) -- "Christian philosophy, God; being ..." -> "christian philosophy god"
const mainTitle = (s: string) => tokens(citedTitle(s).split(/[:;]|\s[-\u2014]\s|,?\s+by\s+|,\s*or,?\s+/i)[0]);

const jaro_winkler = (a: string, b: string): number => {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false), bm = new Array(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true; m++; break;
    }
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let l = 0;
  while (l < 4 && a[l] === b[l]) l++;
  return jaro + l * 0.1 * (1 - jaro);
};

const startsWith = (long: string[], short: string[]) => short.length > 0 && short.every((t, i) => long[i] === t);
const contains = (long: string[], short: string[]) => {
  for (let i = 0; i + short.length <= long.length; i++) if (short.every((t, j) => long[i + j] === t)) return true;
  return false;
};
const ARTICLES = new Set(['a', 'an', 'the', 'le', 'la', 'les', 'l', 'der', 'die', 'das', 'il', 'lo', 'el']);
export const dropArticle = (t: string[]) => (t.length > 1 && ARTICLES.has(t[0]) ? t.slice(1) : t);

export const sameTitle = (citedRaw: string, otherRaw: string): boolean => {
  // "The Sacraments" ~ "The Sacraments, Vol. II: The Holy Eucharist": volumes are told apart separately
  const cited = citedTitle(citedRaw) || citedRaw, other = citedTitle(otherRaw) || otherRaw;
  const c = dropArticle(tokens(cited)), o = dropArticle(tokens(other));
  if (!c.length || !o.length) return false;
  if (c.join(' ') === o.join(' ')) return true;
  const cm = dropArticle(mainTitle(cited)), om = dropArticle(mainTitle(other));
  // one is the other plus a subtitle; a single shared word ("Logic") isn't enough on its own
  // (a truncated two-word title like "God: His" doesn't match a seven-word one)
  const prefixOk = (short: string[], long: string[]) => short.length >= 3 || long.length <= short.length + 2;
  if (c.length >= 2 && startsWith(o, c) && prefixOk(c, o)) return true;
  if (om.length >= 2 && startsWith(c, om) && prefixOk(om, c)) return true;
  // equal main titles ("Epistemology" ~ "Epistemology, or the Theory of Knowledge"); the author must match too
  if (cm.length >= 1 && cm.join(' ') === om.join(' ') && (cm.length >= 2 || c.length === cm.length)) return true;
  // "De Deo Creante et Elevante" in "Tractatus de Deo creante et elevante": a run of 3+ words covering most of it
  if (c.length >= 3 && contains(om, c) && c.length / om.length >= 0.6) return true;
  return c.join(' ').length >= 12 && jaro_winkler(c.join(' '), o.join(' ')) >= 0.93;
};

const NAME_NOISE = new Set(['st', 'saint', 'rev', 'fr', 'dr', 'prof', 'mgr', 'card', 'cardinal', 'bp', 'bishop', 'pope',
  'sj', 'op', 'osb', 'ofm', 'de', 'di', 'du', 'del', 'della', 'des', 'von', 'van', 'der', 'den', 'le', 'la', 'da', 'of', 'and', 'the', 'ed', 'tr', 'trans']);
// "Pohle-Preuss" -> [pohle, preuss]; "J. T. Driscoll" -> [driscoll]; "Thomas Aquinas" -> [thomas, aquinas]
export const surnames = (author: string): string[] =>
  tokens(author).filter(t => t.length > 2 && !NAME_NOISE.has(t) && !/^\d+$/.test(t));
// The names that must match: "Pohle-Preuss" -> both parts; "Driscoll, John T. (John Thomas), 1866-" -> the part
// before the comma; "J. T. Driscoll" -> the last name.
export const keyNames = (author: string): string[] => {
  if (author.includes(',')) return surnames(author.split(',')[0]);
  if (/\p{L}-\p{L}/u.test(author)) return surnames(author);
  const last = surnames(author).pop();
  return last ? [last] : [];
};
export const sameAuthor = (cited: string, other: string): boolean => {
  const keys = keyNames(cited), o = new Set(surnames(other));
  return keys.length > 0 && keys.some(k => o.has(k));
};

export const skipCitation = (author: string, title: string) =>
  !author.trim() || !title.trim() || /^bible$/i.test(author.trim()) || tokens(title).join('').length < 4;
