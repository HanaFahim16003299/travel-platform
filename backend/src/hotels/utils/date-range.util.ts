import { BadRequestException } from '@nestjs/common';

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_NIGHTS = 366;

export function toUtcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** One UTC-midnight Date per night in [start, end). */
export function getNightsBetween(start: Date, end: Date): Date[] {
  const first = toUtcMidnight(start);
  const last = toUtcMidnight(end);

  if (last <= first) {
    throw new BadRequestException('endDate must be after startDate');
  }

  const nightCount = (last.getTime() - first.getTime()) / DAY_MS;
  if (nightCount > MAX_RANGE_NIGHTS) {
    throw new BadRequestException(
      `Date range cannot exceed ${MAX_RANGE_NIGHTS} nights`,
    );
  }

  return Array.from(
    { length: nightCount },
    (_, i) => new Date(first.getTime() + i * DAY_MS),
  );
}
/** Rejects a range whose first night is before today (UTC). */
export function assertNotInPast(firstNight: Date): void {
  if (firstNight < toUtcMidnight(new Date())) {
    throw new BadRequestException('startDate cannot be in the past');
  }
}
