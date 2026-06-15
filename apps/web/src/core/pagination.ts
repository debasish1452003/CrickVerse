/**
 * A generic paginated result. Services return this for every browse/search so
 * pages render pagers from a single, consistent shape.
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * Clamp a requested page into range given a total and page size. Out-of-range
 * pages snap to the last page (never an empty list with a nonsensical
 * "Page 9999 of 6"); fractional/garbage input floors to a valid page.
 */
export function resolvePage(
  requested: number | undefined,
  total: number,
  pageSize: number,
): { page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safe = Math.max(1, Math.floor(requested ?? 1) || 1);
  return { page: Math.min(safe, pageCount), pageCount };
}
