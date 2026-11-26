import { randomBytes } from 'node:crypto';

// 32 chars, no 0/O/1/I, matching the pattern used by flight-bookings.
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERENCE_LENGTH = 6;

/** A 6-character booking reference drawn from an alphabet with no ambiguous characters. */
export function generateBookingReference(): string {
  return Array.from(
    randomBytes(REFERENCE_LENGTH),
    (b) => REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length],
  ).join('');
}
