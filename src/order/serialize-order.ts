import type { OrderItem } from './pricing';

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed';

export type OrderRecord = {
  id: number;
  reference: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  asaasPaymentId?: string | null;
  asaasCheckoutId?: string | null;
  asaasInvoiceUrl?: string | null;
  checkoutRecoveryStatus?: 'cancel_pending' | null;
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
    checkoutUrl: order.asaasInvoiceUrl ?? null,
    createdAt: order.createdAt,
  };
}
