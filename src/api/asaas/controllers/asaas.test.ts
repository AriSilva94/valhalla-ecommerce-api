import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/external/asaas.service', () => ({
  readAsaasConfigFromEnv: vi.fn(),
  testAsaasConnection: vi.fn(),
}));

vi.mock('../../../services/redis', () => ({
  getRedisConnection: vi.fn(),
}));

import controller from './asaas';
import { getRedisConnection } from '../../../services/redis';

const redis = vi.mocked(getRedisConnection);

function context(body: unknown) {
  return { request: { body }, status: 0, body: undefined } as any;
}

function setupStrapi(order: any = { id: 1, asaasPaymentId: null }) {
  const update = vi.fn().mockResolvedValue(order);
  (globalThis as any).strapi = {
    db: { query: vi.fn(() => ({ findOne: vi.fn().mockResolvedValue(order), update })) },
  };
  return { update };
}

describe('asaas webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redis.mockReturnValue(null);
  });

  it('processa o primeiro evento e ignora a repetição pelo payment id', async () => {
    const set = vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    redis.mockReturnValue({ set } as any);
    const { update } = setupStrapi();
    const payload = { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } };

    await controller.webhook(context(payload));
    await controller.webhook(context(payload));

    expect(set).toHaveBeenNthCalledWith(1, 'webhook:asaas:pay_1', '1', 'EX', 259200, 'NX');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('continua processando quando Redis está indisponível', async () => {
    const { update } = setupStrapi();

    await controller.webhook(context({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_2' } }));

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('fail-open quando Redis lança erro', async () => {
    redis.mockReturnValue({ set: vi.fn().mockRejectedValue(new Error('offline')) } as any);
    const { update } = setupStrapi();

    await controller.webhook(context({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_3' } }));

    expect(update).toHaveBeenCalledTimes(1);
  });
});
