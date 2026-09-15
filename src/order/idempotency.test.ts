import { describe, expect, it } from 'vitest';

import {
  getIdempotencyResult,
  releaseIdempotency,
  reserveIdempotency,
  saveIdempotencyResult,
  type RedisConnection,
} from './idempotency';

class FakeRedis implements RedisConnection {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, ...args: Array<string | number>): Promise<'OK' | null> {
    if (args.includes('NX') && this.values.has(key)) {
      return null;
    }

    this.values.set(key, value);
    return 'OK';
  }

  async eval(_script: string, _numberOfKeys: number, key: string, owner: string): Promise<number> {
    if (this.values.get(key) !== owner) {
      return 0;
    }

    this.values.delete(key);
    return 1;
  }
}

describe('idempotency', () => {
  const userId = 42;
  const key = 'fe5a0dc7-d204-4ab8-8e39-74191ee7b4f0';

  it('reserva uma chave livre e bloqueia uma reserva concorrente', async () => {
    const redis = new FakeRedis();

    const first = await reserveIdempotency(redis, userId, key);
    const second = await reserveIdempotency(redis, userId, key);

    expect(first.status).toBe('reserved');
    expect(second).toEqual({ status: 'in-progress' });
  });

  it('devolve o resultado serializado que foi salvo para a mesma chave', async () => {
    const redis = new FakeRedis();
    const response = { ok: true, data: { reference: 'abc123def4', checkoutUrl: 'https://asaas.test/chk_1' } };

    await saveIdempotencyResult(redis, userId, key, response);

    await expect(getIdempotencyResult<typeof response>(redis, userId, key)).resolves.toEqual(response);
  });

  it('libera a reserva somente quando o proprietário é o mesmo', async () => {
    const redis = new FakeRedis();
    const reservation = await reserveIdempotency(redis, userId, key);
    if (reservation.status !== 'reserved') {
      throw new Error('A reserva deveria ter sido adquirida');
    }

    await releaseIdempotency(redis, userId, key, 'outro-proprietario');
    expect(await reserveIdempotency(redis, userId, key)).toEqual({ status: 'in-progress' });

    await releaseIdempotency(redis, userId, key, reservation.owner);
    expect((await reserveIdempotency(redis, userId, key)).status).toBe('reserved');
  });

  it('falha em aberto quando o Redis não está disponível', async () => {
    const unavailableRedis: RedisConnection = {
      get: async () => {
        throw new Error('connection refused');
      },
      set: async () => {
        throw new Error('connection refused');
      },
      eval: async () => {
        throw new Error('connection refused');
      },
    };

    await expect(reserveIdempotency(unavailableRedis, userId, key)).resolves.toEqual({ status: 'unavailable' });
    await expect(getIdempotencyResult(unavailableRedis, userId, key)).resolves.toBeNull();
    await expect(saveIdempotencyResult(unavailableRedis, userId, key, { ok: true })).resolves.toBe(false);
    await expect(releaseIdempotency(unavailableRedis, userId, key, 'owner')).resolves.toBe(false);
  });
});
