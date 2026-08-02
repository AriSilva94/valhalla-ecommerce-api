# Valhalla R2 CDN Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Valhalla Strapi media to `cdn-dev.valhallatecnologia.com.br/assets/images/...` and `cdn.valhallatecnologia.com.br/assets/images/...` while keeping one R2 bucket.

**Architecture:** Keep Strapi's existing AWS S3 provider. Add focused Node scripts for R2 object copy and Strapi media URL rewriting, update env examples and ignored Dokploy env files, then validate remote content and sampled image delivery. Existing `uploads-dev` objects remain in place until the new CDN paths are proven.

**Tech Stack:** Strapi 5, Node.js scripts, Cloudflare R2 S3-compatible API, `@aws-sdk/client-s3` transitively available through the Strapi upload provider, Vitest for focused helper tests.

---

## File Structure

- Create `scripts/r2-copy-prefix.js`: copies existing objects from one R2 prefix to another, with dry-run support and env-file loading.
- Create `scripts/rewrite-media-urls.js`: rewrites Strapi upload file URLs through the REST API using an API token, dry-run by default unless `--yes` is passed.
- Create `scripts/validate-media-cdn.js`: validates content counts and sampled image URLs for DEV and PROD.
- Modify `package.json`: add script aliases for dry-run and execution.
- Modify `.env.example`: document the new CDN env model.
- Modify `.env.dokploy.dev`: set `R2_PUBLIC_URL` and `R2_ROOT_PATH` for DEV.
- Modify `.env.dokploy.prod`: set `R2_PUBLIC_URL` and `R2_ROOT_PATH` for PROD.
- Test `src/utils/__tests__/media-url-rewrite.test.ts`: verify URL rewrite behavior before wiring the script.

## Task 1: Media URL Rewrite Helper

**Files:**
- Test: `src/utils/__tests__/media-url-rewrite.test.ts`
- Create: `scripts/rewrite-media-urls.js`

- [ ] **Step 1: Write the failing helper test**

Create `src/utils/__tests__/media-url-rewrite.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

function rewriteMediaUrl(url: string, targetBaseUrl: string) {
  const base = targetBaseUrl.replace(/\/+$/, '');
  return url
    .replace(/^https:\/\/pub-[^/]+\.r2\.dev\/uploads-dev\//, `${base}/assets/images/`)
    .replace(/^https:\/\/pub-[^/]+\.r2\.dev\/uploads\//, `${base}/assets/images/`)
    .replace(/^https:\/\/cdn-dev\.valhallatecnologia\.com\.br\/assets\/images\//, `${base}/assets/images/`)
    .replace(/^https:\/\/cdn\.valhallatecnologia\.com\.br\/assets\/images\//, `${base}/assets/images/`);
}

describe('rewriteMediaUrl', () => {
  it('rewrites legacy R2 dev URLs to the requested CDN host', () => {
    expect(
      rewriteMediaUrl(
        'https://pub-61c4f8e03dc74e918adf43e0c1c4af54.r2.dev/uploads-dev/photo.webp',
        'https://cdn.valhallatecnologia.com.br'
      )
    ).toBe('https://cdn.valhallatecnologia.com.br/assets/images/photo.webp');
  });

  it('rewrites bridge URLs that lost the dev suffix', () => {
    expect(
      rewriteMediaUrl(
        'https://pub-61c4f8e03dc74e918adf43e0c1c4af54.r2.dev/uploads/photo.webp',
        'https://cdn-dev.valhallatecnologia.com.br'
      )
    ).toBe('https://cdn-dev.valhallatecnologia.com.br/assets/images/photo.webp');
  });

  it('can switch between Valhalla CDN hosts without changing the object key', () => {
    expect(
      rewriteMediaUrl(
        'https://cdn-dev.valhallatecnologia.com.br/assets/images/photo.webp',
        'https://cdn.valhallatecnologia.com.br/'
      )
    ).toBe('https://cdn.valhallatecnologia.com.br/assets/images/photo.webp');
  });
});
```

- [ ] **Step 2: Run test to verify helper behavior**

Run: `npm test -- src/utils/__tests__/media-url-rewrite.test.ts`

Expected: PASS for the inline helper behavior. This is a design lock before copying the same regex into the script.

- [ ] **Step 3: Add `scripts/rewrite-media-urls.js`**

Create a CommonJS script that:

1. Loads `--env-file` if provided.
2. Requires `STRAPI_URL`, `STRAPI_TOKEN`, and `TARGET_CDN_URL`.
3. Fetches `/api/upload/files?pagination[pageSize]=100`.
4. Rewrites `url` and nested `formats.*.url`.
5. Logs changes in dry-run mode.
6. Sends `PUT /api/upload/files/:id` only when `--yes` is present.

- [ ] **Step 4: Run script help/dry-run path**

Run:

```bash
node scripts/rewrite-media-urls.js --dry-run
```

Expected: exits with a clear missing env error mentioning `STRAPI_URL`, `STRAPI_TOKEN`, and `TARGET_CDN_URL`.

## Task 2: R2 Prefix Copy Script

**Files:**
- Create: `scripts/r2-copy-prefix.js`
- Modify: `package.json`

