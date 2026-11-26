// Reduced views of a flight booking for people who are not its owner (FLT-29, ACC-11).
// Passport/ID numbers, dates of birth, emails and phones are never included.
// Added by Joumana Hozayen (review items A4 and C3).
import type { Types } from 'mongoose';

interface ViewablePassenger {
  firstName: string;
  lastName: string;
  type: string;
  ticketNumber?: string;
}

interface ViewableSegment {
  flightId: Types.ObjectId;
  flightNumber: string;
  cabinClass: string;
  departureAt: Date;
  arrivalAt: Date;
}

export interface ViewableBooking {
  _id: Types.ObjectId;
  bookingReference?: string;
  status: string;
  seatCount: number;
  passengers: ViewablePassenger[];
  segments: ViewableSegment[];
}

const passengerNames = (passengers: ViewablePassenger[]) =>
  passengers.map((p) => ({
    firstName: p.firstName,
    lastName: p.lastName,
    type: p.type,
    ticketNumber: p.ticketNumber,
  }));

/** FLT-29: what an airline moderator sees for one booking on one of their flights. */
export function toModeratorBookingView(
  booking: ViewableBooking,
  flightId: string,
) {
  const segment =
    booking.segments.find((s) => String(s.flightId) === flightId) ??
    booking.segments[0];
  return {
    id: String(booking._id),
    bookingReference: booking.bookingReference ?? null,
    status: booking.status,
    cabin: segment?.cabinClass ?? null,
    seats: booking.seatCount,
    passengers: passengerNames(booking.passengers),
  };
}

/** C3: what an admin or the airline's moderator sees in GET /flight-bookings/:id. */
export function toRestrictedBookingView(booking: ViewableBooking) {
  return {
    id: String(booking._id),
    bookingReference: booking.bookingReference ?? null,
    status: booking.status,
    seats: booking.seatCount,
    segments: booking.segments.map((s) => ({
      flightId: String(s.flightId),
      flightNumber: s.flightNumber,
      cabin: s.cabinClass,
      departureAt: s.departureAt,
      arrivalAt: s.arrivalAt,
    })),
    passengers: passengerNames(booking.passengers),
  };
}

/** One CSV row per passenger for the FLT-29 passenger export. */
export const PASSENGER_EXPORT_COLUMNS = [
  'bookingReference',
  'status',
  'cabin',
  'seats',
  'firstName',
  'lastName',
  'type',
  'ticketNumber',
] as const;

export function toPassengerExportRows(
  booking: ViewableBooking,
  flightId: string,
) {
  const view = toModeratorBookingView(booking, flightId);
  return view.passengers.map((p) => ({
    bookingReference: view.bookingReference ?? '',
    status: view.status,
    cabin: view.cabin ?? '',
    seats: String(view.seats),
    firstName: p.firstName,
    lastName: p.lastName,
    type: p.type,
    ticketNumber: p.ticketNumber ?? '',
  }));
}
