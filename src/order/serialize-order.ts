import type { OrderItem } from './pricing';

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed';

export type OrderRecord = {
  id: number;
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
  id: number;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  asaasInvoiceUrl: string | null;
  pixQrCodeImage: string | null;
  pixCopyPaste: string | null;
  pixExpiration: string | null;
  createdAt: string;
};

export function serializeOrder(order: OrderRecord): SerializedOrder {
  return {
    id: order.id,
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