- [ ] **Step 1: Add `scripts/r2-copy-prefix.js`**

Create a CommonJS script that:

1. Loads `--env-file` if provided.
2. Reads `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
3. Accepts `--from uploads-dev --to assets/images`.
4. Lists all objects under the source prefix.
5. Copies each object to the destination key preserving the suffix.
6. Skips objects that already exist unless `--overwrite` is passed.
7. Defaults to dry-run unless `--yes` is passed.

- [ ] **Step 2: Add package scripts**

Modify `package.json` scripts:

```json
"r2:copy-prefix": "node ./scripts/r2-copy-prefix.js",
"media:rewrite-urls": "node ./scripts/rewrite-media-urls.js",
"media:validate-cdn": "node ./scripts/validate-media-cdn.js"
```

- [ ] **Step 3: Run dry-run**

Run:

```bash
npm run r2:copy-prefix -- --env-file .env.dokploy.dev --from uploads-dev --to assets/images
```

Expected: prints planned copies and does not write to R2.

## Task 3: Env and Documentation Updates

**Files:**
- Modify: `.env.example`
- Modify: `.env.dokploy.dev`
- Modify: `.env.dokploy.prod`

- [ ] **Step 1: Update `.env.example`**

Set the example R2 section to document:

```env
# R2_PUBLIC_URL=https://cdn-dev.valhallatecnologia.com.br
# R2_ROOT_PATH=assets/images
```

- [ ] **Step 2: Update `.env.dokploy.dev`**

Set:

```env
R2_PUBLIC_URL=https://cdn-dev.valhallatecnologia.com.br
R2_ROOT_PATH=assets/images
```

- [ ] **Step 3: Update `.env.dokploy.prod`**

Set:

```env
R2_PUBLIC_URL=https://cdn.valhallatecnologia.com.br
R2_ROOT_PATH=assets/images
```

- [ ] **Step 4: Compare env keys**

Run the existing key comparison command:

```powershell
$devKeys = Get-Content .env.dokploy.dev | Where-Object { $_ -match '^[A-Za-z_][A-Za-z0-9_]*=' } | ForEach-Object { ($_ -split '=',2)[0] }
$prodKeys = Get-Content .env.dokploy.prod | Where-Object { $_ -match '^[A-Za-z_][A-Za-z0-9_]*=' } | ForEach-Object { ($_ -split '=',2)[0] }
Compare-Object $devKeys $prodKeys
```

Expected: no output.

## Task 4: CDN Validation Script and Remote Migration

**Files:**
- Create: `scripts/validate-media-cdn.js`

- [ ] **Step 1: Add `scripts/validate-media-cdn.js`**

Create a script that validates a Strapi base URL and expected CDN host:

```bash
node scripts/validate-media-cdn.js --strapi-url https://api.valhallatecnologia.com.br --cdn-url https://cdn.valhallatecnologia.com.br
```

It should print counts for `products`, `categories`, `brands`, `faqs`, `policies`, then fetch one product with `mainImage`, `gallery`, `brand`, `category`, and `variants`, assert the sampled image starts with the CDN URL, and issue a `HEAD` request expecting HTTP 200.

- [ ] **Step 2: Copy R2 objects**

Run:

```bash
npm run r2:copy-prefix -- --env-file .env.dokploy.dev --from uploads-dev --to assets/images --yes
```

Expected: copies all legacy uploaded objects to `assets/images`.

- [ ] **Step 3: Rewrite DEV media records**

Run with a full-access API token from DEV:

```bash
$env:STRAPI_URL='https://api-dev.valhallatecnologia.com.br'
$env:STRAPI_TOKEN='<DEV_API_TOKEN>'
$env:TARGET_CDN_URL='https://cdn-dev.valhallatecnologia.com.br'
npm run media:rewrite-urls -- --yes
```

Expected: all changed upload file records are updated to `cdn-dev`.

- [ ] **Step 4: Rewrite PROD media records**

Run with a full-access API token from PROD:

```bash
$env:STRAPI_URL='https://api.valhallatecnologia.com.br'
$env:STRAPI_TOKEN='<PROD_API_TOKEN>'
$env:TARGET_CDN_URL='https://cdn.valhallatecnologia.com.br'
npm run media:rewrite-urls -- --yes
```

Expected: all changed upload file records are updated to `cdn`.

- [ ] **Step 5: Validate DEV and PROD**

Run:

```bash
npm run media:validate-cdn -- --strapi-url https://api-dev.valhallatecnologia.com.br --cdn-url https://cdn-dev.valhallatecnologia.com.br
npm run media:validate-cdn -- --strapi-url https://api.valhallatecnologia.com.br --cdn-url https://cdn.valhallatecnologia.com.br
```

Expected: counts print, sample image URLs start with the expected CDN, and sampled images return HTTP 200.

## Self-Review

- Spec coverage: env model, object copy, media record rewrite, no deletion, and validation are covered.
- Placeholder scan: only `<DEV_API_TOKEN>` and `<PROD_API_TOKEN>` remain as explicit runtime secrets that must be supplied by the operator; they are not code placeholders.
- Type consistency: script names and package aliases are consistent across tasks.
