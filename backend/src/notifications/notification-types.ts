export const NotificationType = {
  BookingStateChanged: 'booking_state_changed',
  PaymentUpdate: 'payment_update',
  RefundUpdate: 'refund_update',
  FlightCancelled: 'flight_cancelled',
  AccountStatus: 'account_status',
  ProviderStatus: 'provider_status',
  ContentModeration: 'content_moderation',
  General: 'general',
} as const;
