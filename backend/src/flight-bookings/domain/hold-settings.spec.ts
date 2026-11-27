// Tests for the hold length setting (FLT-22, review C5). Added by Joumana Hozayen.
import { describe, expect, it } from 'vitest';
import { DEFAULT_HOLD_MINUTES, parseHoldMinutes } from './hold-settings.js';

describe('parseHoldMinutes', () => {
  it('defaults to 10 minutes when not set', () => {
    expect(parseHoldMinutes(undefined)).toBe(DEFAULT_HOLD_MINUTES);
    expect(parseHoldMinutes('  ')).toBe(10);
  });

  it('accepts a positive whole number', () => {
    expect(parseHoldMinutes('15')).toBe(15);
    expect(parseHoldMinutes(' 1 ')).toBe(1);
  });

  it.each(['abc', '0', '-5', '2.5', '10min'])(
    'rejects %s instead of returning NaN',
    (raw) => {
      expect(() => parseHoldMinutes(raw)).toThrow(
        'FLIGHT_HOLD_MINUTES must be a positive whole number',
      );
    },
  );
});
