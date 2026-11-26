export enum BookingType {
  Flight = 'flight',
  Hotel = 'hotel',
}

export enum PaymentStatus {
  Pending = 'Pending',
  Processing = 'Processing',
  Succeeded = 'Succeeded',
  Failed = 'Failed',
  Cancelled = 'Cancelled',
  Refunded = 'Refunded',
  PartiallyRefunded = 'PartiallyRefunded',
}

export enum RefundStatus {
  Pending = 'Pending',
  Succeeded = 'Succeeded',
  Failed = 'Failed',
}
