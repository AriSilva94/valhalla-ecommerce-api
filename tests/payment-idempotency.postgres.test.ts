import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import orderSchema from '../src/api/order/content-types/order/schema.json';

const databaseUrl = process.env.PAYMENT_TEST_DATABASE_URL;
const schemaName = `payment_idempotency_${randomUUID().replaceAll('-', '')}`;
const tableName = `"${schemaName}"."orders"`;

// Contrato PostgreSQL mínimo derivado do schema; não inicializa Strapi nem testa o controller.
describe.skipIf(!databaseUrl)('payment idempotency PostgreSQL contract', () => {
  let admin: pg.Client;
  let schemaCreated = false;

  function createClient() {
    const url = new URL(databaseUrl!);
    // Exige destino local explícito e banco de teste, sem fallback para PG* ou .env.
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/payment_test' ||
      !url.port || !url.username || !url.password || url.search || url.hash
    ) {
      throw new Error('PAYMENT_TEST_DATABASE_URL must explicitly target a local payment_test database with port and credentials, without query parameters.');
    }
    return new pg.Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000,
      idle_in_transaction_session_timeout: 15_000,
    });
  }

  beforeAll(async () => {
    expect(orderSchema.attributes.checkoutIdempotencyScope).toMatchObject({
      type: 'string', unique: true,
    });
    expect(orderSchema.attributes.checkoutIdempotencyKey.type).toBe('string');
    expect(orderSchema.attributes.user).toMatchObject({
      type: 'relation', relation: 'manyToOne', target: 'plugin::users-permissions.user',
    });

    admin = createClient();
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schemaName}"`);
    schemaCreated = true;
    // Projeta apenas a coluna relevante; unique nullable corresponde ao atributo Strapi.
    await admin.query(`CREATE TABLE ${tableName} (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      checkout_idempotency_scope varchar(255),
      CONSTRAINT checkout_idempotency_scope_unique UNIQUE (checkout_idempotency_scope)
    )`);
  }, 15_000);

  afterAll(async () => {
    if (!admin) return;
    try {
      if (schemaCreated) await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    } finally {
      await admin.end();
    }
  });

  it('duas conexões com a mesma scope têm um vencedor e um erro 23505', async () => {
    const first = createClient();
    const second = createClient();
    const scope = `101:${randomUUID()}`;
    const insert = `INSERT INTO ${tableName} (checkout_idempotency_scope) VALUES ($1) RETURNING id`;
    try {
      await first.connect();
      await second.connect();
      const firstPid = (await first.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      expect(firstPid).not.toBe(secondPid);
      await first.query('BEGIN');
      const winner = await first.query(insert, [scope]);
      const contender = second.query(insert, [scope]).then(
        (result) => ({ result, error: undefined }),
        (error) => ({ result: undefined, error }),
      );

      // Observa contenção real no servidor antes de liberar a transação vencedora.
      const deadline = Date.now() + 5_000;
      let blocked = false;
      while (Date.now() < deadline) {
        const result = await admin.query(
          'SELECT $1::int = ANY(pg_blocking_pids($2::int)) AS blocked',
          [firstPid, secondPid],
        );
        if (result.rows[0].blocked) {
          blocked = true;
          break;
        }
        await delay(20);
      }
      expect(blocked).toBe(true);
      await first.query('COMMIT');
      const loser = await contender;
      expect(winner.rowCount).toBe(1);
      expect(loser.result).toBeUndefined();
      expect(loser.error).toMatchObject({
        code: '23505', schema: schemaName, table: 'orders',
        constraint: 'checkout_idempotency_scope_unique',
      });
      const persisted = await admin.query(
        `SELECT id FROM ${tableName} WHERE checkout_idempotency_scope = $1`, [scope],
      );
      expect(persisted.rows).toEqual(winner.rows);
    } finally {
      // Encerra primeiro o detentor do lock, inclusive quando uma asserção falha.
      try {
        await first.end();
      } finally {
        await second.end();
      }
    }
  }, 20_000);

  it('o mesmo UUID para usuários diferentes permite dois inserts concorrentes', async () => {
    const first = createClient();
    const second = createClient();
    const key = randomUUID();
    const scopes = [`201:${key}`, `202:${key}`];
    try {
      await first.connect();
      await second.connect();
      const insert = `INSERT INTO ${tableName} (checkout_idempotency_scope) VALUES ($1) RETURNING checkout_idempotency_scope`;
      const results = await Promise.allSettled([
        first.query(insert, [scopes[0]]),
        second.query(insert, [scopes[1]]),
      ]);
      for (const result of results) {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') expect(result.value.rowCount).toBe(1);
      }
      const persisted = await admin.query(
        `SELECT checkout_idempotency_scope FROM ${tableName} WHERE checkout_idempotency_scope = ANY($1::text[]) ORDER BY checkout_idempotency_scope`,
        [scopes],
      );
      expect(persisted.rows.map((row) => row.checkout_idempotency_scope)).toEqual(scopes);
    } finally {
      try {
        await first.end();
      } finally {
        await second.end();
      }
    }
  }, 15_000);
});
