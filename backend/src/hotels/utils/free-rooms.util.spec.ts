import { describe, expect, it } from 'vitest';
import { summarizeFreeRooms, type FreeRoom } from './free-rooms.util.js';

function room(
  maxAdults: number,
  maxChildren: number,
  pricePerNight: number,
): FreeRoom {
  return { maxAdults, maxChildren, pricePerNight };
}

// occupancy 2 (price 80), 3 (price 120), 4 (price 200)
function threeRooms(): FreeRoom[] {
  return [room(2, 0, 80), room(3, 0, 120), room(4, 0, 200)];
}

describe('summarizeFreeRooms (HTL-11)', () => {
  it('returns null when even the best room cannot fit the guests (5 guests, 1 room)', () => {
    expect(summarizeFreeRooms(threeRooms(), 5, 1)).toBeNull();
  });

  it('returns the cheapest price and the free room count when the best 2 rooms cover 5 guests', () => {
    expect(summarizeFreeRooms(threeRooms(), 5, 2)).toEqual({
      minPrice: 80,
      freeRooms: 3,
    });
  });

  it('is not null when the best 2 rooms exactly cover 7 guests', () => {
    expect(summarizeFreeRooms(threeRooms(), 7, 2)).not.toBeNull();
  });

  it('returns null when 8 guests exceed the best 2 rooms capacity of 7', () => {
    expect(summarizeFreeRooms(threeRooms(), 8, 2)).toBeNull();
  });

  it('is not null when 1 room of capacity 4 covers 4 guests', () => {
    expect(summarizeFreeRooms(threeRooms(), 4, 1)).not.toBeNull();
  });

  it('returns null when fewer free rooms exist than requested (1 guest, 4 rooms)', () => {
    expect(summarizeFreeRooms(threeRooms(), 1, 4)).toBeNull();
  });

  it('returns null for an empty room list', () => {
    expect(summarizeFreeRooms([], 1, 1)).toBeNull();
  });

  it('does not mutate the input array', () => {
    const rooms = threeRooms();
    const before = rooms.map((r) => ({ ...r }));
    summarizeFreeRooms(rooms, 5, 2);
    expect(rooms).toEqual(before);
  });

  it('takes minPrice from the cheapest of ALL rooms, even when it is not one of the highest-capacity rooms', () => {
    const rooms = [
      room(1, 0, 10), // cheapest, but too small to be picked for the capacity check
      room(5, 0, 300),
      room(5, 0, 300),
    ];
    expect(summarizeFreeRooms(rooms, 5, 2)).toEqual({
      minPrice: 10,
      freeRooms: 3,
    });
  });
});
