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

  const connection = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  connection.on('error', logRedisUnavailable);
  connection.on('end', () => {
    if (redisConnection === connection) {
      redisConnection = undefined;
    }
  });
  redisConnection = connection;

  return redisConnection;
}
