// The BookSummary schema in ../api.yaml
export type BookSummary = {
  id: string,
  title: string,
  author: string,
  url?: string,
  pageCount: number,
};

export type BookList = { meta: { count: number }, items: BookSummary[] };

export const fetchBooks = async (opts: { offset?: number, length?: number } = {}): Promise<BookList> => {
  const params = new URLSearchParams();
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  if (opts.length !== undefined) params.set('length', String(opts.length));

  const res = await fetch(`/api/books?${params}`);
  if (!res.ok) throw new Error(`GET /books failed: ${res.status} ${res.statusText}`);
  return res.json();
};
