export enum FlightBookingStatus {
  DRAFT = 'DRAFT',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum PassengerType {
  ADULT = 'ADULT',
  CHILD = 'CHILD',
  INFANT = 'INFANT',
}

/** PAY-03: state of the refund of a cancelled booking (review B3, Joumana Hozayen). */
export enum RefundStatus {
  PENDING = 'PENDING',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}
