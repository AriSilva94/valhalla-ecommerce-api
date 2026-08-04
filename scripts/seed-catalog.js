'use strict';

// ---------------------------------------------------------------------------
// Replaces the demo catalogue with the client's real one, derived from the
// folder tree in docs/fotos (already uploaded by scripts/import-media.js).
//
// DESTRUCTIVE: deletes every product, category, brand and tag first.
// Requires --yes to run.
//
// The photos carry no pricing, so every variant gets PLACEHOLDER_PRICE. It is
// deliberately a plausible non-zero value: products are published so the
// storefront can be exercised end to end, and 0 would render as "free" or
// break checkout maths. The client only has to correct the price per variant —
// that is what the storefront reads, and basePrice is derived from it by
// src/utils/product-autofill-middleware.ts, so it is not written here.
//
// Usage:
//   STRAPI_URL=http://localhost:1337 STRAPI_TOKEN=xxx node scripts/seed-catalog.js --yes
//   node scripts/seed-catalog.js --dry-run
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '..', 'docs', 'fotos');
const STRAPI_URL = (process.env.STRAPI_URL || 'http://localhost:1337').replace(/\/$/, '');
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRMED = process.argv.includes('--yes');

// Stand-in price until the client enters the real ones.
const PLACEHOLDER_PRICE = 99.99;

// Folder names are the client's own filing scheme; these are the labels the
// storefront should show instead.
const CATEGORY_LABELS = {
  'Air Cooler': 'Air Coolers',
  Fontes: 'Fontes',
  Gabinete: 'Gabinetes',
  HeadSet: 'Headsets',
  'Impressoras Epson': 'Impressoras',
  Mouses: 'Mouses',
  'Pasta Termicas': 'Pastas Térmicas',
  Teclado: 'Teclados',
  'Tintas X-FULL': 'Tintas',
  Ventoinhas: 'Ventoinhas',
};

// Brand is not a folder level, so it comes from the product name. First match
// wins, so more specific patterns must come first. X-FULL precedes Epson
// because the ink product names read "Tinta Modelo Office - Epson", where
// Epson is the printer it fits, not the maker.
const BRAND_PATTERNS = [
  [/x-full/i, 'X-FULL'],
  [/rise mode/i, 'Rise Mode'],
  [/fortrek/i, 'Fortrek'],
  [/havit/i, 'Havit'],
  [/epson|ecotank/i, 'Epson'],
];

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function detectBrand(productName, categoryFolder) {
  for (const [pattern, brand] of BRAND_PATTERNS) {
    if (pattern.test(productName) || pattern.test(categoryFolder)) return brand;
  }
  return null;
}

function listDirs(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function api(method, endpoint, body) {
  const response = await fetch(`${STRAPI_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRAPI_TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    throw new Error(`${method} ${endpoint} -> ${response.status} ${await response.text()}`);
  }

  return response.status === 204 ? null : response.json();
}

async function fetchAll(resource) {
  const items = [];
  let page = 1;

  for (;;) {
    const result = await api(
      'GET',
      `/api/${resource}?pagination[page]=${page}&pagination[pageSize]=100&status=draft`
    );
    items.push(...result.data);
    if (page >= result.meta.pagination.pageCount) break;
    page += 1;
  }

  return items;
}

async function wipe(resource) {
  const items = await fetchAll(resource);

  if (DRY_RUN) {
    console.log(`  would delete ${items.length} ${resource}`);
    return;
  }

  for (const item of items) {
    await api('DELETE', `/api/${resource}/${item.documentId}`);
  }

  console.log(`  deleted ${items.length} ${resource}`);
}

// Media was uploaded as "<Categoria> - <Produto> - NN.ext", so the folder pair
// is enough to find a product's photos in upload order.
async function findImages(categoryFolder, productFolder) {
  const prefix = `${categoryFolder} - ${productFolder} - `;
  const files = await api(
    'GET',
    `/api/upload/files?filters[name][$startsWith]=${encodeURIComponent(prefix)}`
  );

  return files.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}

async function main() {
  if (!CONFIRMED && !DRY_RUN) {
    throw new Error('This deletes every product, category, brand and tag. Pass --yes to confirm.');
  }

  if (!STRAPI_TOKEN && !DRY_RUN) {
    throw new Error('STRAPI_TOKEN is required.');
  }

  console.log(DRY_RUN ? 'Mode: dry run\n' : `Target: ${STRAPI_URL}\n`);

  console.log('Wiping demo catalogue');
  // Products first: they hold the relations to categories, brands and tags.
  for (const resource of ['products', 'categories', 'brands', 'tags']) {
    await wipe(resource);
  }

  const tree = listDirs(SOURCE_DIR).map((categoryFolder) => ({
    categoryFolder,
    products: listDirs(path.join(SOURCE_DIR, categoryFolder)),
  }));

  console.log('\nCreating categories');
  const categoryIds = {};
  for (const { categoryFolder } of tree) {
    const name = CATEGORY_LABELS[categoryFolder] || categoryFolder;
    if (DRY_RUN) {
      console.log(`  ${categoryFolder} -> ${name}`);
      continue;
    }
    const created = await api('POST', '/api/categories', {
      data: { name, slug: slugify(name) },
    });
    categoryIds[categoryFolder] = created.data.documentId;
    console.log(`  ${name}`);
  }

  console.log('\nCreating brands');
  const brandNames = new Set();
  for (const { categoryFolder, products } of tree) {
    for (const product of products) {
      const brand = detectBrand(product, categoryFolder);
      if (brand) brandNames.add(brand);
    }
  }

  const brandIds = {};
  for (const name of [...brandNames].sort()) {
    if (DRY_RUN) {
      console.log(`  ${name}`);
      continue;
    }
    const created = await api('POST', '/api/brands', {
      data: { name, slug: slugify(name) },
    });
    brandIds[name] = created.data.documentId;
    console.log(`  ${name}`);
  }

  console.log(`\nCreating products (published, price ${PLACEHOLDER_PRICE})`);
  const stats = { created: 0, failed: 0, noImages: 0 };

  for (const { categoryFolder, products } of tree) {
    for (const productFolder of products) {
      const brand = detectBrand(productFolder, categoryFolder);

      if (DRY_RUN) {
        console.log(`  ${productFolder}  [${CATEGORY_LABELS[categoryFolder]} / ${brand || 'sem marca'}]`);
        stats.created += 1;
        continue;
      }

      try {
        const images = await findImages(categoryFolder, productFolder);
        if (images.length === 0) stats.noImages += 1;

        await api('POST', '/api/products', {
          data: {
            name: productFolder,
            slug: slugify(productFolder),
            category: categoryIds[categoryFolder],
            brand: brand ? brandIds[brand] : undefined,
            mainImage: images[0]?.id,
            gallery: images.slice(1).map((file) => file.id),
            variants: [{ configLabel: 'Padrão', price: PLACEHOLDER_PRICE, available: true }],
          },
        });

        console.log(`  ok   ${productFolder} (${images.length} fotos)`);
        stats.created += 1;
      } catch (error) {
        console.error(`  FAIL ${productFolder}: ${error.message}`);
        stats.failed += 1;
      }
    }
  }

  console.log(
    `\nDone. created=${stats.created} failed=${stats.failed} sem-imagem=${stats.noImages}`
  );
  console.log(
    `All prices are the ${PLACEHOLDER_PRICE} placeholder — correct them in the admin, inside each product's "Variações".`
  );

  if (stats.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
