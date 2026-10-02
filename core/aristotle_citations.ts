// Citations of Aristotle, and his works imported by book_importers/aristotle_epub.ts: the aliases
// citedFatherWork matches them by (see core/fathers_citations.ts), for
// book_importers/fathers_update_incoming_citations.ts --works aristotle.
//
// He is cited by name ("Aristotle", "Aristot.") or, in the scholastics, as "the Philosopher", and
// his works by their Latin titles, abbreviated many ways ("Ethic.", "Metaph.", "De Coel.",
// "Peri Herm.", "Praedic."). Works not imported (Meteorology, Problems, the Magna Moralia) and
// "Analytics" alone (Prior or Posterior?) are left out.
import type { FatherWork } from './fathers_citations.ts';

const ARISTOTLE = /^(?:the\s+)?(?:philosopher|aristot(?:le|\.)?)\.?$/i;

const work = (bookId: string, title: RegExp): FatherWork => ({ bookId: `aristotle-${ bookId }`, author: ARISTOTLE, title });

// Tried in this order: a title before one it would also match ("Eth. Eudemic." before "Ethic.",
// "De Gener. Animal." before "De Gener.")
export const ARISTOTLE_WORKS: FatherWork[] = [
  work('eudemian-ethics', /^eth(?:ic)?\.?\s*eud/i),
  work('nicomachean-ethics', /^(?:ethic|ethics\b|eth\.?\s*ni[ch]|ni[ch]+(?:om)?\.?\s*eth|nicomachean|vic\.?\s*ethic)/i),
  work('metaphysics', /^met(?:aph(?:ysics|ysica|ys)?)?\.?$/i),
  work('on-the-soul', /^de anim(?:a|\.)?$/i),
  work('rhetoric', /^rhet(?:oric|or)?\.?$/i),
  work('physics', /^phys(?:ics|ica|ic)?\b\.?/i),
  work('politics', /^pol(?:it(?:ics|ic)?)?\.?$/i),
  work('topics', /^top(?:ic|ics)?\.?$/i),
  work('posterior-analytics', /^(?:poster|post\.?\s*analyt|an\.?\s*post)/i),
  work('prior-analytics', /^prior/i),
  work('categories', /^(?:categ|praedic)/i),
  work('on-interpretation', /^(?:\d+\s+)?peri\s*herm|^de\s*interp/i),
  work('on-sophistical-refutations', /^(?:de\s*soph|elench)/i),
  // "De Coelo", "De Cœl", "De Caelo", "de Ceelo" (OCR)
  work('on-the-heavens', /^de\s*c(?:oel|œl|ael|eel)/i),
  work('on-the-generation-of-animals', /^de\s*gener(?:at)?\.?\s*anim/i),
  work('on-generation-and-corruption', /^de\s*gener(?:at)?\.?(?:\s*et\s*corr.*)?$/i),
  work('on-the-parts-of-animals', /^de\s*part\.?\s*anim/i),
  work('history-of-animals', /^(?:de\s*)?hist\.?\s*anim|^h\.\s*a\.$|^historia\s*animalium/i),
  work('on-memory-and-reminiscence', /^de\s*memor/i),
  work('on-sleep-and-sleeplessness', /^de\s*somn(?:o|\.)?\s*et\s*vig/i),
  work('on-longevity-and-shortness-of-life', /^de\s*long/i),
  work('on-sense-and-the-sensible', /^de\s*sensu/i),
  work('on-prophesying-by-dreams', /^divin/i),
  work('poetics', /^poet/i),
  work('on-virtues-and-vices', /^de\s*virt/i),
];
