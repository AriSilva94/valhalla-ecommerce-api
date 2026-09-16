import { describe, expect, it, vi } from 'vitest';
import controller from './asaas';

function context(body: unknown) {
  return { request: { body, header: {} }, status: 0, body: undefined } as any;
}

describe('asaas webhook', () => {
  it('persiste o evento uma única vez e não permite regredir pedido pago', async () => {
    const eventCreate = vi.fn().mockResolvedValue({ id: 1 });
    const orderUpdate = vi.fn().mockResolvedValue({ id: 9 });
    (globalThis as any).strapi = {
      db: { query: (uid: string) => uid.includes('webhook-event')
        ? { create: eventCreate }
        : { findOne: vi.fn().mockResolvedValue({ id: 9, status: 'paid', providerPaymentId: 'pay-1' }), update: orderUpdate } },
    };

    const ctx = context({ id: 'evt-1', event: 'PAYMENT_OVERDUE', payment: { id: 'pay-1' } });
    await controller.webhook(ctx);

    expect(eventCreate).toHaveBeenCalledOnce();
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 9, status: { $ne: 'paid' } } }));
    expect(ctx.body).toEqual({ ok: true });
  });

  it('torna redelivery inofensivo quando o evento já existe', async () => {
    const eventCreate = vi.fn().mockRejectedValue({ code: '23505' });
    const orderFind = vi.fn();
    (globalThis as any).strapi = { db: { query: (uid: string) => uid.includes('webhook-event') ? { create: eventCreate } : { findOne: orderFind } } };

    const ctx = context({ id: 'evt-1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay-1' } });
    await controller.webhook(ctx);

    expect(orderFind).not.toHaveBeenCalled();
    expect(ctx.body).toEqual({ ok: true });
  });
});
