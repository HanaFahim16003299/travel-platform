import { describe, expect, it } from 'vitest';
import { referenceObjectId } from './reference-ids.js';

describe('referenceObjectId', () => {
  it('gives the same id for the same record every time', () => {
    expect(referenceObjectId('airport', 'CAI').toHexString()).toBe(
      referenceObjectId('airport', 'CAI').toHexString(),
    );
  });

  it('gives different ids to different records and to different kinds', () => {
    const ids = new Set([
      referenceObjectId('airport', 'CAI').toHexString(),
      referenceObjectId('airport', 'DXB').toHexString(),
      referenceObjectId('city', 'cairo').toHexString(),
      referenceObjectId('country', 'EG').toHexString(),
      referenceObjectId('attraction', 'att-1').toHexString(),
    ]);
    expect(ids.size).toBe(5);
  });

  it('produces a valid 24-character hex ObjectId', () => {
    expect(referenceObjectId('city', 'new_york').toHexString()).toMatch(/^[0-9a-f]{24}$/);
  });
});
