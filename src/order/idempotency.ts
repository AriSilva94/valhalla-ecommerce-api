import { randomUUID } from 'crypto';

export type RedisConnection = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', duration: number, condition?: 'NX'): Promise<'OK' | null>;
  eval(script: string, numberOfKeys: number, ...args: string[]): Promise<unknown>;
};

export type IdempotencyReservation =
  | { status: 'reserved'; owner: string }
  | { status: 'in-progress' }
  | { status: 'unavailable' };

const LOCK_TTL_SECONDS = 60;
const RESULT_TTL_SECONDS = 86_400;

const RELEASE_IF_OWNER_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;

function keyPrefix(userId: number, idempotencyKey: string): string {
  return `checkout:idempotency:${userId}:${idempotencyKey}`;
}

function lockKey(userId: number, idempotencyKey: string): string {
  return `${keyPrefix(userId, idempotencyKey)}:lock`;
}

function resultKey(userId: number, idempotencyKey: string): string {
  return `${keyPrefix(userId, idempotencyKey)}:result`;
}

export async function reserveIdempotency(
  redis: RedisConnection | null,
  userId: number,
  idempotencyKey: string
): Promise<IdempotencyReservation> {
  if (!redis) {
    return { status: 'unavailable' };
  }

  const owner = randomUUID();

  try {
    const result = await redis.set(lockKey(userId, idempotencyKey), owner, 'EX', LOCK_TTL_SECONDS, 'NX');
    return result === 'OK' ? { status: 'reserved', owner } : { status: 'in-progress' };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function getIdempotencyResult<T>(
  redis: RedisConnection | null,
  userId: number,
  idempotencyKey: string
): Promise<T | null> {
  if (!redis) {
    return null;
  }

  try {
    const result = await redis.get(resultKey(userId, idempotencyKey));
    return result ? (JSON.parse(result) as T) : null;
  } catch {
    return null;
  }
}

export async function saveIdempotencyResult(
  redis: RedisConnection | null,
  userId: number,
  idempotencyKey: string,
  response: unknown
): Promise<boolean> {
  if (!redis) {
    return false;
  }

  try {
    await redis.set(resultKey(userId, idempotencyKey), JSON.stringify(response), 'EX', RESULT_TTL_SECONDS);
    return true;
  } catch {
    return false;
  }
}

export async function releaseIdempotency(
  redis: RedisConnection | null,
  userId: number,
  idempotencyKey: string,
  owner: string
): Promise<boolean> {
  if (!redis) {
    return false;
  }

  try {
    await redis.eval(RELEASE_IF_OWNER_SCRIPT, 1, lockKey(userId, idempotencyKey), owner);
    return true;
  } catch {
    return false;
  }
}
