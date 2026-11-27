// Booking reference generator (FLT-23). Pure function, no `this`.
// Added by Joumana Hozayen.
import { randomBytes } from 'node:crypto';

/** 32 characters (no 0/O/1/I), so every random byte maps evenly onto the alphabet. */
export const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateBookingReference(
  random: (size: number) => Uint8Array = randomBytes,
): string {
  return Array.from(
    random(6),
    (b) => REF_ALPHABET[b % REF_ALPHABET.length],
  ).join('');
}
