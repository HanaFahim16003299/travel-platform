export interface FreeRoom {
  maxAdults: number;
  maxChildren: number;
  pricePerNight: number;
}

export function summarizeFreeRooms(
  rooms: FreeRoom[], // the free rooms of ONE hotel
  guests: number, // total guests in the search
  roomCount: number, // how many rooms the user wants
): { minPrice: number; freeRooms: number } | null {
  // 1) not enough free rooms -> return null
  if (rooms.length < roomCount) return null;

  // 2) the roomCount rooms that hold the most people must cover all guests
  const bestCapacity = rooms
    .map((room) => room.maxAdults + room.maxChildren)
    .sort((a, b) => b - a)
    .slice(0, roomCount)
    .reduce((sum, capacity) => sum + capacity, 0);
  if (bestCapacity < guests) return null;

  // 3) cheapest room among ALL the free rooms
  return {
    minPrice: Math.min(...rooms.map((room) => room.pricePerNight)),
    freeRooms: rooms.length,
  };
}
