import type { OrderStatus } from '../order/serialize-order';

export type PaymentWebhookEvent = {
  provider: string;
  externalEventId: string;
  externalReference: string | null;
  providerCheckoutId: string | null;
  providerPaymentId: string | null;
  status: Extract<OrderStatus, 'paid' | 'expired' | 'cancelled'>;
};

export function parseAsaasWebhook(value: unknown): PaymentWebhookEvent | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const payment = body.payment && typeof body.payment === 'object' ? body.payment as Record<string, unknown> : null;
  const event = typeof body.event === 'string' ? body.event : '';
  const status = event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED'
    ? 'paid'
    : event === 'PAYMENT_OVERDUE'
      ? 'expired'
      : event === 'PAYMENT_DELETED'
        ? 'cancelled'
        : null;
  const externalEventId = typeof body.id === 'string' ? body.id : '';
  const providerPaymentId = typeof payment?.id === 'string' ? payment.id : null;
  const externalReference = typeof payment?.externalReference === 'string' ? payment.externalReference : null;
  const providerCheckoutId = typeof payment?.checkoutSession === 'string' ? payment.checkoutSession : null;

  if (!status || !externalEventId || (!providerPaymentId && !externalReference && !providerCheckoutId)) return null;
  return { provider: 'asaas', externalEventId, externalReference, providerCheckoutId, providerPaymentId, status };
}
