// FLT-22 hold length setting, validated once at startup (review C5). Added by Joumana Hozayen.

export const DEFAULT_HOLD_MINUTES = 10;

/**
 * Reads FLIGHT_HOLD_MINUTES. Empty or missing gives the default (10). Anything that is
 * not a positive whole number stops the app at startup with a clear message, instead
 * of silently becoming NaN and breaking every hold.
 */
export function parseHoldMinutes(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_HOLD_MINUTES;
  const value = raw.trim();
  if (!/^\d+$/.test(value) || Number(value) <= 0)
    throw new Error(
      `FLIGHT_HOLD_MINUTES must be a positive whole number of minutes (got "${raw}")`,
    );
  return Number(value);
}
