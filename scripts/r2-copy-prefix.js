'use strict';

const fs = require('fs');
const path = require('path');
const {
  CopyObjectCommand,
  ListObjectsV2Command,
  S3Client,
} = require('@aws-sdk/client-s3');

function parseArgs(argv) {
  const args = {
    dryRun: true,
    envFile: null,
    from: null,
    overwrite: false,
    to: null,
    yes: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--env-file') {
      args.envFile = argv[++i];
    } else if (arg === '--from') {
      args.from = argv[++i];
    } else if (arg === '--to') {
      args.to = argv[++i];
    } else if (arg === '--overwrite') {
      args.overwrite = true;
    } else if (arg === '--yes') {
      args.yes = true;
      args.dryRun = false;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.from || !args.to) {
    throw new Error('Missing required args: --from <prefix> --to <prefix>');
  }

  return args;
}

function normalizePrefix(prefix) {
  return prefix.replace(/^\/+/, '').replace(/\/+$/, '');
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

function createClient() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
}

async function listKeys(client, bucket, prefix) {
  const keys = [];
  let ContinuationToken;

  do {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `${prefix}/`,
        ContinuationToken,
      })
    );

    for (const item of result.Contents || []) {
      if (item.Key && !item.Key.endsWith('/')) keys.push(item.Key);
    }

    ContinuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (ContinuationToken);

  return keys;
}

function destinationKey(sourceKey, sourcePrefix, destinationPrefix) {
  const suffix = sourceKey.slice(`${sourcePrefix}/`.length);
  return `${destinationPrefix}/${suffix}`;
}

function copySource(bucket, key) {
  return `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.envFile);
  requireEnv(['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']);

  const sourcePrefix = normalizePrefix(args.from);
  const destinationPrefix = normalizePrefix(args.to);
  const bucket = process.env.R2_BUCKET;
  const client = createClient();
  const keys = await listKeys(client, bucket, sourcePrefix);
  const existingDestinationKeys = args.overwrite
    ? new Set()
    : new Set(await listKeys(client, bucket, destinationPrefix));

  let copied = 0;
  let skipped = 0;

  for (const key of keys) {
    const targetKey = destinationKey(key, sourcePrefix, destinationPrefix);
    const exists = existingDestinationKeys.has(targetKey);

    if (exists) {
      skipped += 1;
      console.log(`skip ${targetKey}`);
      continue;
    }

    console.log(`${args.dryRun ? 'would copy' : 'copy'} ${key} -> ${targetKey}`);
    if (!args.dryRun) {
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: targetKey,
          CopySource: copySource(bucket, key),
        })
      );
    }
    copied += 1;
  }

  console.log(
    args.dryRun
      ? `Dry run complete. source=${keys.length} would_copy=${copied} skipped=${skipped}`
      : `Done. source=${keys.length} copied=${copied} skipped=${skipped}`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  copySource,
  destinationKey,
  normalizePrefix,
};
