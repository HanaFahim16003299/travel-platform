import { describe, expect, it } from 'vitest';
import { referenceObjectId } from './reference-ids.js';

// Tests written by Mohamed Hesham for GEN-12 (reference data seeding).
describe('referenceObjectId', () => {
  it('gives the same id for the same record every time', () => {
    expect(referenceObjectId('city', 'cairo').toHexString()).toBe(
      referenceObjectId('city', 'cairo').toHexString(),
    );
  });

  it('gives different ids to different records', () => {
    expect(
      referenceObjectId('city', 'cairo').equals(
        referenceObjectId('city', 'dubai'),
      ),
    ).toBe(false);
  });

  it('gives different ids to records of different kinds with the same key', () => {
    expect(
      referenceObjectId('city', 'paris').equals(
        referenceObjectId('airport', 'paris'),
      ),
    ).toBe(false);
  });
});
