import type { OrderItem } from './pricing';

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed';

export type OrderRecord = {
  id: number;
  reference: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  asaasPaymentId?: string | null;
  asaasInvoiceUrl?: string | null;
  pixQrCodeImage?: string | null;
  pixCopyPaste?: string | null;
  pixExpiration?: string | null;
  createdAt: string;
};

export type SerializedOrder = {
  reference: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  asaasInvoiceUrl: string | null;
  pixQrCodeImage: string | null;
  pixCopyPaste: string | null;
  pixExpiration: string | null;
  createdAt: string;
};

// The client never sees the row's numeric `id` — it's sequential across
// every order in the database, so exposing it (even scoped to "your own
// orders") would let any customer infer the store's total order volume
// from the gaps between their own order numbers. `reference` is an opaque,
// randomly generated public identifier instead (see order controller).
export function serializeOrder(order: OrderRecord): SerializedOrder {
  return {
    reference: order.reference,
    items: order.items,
    totalAmount: order.totalAmount,
    status: order.status,
    asaasInvoiceUrl: order.asaasInvoiceUrl ?? null,
    pixQrCodeImage: order.pixQrCodeImage ?? null,
    pixCopyPaste: order.pixCopyPaste ?? null,
    pixExpiration: order.pixExpiration ?? null,
    createdAt: order.createdAt,
  };
}
