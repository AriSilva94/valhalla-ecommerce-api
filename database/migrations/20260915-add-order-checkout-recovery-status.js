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

    await client.query(
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_recovery_status varchar(32) CHECK (checkout_recovery_status IN ('cancel_pending'))"
    );
  } catch {
    console.error('Falha na migração de recuperação de checkout dos pedidos.');
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
