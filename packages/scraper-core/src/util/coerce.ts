/** Small coercion helpers for the messy, loosely-typed __NEXT_DATA__ payload. */

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function numOr(v: unknown, fallback: number): number {
  const n = numOrNull(v);
  return n === null ? fallback : n;
}

export function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export function boolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

export function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
