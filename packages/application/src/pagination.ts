export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function resolvePage(
  requested: number | undefined,
  total: number,
  pageSize: number,
): { page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safe = Math.max(1, Math.floor(requested ?? 1) || 1);
  return { page: Math.min(safe, pageCount), pageCount };
}
