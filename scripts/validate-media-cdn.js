'use strict';

function parseArgs(argv) {
  const args = {
    cdnUrl: null,
    strapiUrl: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--strapi-url') {
      args.strapiUrl = argv[++i];
    } else if (arg === '--cdn-url') {
      args.cdnUrl = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.strapiUrl || !args.cdnUrl) {
    throw new Error('Missing required args: --strapi-url <url> --cdn-url <url>');
  }

  args.strapiUrl = args.strapiUrl.replace(/\/+$/, '');
  args.cdnUrl = args.cdnUrl.replace(/\/+$/, '');
  return args;
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function head(url) {
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok) {
    throw new Error(`HEAD ${url} -> ${response.status}`);
  }
  return response.status;
}

async function countResource(strapiUrl, resource) {
  const result = await getJson(`${strapiUrl}/api/${resource}?pagination[withCount]=true`);
  return result?.meta?.pagination?.total;
}

async function validateSampleProduct(strapiUrl, cdnUrl) {
  const query = [
    'pagination[pageSize]=1',
    'populate[brand]=true',
    'populate[category]=true',
    'populate[mainImage]=true',
    'populate[gallery]=true',
    'populate[variants]=true',
  ].join('&');

  const result = await getJson(`${strapiUrl}/api/products?${query}`);
  const product = result?.data?.[0];
  if (!product) throw new Error('No product found for sample validation.');
  if (!product.mainImage?.url) throw new Error(`Product "${product.name}" has no mainImage.url.`);

  const imageUrl = product.mainImage.url;
  if (!imageUrl.startsWith(`${cdnUrl}/assets/images/`)) {
    throw new Error(`Unexpected image URL: ${imageUrl}`);
  }

  const status = await head(imageUrl);

  return {
    brand: product.brand?.name || null,
    category: product.category?.name || null,
    galleryCount: Array.isArray(product.gallery) ? product.gallery.length : 0,
    imageStatus: status,
    imageUrl,
    name: product.name,
    variantsCount: Array.isArray(product.variants) ? product.variants.length : 0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const resources = ['products', 'categories', 'brands', 'tags', 'faqs', 'policies'];

  for (const resource of resources) {
    const total = await countResource(args.strapiUrl, resource);
    console.log(`${resource}=${total}`);
  }

  const sample = await validateSampleProduct(args.strapiUrl, args.cdnUrl);
  console.log(`product=${sample.name}`);
  console.log(`brand=${sample.brand}`);
  console.log(`category=${sample.category}`);
  console.log(`mainImage=${sample.imageUrl}`);
  console.log(`galleryCount=${sample.galleryCount}`);
  console.log(`variantsCount=${sample.variantsCount}`);
  console.log(`image_status=${sample.imageStatus}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  validateSampleProduct,
};
