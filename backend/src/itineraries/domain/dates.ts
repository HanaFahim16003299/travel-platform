// PURE: no database, no NestJS. Same input -> same output, nothing outside is changed.

const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-12-01" -> 2026-12-01T00:00:00.000Z. Returns null for a bad format or a date that doesn't exist (2026-02-31). */
export function toUtcDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** A new Date, n days later (n can be negative). */
export function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * DAY_MS);
}

/** Date -> "2026-12-01" (the format other modules' searches expect). */
export function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}