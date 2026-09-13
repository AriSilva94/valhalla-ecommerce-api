import { describe, expect, it } from 'vitest';
import { mapAsaasEventToOrderStatus } from './webhook-mapping';

describe('mapAsaasEventToOrderStatus', () => {
  it('mapeia PAYMENT_RECEIVED e PAYMENT_CONFIRMED para paid', () => {
    expect(mapAsaasEventToOrderStatus('PAYMENT_RECEIVED')).toBe('paid');
    expect(mapAsaasEventToOrderStatus('PAYMENT_CONFIRMED')).toBe('paid');
  });

  it('mapeia PAYMENT_OVERDUE para expired', () => {
    expect(mapAsaasEventToOrderStatus('PAYMENT_OVERDUE')).toBe('expired');
  });

  it('mapeia PAYMENT_DELETED para cancelled', () => {
    expect(mapAsaasEventToOrderStatus('PAYMENT_DELETED')).toBe('cancelled');
  });

  it('retorna null para evento desconhecido', () => {
    expect(mapAsaasEventToOrderStatus('PAYMENT_UPDATED')).toBeNull();
    expect(mapAsaasEventToOrderStatus('')).toBeNull();
  });
});
