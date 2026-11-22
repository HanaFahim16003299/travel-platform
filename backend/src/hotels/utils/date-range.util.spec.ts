import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  MAX_RANGE_NIGHTS,
  assertNotInPast,
  getNightsBetween,
  toUtcMidnight,
} from './date-range.util.js';

describe('toUtcMidnight', () => {
  it('truncates a date to UTC midnight of the same calendar day', () => {
    const result = toUtcMidnight(new Date('2026-06-15T23:59:59.999Z'));
    expect(result.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });
});

describe('getNightsBetween (end exclusive)', () => {
  it('excludes the end date itself', () => {
    const nights = getNightsBetween(
      new Date('2026-12-01'),
      new Date('2026-12-04'),
    );
    expect(nights.map((d) => d.toISOString())).toEqual([
      '2026-12-01T00:00:00.000Z',
      '2026-12-02T00:00:00.000Z',
      '2026-12-03T00:00:00.000Z',
    ]);
  });

  it('returns exactly one night for a one-night stay', () => {
    const nights = getNightsBetween(
      new Date('2026-12-01'),
      new Date('2026-12-02'),
    );
    expect(nights).toHaveLength(1);
    expect(nights[0].toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('throws 400 when endDate equals startDate', () => {
    expect(() =>
      getNightsBetween(new Date('2026-12-01'), new Date('2026-12-01')),
    ).toThrow(BadRequestException);
  });

  it('throws 400 when endDate is before startDate', () => {
    expect(() =>
      getNightsBetween(new Date('2026-12-05'), new Date('2026-12-01')),
    ).toThrow(BadRequestException);
  });

  it('throws 400 when the range exceeds 366 nights (367 nights)', () => {
    const start = new Date('2026-01-01');
    const end = new Date(start.getTime() + 367 * 24 * 60 * 60 * 1000);
    expect(() => getNightsBetween(start, end)).toThrow(BadRequestException);
  });

  it('accepts exactly 366 nights', () => {
    const start = new Date('2026-01-01');
    const end = new Date(start.getTime() + 366 * 24 * 60 * 60 * 1000);
    const nights = getNightsBetween(start, end);
    expect(nights).toHaveLength(366);
  });

  it('MAX_RANGE_NIGHTS is 366', () => {
    expect(MAX_RANGE_NIGHTS).toBe(366);
  });

  it('is DST-safe across the 2026-03-29 EU spring-forward boundary (one UTC-midnight Date per night)', () => {
    const nights = getNightsBetween(
      new Date('2026-03-28'),
      new Date('2026-03-31'),
    );
    expect(nights.map((d) => d.toISOString())).toEqual([
      '2026-03-28T00:00:00.000Z',
      '2026-03-29T00:00:00.000Z',
      '2026-03-30T00:00:00.000Z',
    ]);
  });

  it('is DST-safe across the 2026-10-25 EU fall-back boundary (one UTC-midnight Date per night)', () => {
    const nights = getNightsBetween(
      new Date('2026-10-24'),
      new Date('2026-10-27'),
    );
    expect(nights.map((d) => d.toISOString())).toEqual([
      '2026-10-24T00:00:00.000Z',
      '2026-10-25T00:00:00.000Z',
      '2026-10-26T00:00:00.000Z',
    ]);
  });
});

describe('assertNotInPast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows a check-in of today (UTC)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    expect(() =>
      assertNotInPast(toUtcMidnight(new Date('2026-06-15T00:00:00Z'))),
    ).not.toThrow();
  });

  it('rejects a check-in of yesterday with 400', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    expect(() =>
      assertNotInPast(toUtcMidnight(new Date('2026-06-14T00:00:00Z'))),
    ).toThrow(BadRequestException);
  });
});
