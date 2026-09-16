import type { OrderItem } from './pricing';

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed';

export type OrderRecord = {
  id: number;
  reference: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  paymentProvider?: string | null;
  providerPaymentId?: string | null;
  providerCheckoutId?: string | null;
  paymentUrl?: string | null;
  checkoutIdempotencyFingerprint?: string | null;
  checkoutIdempotencyScope?: string | null;
  checkoutProcessingStatus?: 'processing' | 'completed' | 'failed' | 'reconciliation_required' | null;
  checkoutProcessingLeaseUntil?: string | null;
  checkoutProcessingError?: string | null;
  createdAt: string;
};

export type SerializedOrder = {
  reference: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  checkoutUrl: string | null;
  createdAt: string;
};

export function serializeOrder(order: OrderRecord): SerializedOrder {
  return {
    reference: order.reference,
    items: order.items,
    totalAmount: order.totalAmount,
    status: order.status,
    checkoutUrl: order.paymentUrl ?? null,
    createdAt: order.createdAt,
  };
}
