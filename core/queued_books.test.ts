import { describe, expect, it } from '@jest/globals';
import { QUEUE_STATUSES, statusCounts } from './queued_books.ts';

describe('statusCounts', () => {
  it('gives every status in pipeline order, those no book has as 0', () => {
    const counts = statusCounts([{ status: 'imported', count: 6 }, { status: 'queued', count: 622 }]);

    expect(counts.map((c) => c.status)).toEqual(QUEUE_STATUSES);
    expect(counts.find((c) => c.status === 'queued')?.count).toBe(622);
    expect(counts.find((c) => c.status === 'imported')?.count).toBe(6);
    expect(counts.find((c) => c.status === 'complete')?.count).toBe(0);
  });
});
