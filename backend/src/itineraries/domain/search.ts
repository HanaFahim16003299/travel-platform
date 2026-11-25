// PURE: building filters and sort orders for lists and public search (ITN-03, ITN-21).
// They only build plain objects; the store runs them against MongoDB.

/** Make user text literal inside a regex, so "a.b*" is searched as the characters a . b *. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function keywordRegex(q: string): RegExp {
  return new RegExp(escapeRegex(q), 'i');
}

export function validateDayRange(minDays?: number, maxDays?: number): string | null {
  return minDays && maxDays && minDays > maxDays ? 'minDays cannot be greater than maxDays' : null;
}

export interface PublicSearchInput {
  /** Rows matching this are allowed to be seen at all (public, not hidden, author active). */
  visibleFilter: Record<string, unknown>;
  countryId?: string;
  cityId?: string;
  minDays?: number;
  maxDays?: number;
  /** Keyword part, already resolved: the regex for titles + ids of countries/cities whose NAME matched. */
  keyword?: { regex: RegExp; countryIds: unknown[]; cityIds: unknown[] };
}

/** ITN-21: keyword in title, country or city; filters by country, city, min/max days. */
export function buildPublicSearchFilter(input: PublicSearchInput): Record<string, unknown> {
  const parts: Record<string, unknown>[] = [input.visibleFilter];

  if (input.keyword) {
    const { regex, countryIds, cityIds } = input.keyword;
    const anyOf: Record<string, unknown>[] = [{ title: regex }];
    if (countryIds.length) anyOf.push({ countryIds: { $in: countryIds } });
    if (cityIds.length) anyOf.push({ 'days.cityId': { $in: cityIds } });
    parts.push({ $or: anyOf });
  }
  if (input.countryId) parts.push({ countryIds: input.countryId });
  if (input.cityId) parts.push({ 'days.cityId': input.cityId });
  if (input.minDays || input.maxDays) {
    parts.push({
      dayCount: {
        ...(input.minDays ? { $gte: input.minDays } : {}),
        ...(input.maxDays ? { $lte: input.maxDays } : {}),
      },
    });
  }
  return parts.length === 1 ? parts[0] : { $and: parts };
}

export function validateSort(field: string | undefined, allowed: readonly string[]): string | null {
  return field && !allowed.includes(field) ? `sort must be one of: ${allowed.join(', ')}` : null;
}

/** { updatedAt: -1 } style sort; falls back to the default when no field is asked for. */
export function buildSort(
  field: string | undefined,
  order: 'asc' | 'desc' | undefined,
  fallback: Record<string, 1 | -1>,
): Record<string, 1 | -1> {
  return field ? { [field]: order === 'desc' ? -1 : 1 } : fallback;
}

/** How many rows to skip for a 1-based page. */
export function skipFor(page: number, limit: number): number {
  return (page - 1) * limit;
}