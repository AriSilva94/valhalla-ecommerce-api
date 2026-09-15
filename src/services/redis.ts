import Redis from 'ioredis';

let redisConnection: Redis | null | undefined;

function logRedisUnavailable(): void {
  console.warn('Redis indisponível; seguindo sem cache de idempotência.');
}

export function getRedisConnection(): Redis | null {
  if (redisConnection !== undefined) {
    return redisConnection;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    redisConnection = null;
    return redisConnection;
  }

  redisConnection = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  redisConnection.on('error', logRedisUnavailable);

  return redisConnection;
}
