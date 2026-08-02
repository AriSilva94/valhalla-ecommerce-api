'use strict';

// ---------------------------------------------------------------------------
// Bulk-uploads the client's product photos into the Strapi Media Library.
//
// Source layout:   docs/fotos/<Categoria>/<Produto>/<foto>.jpg
// Uploaded name:   <Categoria> - <Produto> - 01.jpg
//
// It only fills the Media Library — it does not create or touch products.
// The `product` content type requires basePrice and at least one variant,
// neither of which exists in the photos, so linking stays a manual step in
// the admin panel. Search the library by the folder name to find a set.
//
// With R2 configured (see config/plugins.ts) these go straight to the bucket.
//
// Usage:
//   STRAPI_URL=http://localhost:1337 STRAPI_TOKEN=xxx node scripts/import-media.js
//   node scripts/import-media.js --dry-run
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

const SOURCE_DIR = path.join(__dirname, '..', 'docs', 'fotos');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

const STRAPI_URL = (process.env.STRAPI_URL || 'http://localhost:1337').replace(/\/$/, '');
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

function listDirs(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listImages(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort();
}

// Collapses the folder tree into a flat, searchable upload name.
function buildName(category, product, index, extension) {
  const position = String(index + 1).padStart(2, '0');
  return `${category} - ${product} - ${position}${extension}`;
}

async function alreadyUploaded(name) {
  const url = `${STRAPI_URL}/api/upload/files?filters[name][$eq]=${encodeURIComponent(name)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${STRAPI_TOKEN}` },
  });

  if (!response.ok) {
    throw new Error(`Lookup failed for "${name}": ${response.status} ${await response.text()}`);
  }

  const files = await response.json();
  return Array.isArray(files) && files.length > 0;
}

async function upload(filePath, name, altText, caption) {
  const form = new FormData();
  const contentType = mime.lookup(filePath) || 'application/octet-stream';
  const blob = new Blob([fs.readFileSync(filePath)], { type: contentType });

  form.append('files', blob, name);
  form.append(
    'fileInfo',
    JSON.stringify({ name, alternativeText: altText, caption })
  );

  const response = await fetch(`${STRAPI_URL}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRAPI_TOKEN}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Upload failed for "${name}": ${response.status} ${await response.text()}`);
  }

  const [uploaded] = await response.json();
  return uploaded;
}

async function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`Source directory not found: ${SOURCE_DIR}`);
  }

  if (!STRAPI_TOKEN && !DRY_RUN) {
    throw new Error('STRAPI_TOKEN is required. Create one in Settings > API Tokens.');
  }

  console.log(`Source: ${SOURCE_DIR}`);
  console.log(DRY_RUN ? 'Mode:   dry run (nothing is uploaded)' : `Target: ${STRAPI_URL}`);
  console.log('');

  const stats = { uploaded: 0, skipped: 0, failed: 0 };

  for (const category of listDirs(SOURCE_DIR)) {
    const categoryDir = path.join(SOURCE_DIR, category);

    for (const product of listDirs(categoryDir)) {
      const productDir = path.join(categoryDir, product);
      const images = listImages(productDir);

      if (images.length === 0) {
        console.warn(`! no images in ${category}/${product}`);
        continue;
      }

      console.log(`${category} / ${product} (${images.length})`);

      for (const [index, image] of images.entries()) {
        const filePath = path.join(productDir, image);
        const name = buildName(category, product, index, path.extname(image).toLowerCase());

        if (DRY_RUN) {
          console.log(`  would upload  ${name}`);
          stats.uploaded += 1;
          continue;
        }

        try {
          if (await alreadyUploaded(name)) {
            console.log(`  skip          ${name}`);
            stats.skipped += 1;
            continue;
          }

          const result = await upload(filePath, name, product, category);
          console.log(`  ok            ${name} -> ${result.url}`);
          stats.uploaded += 1;
        } catch (error) {
          console.error(`  FAIL          ${name}: ${error.message}`);
          stats.failed += 1;
        }
      }
    }
  }

  console.log('');
  console.log(`Done. uploaded=${stats.uploaded} skipped=${stats.skipped} failed=${stats.failed}`);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
