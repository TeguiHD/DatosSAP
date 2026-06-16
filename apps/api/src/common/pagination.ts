export interface PaginationQuery {
  page?: string | number;
  limit?: string | number;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function normalizePagination(query: PaginationQuery, maxLimit = 50) {
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit ?? maxLimit) || maxLimit));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export function pageMeta(total: number, page: number, limit: number): PageMeta {
  return {
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export function paginated<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    meta: pageMeta(total, page, limit),
  };
}
