import { describe, expect, it } from 'vitest';
import { normalizePagination, paginated } from './pagination';

describe('pagination helpers', () => {
  it('caps limit at 50 and normalizes invalid pages', () => {
    expect(normalizePagination({ page: '-4', limit: '500' })).toEqual({
      page: 1,
      limit: 50,
      skip: 0,
    });
  });

  it('returns industrial list metadata', () => {
    expect(paginated([{ id: 'row-1' }], 101, 2, 50)).toEqual({
      data: [{ id: 'row-1' }],
      meta: { total: 101, page: 2, limit: 50, totalPages: 3 },
    });
  });
});
