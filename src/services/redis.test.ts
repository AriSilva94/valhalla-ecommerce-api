import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = vi.hoisted(() => {
  const connections: Array<{ on: ReturnType<typeof vi.fn>; listeners: Map<string, () => void> }> = [];
  const constructor = vi.fn(function RedisConstructor() {
    const listeners = new Map<string, () => void>();
    const connection = {
      on: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
      listeners,
    };
    connections.push(connection);
    return connection;
  });
  return { connections, constructor };
});

vi.mock('ioredis', () => ({ default: redisMock.constructor }));

describe('Redis connection', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    redisMock.connections.splice(0);
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

    expect(first).toBe(redisMock.connections[0]);
    expect(second).toBe(first);
    expect(redisMock.constructor).toHaveBeenCalledTimes(1);
    expect(redisMock.constructor).toHaveBeenCalledWith(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: expect.any(Function),
    });
    expect(redisMock.constructor.mock.calls[0][1].retryStrategy()).toBeNull();
  });

  it('recria a conexão depois que o Redis encerra a anterior', async () => {
    process.env.REDIS_URL = 'redis://redis:6379';
    const { getRedisConnection } = await import('./redis');

    const first = getRedisConnection();
    redisMock.connections[0].listeners.get('end')?.();
    const second = getRedisConnection();

    expect(second).not.toBe(first);
    expect(redisMock.constructor).toHaveBeenCalledTimes(2);
  });
});
