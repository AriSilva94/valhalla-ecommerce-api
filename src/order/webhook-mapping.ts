import type { OrderStatus } from './serialize-order';

export function mapAsaasEventToOrderStatus(event: string): OrderStatus | null {
  switch (event) {
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_CONFIRMED':
      return 'paid';
    case 'PAYMENT_OVERDUE':
      return 'expired';
    case 'PAYMENT_DELETED':
      return 'cancelled';
    default:
      return null;
  }
}
