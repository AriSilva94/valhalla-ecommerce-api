import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = vi.hoisted(() => {
  const connection = { on: vi.fn() };
  const constructor = vi.fn(function RedisConstructor() {
    return connection;
  });
  return { connection, constructor };
});

vi.mock('ioredis', () => ({ default: redisMock.constructor }));

describe('Redis connection', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('não cria conexão quando REDIS_URL não está configurada', async () => {
    const { getRedisConnection } = await import('./redis');

    expect(getRedisConnection()).toBeNull();
    expect(redisMock.constructor).not.toHaveBeenCalled();
  });

  it('cria uma única conexão auxiliar e preguiçosa', async () => {
    process.env.REDIS_URL = 'redis://redis:6379';
    const { getRedisConnection } = await import('./redis');

    const first = getRedisConnection();
    const second = getRedisConnection();

    expect(first).toBe(redisMock.connection);
    expect(second).toBe(first);
    expect(redisMock.constructor).toHaveBeenCalledTimes(1);
    expect(redisMock.constructor).toHaveBeenCalledWith(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: expect.any(Function),
    });
    expect(redisMock.constructor.mock.calls[0][1].retryStrategy()).toBeNull();
  });
});
