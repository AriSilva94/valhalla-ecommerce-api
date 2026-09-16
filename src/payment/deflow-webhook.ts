import { createHmac, timingSafeEqual } from 'crypto';
import type { PaymentWebhookEvent } from './webhook-events';

export function verifyDeflowSignature(rawBody: string, signature: string | undefined, secret: string, now = Date.now()): boolean {
  if (!signature) return false;
  const parts = Object.fromEntries(signature.split(',').map((part) => part.trim().split('=')));
  const timestamp = Number(parts.t);
  const received = parts.v1;
  if (!Number.isFinite(timestamp) || !received || Math.abs(now / 1000 - timestamp) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(received, 'hex');
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function parseDeflowWebhook(value: unknown): PaymentWebhookEvent | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : null;
  const externalEventId = typeof body.id === 'string' ? body.id : '';
  const depositId = typeof data?.id === 'string' ? data.id : '';
  const event = body.event;
  const status = event === 'deposit.completed' ? 'paid' : event === 'deposit.expired' ? 'expired' : null;
  if (!externalEventId || !depositId || !status) return null;
  return { provider: 'deflow', externalEventId, externalReference: null, providerCheckoutId: depositId, providerPaymentId: depositId, status };
}
