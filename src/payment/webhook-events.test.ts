import { describe, expect, it } from 'vitest';
import { parseAsaasWebhook } from './webhook-events';

describe('parseAsaasWebhook', () => {
  it('normaliza evento válido sem expor payload do provedor ao domínio', () => {
    expect(parseAsaasWebhook({ id: 'evt-1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay-1', externalReference: 'order-1' } }))
      .toEqual({ provider: 'asaas', externalEventId: 'evt-1', externalReference: 'order-1', providerCheckoutId: null, providerPaymentId: 'pay-1', status: 'paid' });
  });

  it('ignora evento desconhecido, sem identificador ou payload inválido', () => {
    expect(parseAsaasWebhook({ id: 'evt-1', event: 'UNKNOWN', payment: { id: 'pay-1' } })).toBeNull();
    expect(parseAsaasWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay-1' } })).toBeNull();
    expect(parseAsaasWebhook(null)).toBeNull();
  });
});
