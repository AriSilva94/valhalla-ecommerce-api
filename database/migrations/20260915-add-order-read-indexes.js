const { Client } = require('pg');

function databaseConfig() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL };
  return { host: process.env.DATABASE_HOST || 'localhost', port: Number(process.env.DATABASE_PORT) || 5432, database: process.env.DATABASE_NAME || 'strapi', user: process.env.DATABASE_USERNAME || 'strapi', password: process.env.DATABASE_PASSWORD };
}

async function main() {
  const client = new Client(databaseConfig());
  try {
    await client.connect();
    const table = await client.query("SELECT to_regclass('public.orders') AS name");
    if (!table.rows[0].name) return;
    await client.query('CREATE INDEX IF NOT EXISTS orders_user_created_at_idx ON orders (user_id, created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS orders_asaas_payment_id_idx ON orders (asaas_payment_id)');
    await client.query('CREATE INDEX IF NOT EXISTS orders_asaas_checkout_id_idx ON orders (asaas_checkout_id)');
  } catch {
    console.error('Falha na migração dos índices de leitura dos pedidos.');
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
