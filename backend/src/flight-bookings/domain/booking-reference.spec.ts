// Tests for the booking reference generator (FLT-23). Added by Joumana Hozayen.
import { describe, expect, it } from 'vitest';
import { generateBookingReference, REF_ALPHABET } from './booking-reference.js';

describe('generateBookingReference', () => {
  it('returns 6 characters from the unambiguous alphabet', () => {
    const ref = generateBookingReference();
    expect(ref).toHaveLength(6);
    for (const ch of ref) expect(REF_ALPHABET).toContain(ch);
  });

  it('maps random bytes onto the alphabet', () => {
    expect(
      generateBookingReference(() => new Uint8Array([0, 1, 31, 32, 33, 255])),
    ).toBe('AB9AB9');
  });
});
