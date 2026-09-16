import type { OrderItem } from './pricing';

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed';

export type OrderRecord = {
  id: number;
  reference: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  paymentProvider?: string | null;
  checkoutIdempotencyKey?: string | null;
  providerPaymentId?: string | null;
  providerCheckoutId?: string | null;
  paymentUrl?: string | null;
  paymentPixCopyPaste?: string | null;
  paymentPixQrCodeUrl?: string | null;
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
  pixCopyPaste: string | null;
  pixQrCodeUrl: string | null;
  createdAt: string;
};

export function serializeOrder(order: OrderRecord): SerializedOrder {
  return {
    reference: order.reference,
    items: order.items,
    totalAmount: order.totalAmount,
    status: order.status,
    checkoutUrl: order.paymentUrl ?? null,
    pixCopyPaste: order.paymentPixCopyPaste ?? null,
    pixQrCodeUrl: order.paymentPixQrCodeUrl ?? null,
    createdAt: order.createdAt,
  };
}
