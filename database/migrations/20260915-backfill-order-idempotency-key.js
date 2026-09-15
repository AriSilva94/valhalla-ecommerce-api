const { Client } = require('pg');

function databaseConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  return {
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT) || 5432,
    database: process.env.DATABASE_NAME || 'strapi',
    user: process.env.DATABASE_USERNAME || 'strapi',
    password: process.env.DATABASE_PASSWORD,
  };
}

async function main() {
  const client = new Client(databaseConfig());

  try {
    await client.connect();
    const table = await client.query("SELECT to_regclass('public.orders') AS name");
    if (!table.rows[0].name) {
      return;
    }

    await client.query('BEGIN');
    await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key varchar(255)');
    await client.query("UPDATE orders SET idempotency_key = 'legacy-' || id::text WHERE idempotency_key IS NULL");
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_unique ON orders (idempotency_key)'
    );
    await client.query('ALTER TABLE orders ALTER COLUMN idempotency_key SET NOT NULL');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Falha na migração de idempotência dos pedidos.');
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
