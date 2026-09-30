import { describe, expect, it } from '@jest/globals';
import { actionsForArchivePlan, matchCitedBooks, planArchiveQueue } from './cited_books.ts';

const citation = (id: string, author: string, title: string, location = '') => (
  { id, author, title, location, reference_book_id: null as string | null }
);

describe('matchCitedBooks', () => {
  const books  = [
    { id: 'god', author: 'Joseph Pohle', title: 'God: His Knowability, Essence and Attributes' },
    { id: 'sac1', author: 'Joseph Pohle', title: 'The Sacraments, Vol. I: The Sacraments in General' },
    { id: 'sac2', author: 'Joseph Pohle', title: 'The Sacraments, Vol. II: The Holy Eucharist' },
  ];
  const queued = [{ author: 'Adolphe Tanquerey', title: 'The Spiritual Life' }];

  it('matches citations to books by author and title, and by volume among volumes', () => {
    const { referencing } = matchCitedBooks([
      citation('1', 'Pohle', 'God: His Knowability'),
      citation('2', 'Pohle-Preuss', 'The Sacraments', 'Vol. II, p. 30'),
    ], books, queued);

    expect(referencing).toEqual([{ citationId: '1', bookId: 'god' }, { citationId: '2', bookId: 'sac2' }]);
  });

  it('keeps the unmatched citations not queued already, and those with nothing to go by', () => {
    const { notReferencing } = matchCitedBooks([
      citation('1', 'Tanquerey', 'The Spiritual Life'),
      citation('2', 'Garrigou-Lagrange', 'Reality'),
      citation('3', '', 'Ibid.'),
    ], books, queued);

    expect(notReferencing.map((c) => c.id)).toEqual(['2', '3']);
  });

  it('leaves citations linked already alone', () => {
    const linked = { ...citation('1', 'Pohle', 'God: His Knowability'), reference_book_id: 'god' };
    expect(matchCitedBooks([linked], books, queued)).toEqual({ referencing: [], notReferencing: [] });
  });
});

describe('planArchiveQueue', () => {
  const copy = (item: string, file = item + '.pdf') => ({
    archiveUrl: `https://archive.org/details/${ item }`,
    pdfUrl:     `https://archive.org/download/${ item }/${ file }`,
    author:     'A',
    title:      'T',
  });

  it('queues each item once, counting the citations that found it', () => {
    const { toQueue } = planArchiveQueue([copy('x'), copy('x'), copy('y')], new Set(), new Set());
    expect(toQueue.map((q) => [q.fileName, q.citations])).toEqual([['x.pdf', 2], ['y.pdf', 1]]);
  });

  it('skips items queued or imported already, and fails a PDF url with no .pdf file', () => {
    const plan = planArchiveQueue(
      [copy('queued'), copy('book'), copy('odd', 'odd.djvu')],
      new Set([copy('queued').archiveUrl]),
      new Set(['book']),
    );

    expect(plan.toQueue).toEqual([]);
    expect(plan.skipped.map((s) => s.reason)).toEqual(['already queued', 'already a book']);
    expect(plan.failed.map((f) => f.archiveUrl)).toEqual([copy('odd').archiveUrl]);
  });
});

describe('actionsForArchivePlan', () => {
  const plan              = planArchiveQueue([{
    archiveUrl: 'https://archive.org/details/x',
    pdfUrl:     'https://archive.org/download/x/x.pdf',
    author:     'A',
    title:      'T',
  }], new Set(), new Set());
  const [download, queue] = actionsForArchivePlan(plan);
  const result            = (success: boolean) => ({
    'downloadPdf:0': { id: 'downloadPdf:0', success, result: null },
  });

  it('downloads each PDF, then queues its book', () => {
    expect(download).toMatchObject({ id: 'downloadPdf:0', cmd: 'downloadPdf' });
    expect(typeof queue === 'function' && queue(result(true))).toMatchObject({
      id: 'saveToQueue:0', cmd: 'modelAction',
    });
  });

  it("doesn't queue a book whose PDF failed to download", () => {
    expect(typeof queue === 'function' && queue(result(false))).toBeNull();
  });
});
