'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Client } = require('pg');

function parseArgs(argv) {
  const args = {
    database: null,
    dryRun: true,
    envFile: null,
    yes: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--yes') {
      args.yes = true;
      args.dryRun = false;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--env-file') {
      args.envFile = argv[++i];
    } else if (arg === '--database') {
      args.database = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function loadEnvFile(filePath) {
  if (!filePath) return;

  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Env file not found: ${resolved}`);
  }

  const content = fs.readFileSync(resolved, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equals = trimmed.indexOf('=');
    if (equals === -1) continue;

    const key = trimmed.slice(0, equals).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function requireEnv(keys) {
  const missing = keys.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }
}

function rewriteMediaUrl(url, targetBaseUrl) {
  if (typeof url !== 'string') return url;

  const base = targetBaseUrl.replace(/\/+$/, '');
  return url
    .replace(/^https:\/\/pub-[^/]+\.r2\.dev\/uploads-dev\//, `${base}/assets/images/`)
    .replace(/^https:\/\/pub-[^/]+\.r2\.dev\/uploads\//, `${base}/assets/images/`)
    .replace(
      /^https:\/\/cdn-dev\.valhallatecnologia\.com\.br\/assets\/images\//,
      `${base}/assets/images/`
    )
    .replace(
      /^https:\/\/cdn\.valhallatecnologia\.com\.br\/assets\/images\//,
      `${base}/assets/images/`
    );
}

function parseFormats(value) {
  if (!value) return value;
  if (typeof value === 'object') return value;
  return JSON.parse(value);
}

function serializeFormats(value, originalValue) {
  if (!value) return value;
  if (typeof originalValue === 'string') return JSON.stringify(value);
  return value;
}

function rewriteFormats(formats, targetBaseUrl) {
  if (!formats || typeof formats !== 'object') return formats;

  let changed = false;
  const nextFormats = {};

  for (const [key, value] of Object.entries(formats)) {
    if (!value || typeof value !== 'object') {
      nextFormats[key] = value;
      continue;
    }

    const nextValue = { ...value };
    const nextUrl = rewriteMediaUrl(nextValue.url, targetBaseUrl);
    if (nextUrl !== nextValue.url) {
      nextValue.url = nextUrl;
      changed = true;
    }
    nextFormats[key] = nextValue;
  }

  return changed ? nextFormats : formats;
}

function rewriteFileRecord(file, targetBaseUrl) {
  const patch = {};

  const nextUrl = rewriteMediaUrl(file.url, targetBaseUrl);
  if (nextUrl !== file.url) patch.url = nextUrl;

  const originalFormats = file.formats;
  const parsedFormats = parseFormats(originalFormats);
  const nextFormats = rewriteFormats(parsedFormats, targetBaseUrl);
  if (nextFormats !== parsedFormats) {
    patch.formats = serializeFormats(nextFormats, originalFormats);
  }

  return {
    changed: Object.keys(patch).length > 0,
    patch,
  };
}

function sqlitePath(args) {
  if (args.database) return path.resolve(process.cwd(), args.database);
  return path.resolve(process.cwd(), process.env.DATABASE_FILENAME || '.tmp/data.db');
}

async function rewriteSqlite(args, targetBaseUrl) {
  const dbPath = sqlitePath(args);
  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite database not found: ${dbPath}`);
  }

  const db = new Database(dbPath);
  const files = db.prepare('select id, name, url, formats from files order by id').all();
  const update = db.prepare('update files set url = ?, formats = ?, updated_at = datetime(\'now\') where id = ?');
  let changed = 0;

  const tx = db.transaction(() => {
    for (const file of files) {
      const result = rewriteFileRecord(file, targetBaseUrl);
      if (!result.changed) continue;

      changed += 1;
      console.log(`${args.dryRun ? 'would update' : 'update'} ${file.id} ${file.name}`);
      if (result.patch.url) console.log(`  url -> ${result.patch.url}`);

      if (!args.dryRun) {
        update.run(result.patch.url || file.url, result.patch.formats || file.formats, file.id);
      }
    }
  });

  tx();
  return { changed, files: files.length };
}

function pgSsl() {
  return String(process.env.DATABASE_SSL || '').toLowerCase() === 'true'
    ? { rejectUnauthorized: String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || 'true') !== 'false' }
    : false;
}

async function rewritePostgres(args, targetBaseUrl) {
  requireEnv(['DATABASE_HOST', 'DATABASE_PORT', 'DATABASE_NAME', 'DATABASE_USERNAME', 'DATABASE_PASSWORD']);

  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    ssl: pgSsl(),
  });

  await client.connect();
  try {
    const result = await client.query('select id, name, url, formats from files order by id');
    let changed = 0;

    for (const file of result.rows) {
      const rewrite = rewriteFileRecord(file, targetBaseUrl);
      if (!rewrite.changed) continue;

      changed += 1;
      console.log(`${args.dryRun ? 'would update' : 'update'} ${file.id} ${file.name}`);
      if (rewrite.patch.url) console.log(`  url -> ${rewrite.patch.url}`);

      if (!args.dryRun) {
        await client.query(
          'update files set url = $1, formats = $2, updated_at = now() where id = $3',
          [rewrite.patch.url || file.url, rewrite.patch.formats || file.formats, file.id]
        );
      }
    }

    return { changed, files: result.rows.length };
  } finally {
    await client.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.envFile);
  requireEnv(['TARGET_CDN_URL']);

  const client = (process.env.DATABASE_CLIENT || 'sqlite').toLowerCase();
  const result =
    client === 'postgres'
      ? await rewritePostgres(args, process.env.TARGET_CDN_URL)
      : await rewriteSqlite(args, process.env.TARGET_CDN_URL);

  console.log(
    args.dryRun
      ? `Dry run complete. files=${result.files} would_update=${result.changed}`
      : `Done. files=${result.files} updated=${result.changed}`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  rewriteFileRecord,
  rewriteFormats,
  rewriteMediaUrl,
};
