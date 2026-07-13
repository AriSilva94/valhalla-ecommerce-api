# E-commerce Content-Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unused Strapi Blog starter content-types with a full e-commerce content model (catalog + institutional site content) matching the design in `docs/superpowers/specs/2026-07-13-ecommerce-content-types-design.md`.

**Architecture:** Strapi v5 content-types defined as hand-written `schema.json` files (no `strapi generate` CLI, since these need exact field lists from the spec) plus the standard `factories.createCoreController/Router/Service` boilerplate for each. Order is chosen so every restart of Strapi only ever references content-types/components that already exist on disk, so `strapi develop` boots cleanly after every single task.

**Tech Stack:** Strapi 5.50.1, TypeScript, SQLite (`better-sqlite3`) as the dev database at `.tmp/data.db`.

## Global Constraints

- Project root: `C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api`. Not a git repository — no commit steps in this plan (confirmed with user).
- Do **not** delete `.tmp/data.db`. It holds the admin user the project owner already created. Old/removed content-types leave harmless orphan tables behind in that file — this is expected and fine for a dev SQLite DB.
- `draftAndPublish: true` for `Product` and `ProductVariant` only (matches the existing `article` precedent for content that gets prepped before going live). Everything else (`Brand`, `Category`, `Tag`, `Homepage`, `SiteSettings`, `Faq`, `Policy`) uses `draftAndPublish: false` (matches the existing `category`/`author`/`global` precedent for simple always-live content).
- Strapi v5 stores camelCase attribute names as snake_case columns (verified: `siteName` → `site_name`). Relations are stored in separate `<owning_collectionName>_<fieldName>_lnk` tables, not FK columns. Repeatable/single components are stored in the component's own table (`components_<namespace>_<name>`) linked via a shared `<collectionName>_cmps` join table (columns: `id, entity_id, cmp_id, component_type, field, order`). These facts were confirmed by introspecting the existing `.tmp/data.db` before writing this plan and are relied on in every task's verification step.
- Every task's restart step uses this exact sequence (Windows/Git Bash via the Bash tool):
  ```bash
  cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
  powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
  rm -f .tmp/strapi-verify.log
  npm run develop > .tmp/strapi-verify.log 2>&1 &
  sleep 25
  grep -c "Strapi started successfully" .tmp/strapi-verify.log
  grep -c "\[ERROR\]" .tmp/strapi-verify.log
  powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
  ```
  Expected: the first `grep -c` prints `1`, the second prints `0`. If the second prints anything other than `0`, read `.tmp/strapi-verify.log` in full to find the schema error before continuing.
- Every task's DB-introspection check uses this template (customized per task with the real table/column names):
  ```bash
  node -e "
  const Database = require('better-sqlite3');
  const db = new Database('.tmp/data.db');
  const cols = db.prepare(\"PRAGMA table_info(TABLE_NAME)\").all().map(c => c.name);
  console.log(cols.join(','));
  db.close();
  "
  ```
  `PRAGMA table_info` on a table that doesn't exist yet returns zero rows (not an error) — so the "RED" state is an **empty string**, and the "GREEN" state is a **comma-separated list of column names**.

---

### Task 1: Remove unused Blog starter content-types and components

**Files:**
- Delete: `src/api/article/` (entire folder)
- Delete: `src/api/author/` (entire folder)
- Delete: `src/api/category/` (entire folder — this is the old blog-oriented Category; a new product-facing one is created in Task 4)
- Delete: `src/api/about/` (entire folder)
- Delete: `src/api/global/` (entire folder)
- Delete: `src/components/shared/media.json`
- Delete: `src/components/shared/quote.json`
- Delete: `src/components/shared/rich-text.json`
- Delete: `src/components/shared/slider.json`
- Keep: `src/components/shared/seo.json` (reused later by `Product.seo` and `SiteSettings.defaultSeo`)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a clean slate — no `api::article.article`, `api::author.author`, `api::category.category`, `api::about.about`, `api::global.global` UIDs exist afterward, freeing the `category` name for Task 4.

- [ ] **Step 1: Confirm current state (RED)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('articles','authors','categories','abouts','globals')\").all();
console.log(tables.map(t => t.name).join(','));
db.close();
"
```
Expected: `articles,authors,categories,abouts,globals` (all five exist from the earlier boot).

- [ ] **Step 2: Delete the folders and files**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
rm -rf src/api/article src/api/author src/api/category src/api/about src/api/global
rm -f src/components/shared/media.json src/components/shared/quote.json src/components/shared/rich-text.json src/components/shared/slider.json
```

- [ ] **Step 3: Restart Strapi and verify clean boot**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
rm -f .tmp/strapi-verify.log
npm run develop > .tmp/strapi-verify.log 2>&1 &
sleep 25
grep -c "Strapi started successfully" .tmp/strapi-verify.log
grep -c "\[ERROR\]" .tmp/strapi-verify.log
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
```
Expected: `1` then `0`.

- [ ] **Step 4: Verify the admin user survived (GREEN — nothing destroyed)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
const count = db.prepare('SELECT COUNT(*) as c FROM admin_users').get();
console.log(count.c);
db.close();
"
```
Expected: `1` (or however many admin users exist — must be `>= 1`, not `0`).

---

### Task 2: Add `ecommerce` components (`spec`, `color`)

**Files:**
- Create: `src/components/ecommerce/spec.json`
- Create: `src/components/ecommerce/color.json`

**Interfaces:**
- Consumes: nothing.
- Produces: components `ecommerce.spec` (fields: `key`, `value`) and `ecommerce.color` (fields: `name`, `hex`) — consumed by `Product.specs` (Task 6) and `ProductVariant.color` (Task 7).

- [ ] **Step 1: Confirm tables don't exist yet (RED)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log('specs:', db.prepare(\"PRAGMA table_info(components_ecommerce_specs)\").all().map(c=>c.name).join(','));
console.log('colors:', db.prepare(\"PRAGMA table_info(components_ecommerce_colors)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: `specs:` then `colors:` (both empty).

- [ ] **Step 2: Create `src/components/ecommerce/spec.json`**

```json
{
  "collectionName": "components_ecommerce_specs",
  "info": {
    "displayName": "Spec"
  },
  "options": {},
  "attributes": {
    "key": {
      "type": "string"
    },
    "value": {
      "type": "string"
    }
  }
}
```

- [ ] **Step 3: Create `src/components/ecommerce/color.json`**

```json
{
  "collectionName": "components_ecommerce_colors",
  "info": {
    "displayName": "Color"
  },
  "options": {},
  "attributes": {
    "name": {
      "type": "string"
    },
    "hex": {
      "type": "string"
    }
  }
}
```

- [ ] **Step 4: Restart Strapi and verify clean boot**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
rm -f .tmp/strapi-verify.log
npm run develop > .tmp/strapi-verify.log 2>&1 &
sleep 25
grep -c "Strapi started successfully" .tmp/strapi-verify.log
grep -c "\[ERROR\]" .tmp/strapi-verify.log
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
```
Expected: `1` then `0`.

- [ ] **Step 5: Confirm tables now exist (GREEN)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log('specs:', db.prepare(\"PRAGMA table_info(components_ecommerce_specs)\").all().map(c=>c.name).join(','));
console.log('colors:', db.prepare(\"PRAGMA table_info(components_ecommerce_colors)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: `specs: id,key,value` then `colors: id,name,hex`.

---

### Task 3: `Brand` content-type

**Files:**
- Create: `src/api/brand/content-types/brand/schema.json`
- Create: `src/api/brand/controllers/brand.ts`
- Create: `src/api/brand/routes/brand.ts`
- Create: `src/api/brand/services/brand.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: UID `api::brand.brand` with fields `name`, `slug`, `logo` — consumed by `Product.brand` (Task 6).

- [ ] **Step 1: Confirm table doesn't exist yet (RED)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(brands)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: empty string.

- [ ] **Step 2: Create `src/api/brand/content-types/brand/schema.json`**

```json
{
  "kind": "collectionType",
  "collectionName": "brands",
  "info": {
    "singularName": "brand",
    "pluralName": "brands",
    "displayName": "Brand"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "name": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "name"
    },
    "logo": {
      "type": "media",
      "multiple": false,
      "required": false,
      "allowedTypes": ["images"]
    }
  }
}
```

- [ ] **Step 3: Create `src/api/brand/controllers/brand.ts`**

```ts
/**
 *  brand controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::brand.brand');
```

- [ ] **Step 4: Create `src/api/brand/routes/brand.ts`**

```ts
/**
 * brand router.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::brand.brand');
```

- [ ] **Step 5: Create `src/api/brand/services/brand.ts`**

```ts
/**
 * brand service.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::brand.brand');
```

- [ ] **Step 6: Restart Strapi and verify clean boot**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
rm -f .tmp/strapi-verify.log
npm run develop > .tmp/strapi-verify.log 2>&1 &
sleep 25
grep -c "Strapi started successfully" .tmp/strapi-verify.log
grep -c "\[ERROR\]" .tmp/strapi-verify.log
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
```
Expected: `1` then `0`.

- [ ] **Step 7: Confirm table now exists with expected columns (GREEN)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(brands)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: includes `id,document_id,name,slug` (plus standard `created_at,updated_at,published_at,created_by_id,updated_by_id,locale`). `logo` will not appear as a column — media fields are stored via the polymorphic `files_related_mph` table, not a column; boot succeeding with no `[ERROR]` is the correct signal that the media field is valid.

---

### Task 4: `Category` content-type (product-facing)

**Files:**
- Create: `src/api/category/content-types/category/schema.json`
- Create: `src/api/category/controllers/category.ts`
- Create: `src/api/category/routes/category.ts`
- Create: `src/api/category/services/category.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: UID `api::category.category` with fields `name`, `slug`, `description`, `image` — consumed by `Product.category` (Task 6).

- [ ] **Step 1: Confirm table doesn't exist yet (RED)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(categories)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: empty string (Task 1 already deleted the old `categories`-backed content-type; the physical `categories` table from before Task 1 either doesn't exist yet in a fresh DB or, if it does, has the OLD blog columns like `name,slug,description` only — either way there is currently no active `api::category.category` UID).

- [ ] **Step 2: Create `src/api/category/content-types/category/schema.json`**

```json
{
  "kind": "collectionType",
  "collectionName": "categories",
  "info": {
    "singularName": "category",
    "pluralName": "categories",
    "displayName": "Category"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "name": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "name"
    },
    "description": {
      "type": "text"
    },
    "image": {
      "type": "media",
      "multiple": false,
      "required": false,
      "allowedTypes": ["images"]
    }
  }
}
```

- [ ] **Step 3: Create `src/api/category/controllers/category.ts`**

```ts
/**
 *  category controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::category.category');
```

- [ ] **Step 4: Create `src/api/category/routes/category.ts`**

```ts
/**
 * category router.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::category.category');
```

- [ ] **Step 5: Create `src/api/category/services/category.ts`**

```ts
/**
 * category service.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::category.category');
```

- [ ] **Step 6: Restart Strapi and verify clean boot**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
rm -f .tmp/strapi-verify.log
npm run develop > .tmp/strapi-verify.log 2>&1 &
sleep 25
grep -c "Strapi started successfully" .tmp/strapi-verify.log
grep -c "\[ERROR\]" .tmp/strapi-verify.log
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
```
Expected: `1` then `0`.

- [ ] **Step 7: Confirm table has the new columns (GREEN)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(categories)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: includes `id,document_id,name,slug,description` (plus standard timestamp/locale columns). No `articles` column (that was the old blog relation — confirms Strapi migrated the table to the new schema, dropping the stale relation).

---

### Task 5: `Tag` content-type

**Files:**
- Create: `src/api/tag/content-types/tag/schema.json`
- Create: `src/api/tag/controllers/tag.ts`
- Create: `src/api/tag/routes/tag.ts`
- Create: `src/api/tag/services/tag.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: UID `api::tag.tag` with fields `name`, `slug` — consumed by `Product.tags` (Task 6).

- [ ] **Step 1: Confirm table doesn't exist yet (RED)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(tags)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: empty string.

- [ ] **Step 2: Create `src/api/tag/content-types/tag/schema.json`**

```json
{
  "kind": "collectionType",
  "collectionName": "tags",
  "info": {
    "singularName": "tag",
    "pluralName": "tags",
    "displayName": "Tag"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "name": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "name"
    }
  }
}
```

- [ ] **Step 3: Create `src/api/tag/controllers/tag.ts`**

```ts
/**
 *  tag controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::tag.tag');
```

- [ ] **Step 4: Create `src/api/tag/routes/tag.ts`**

```ts
/**
 * tag router.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::tag.tag');
```

- [ ] **Step 5: Create `src/api/tag/services/tag.ts`**

```ts
/**
 * tag service.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::tag.tag');
```

- [ ] **Step 6: Restart Strapi and verify clean boot**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
rm -f .tmp/strapi-verify.log
npm run develop > .tmp/strapi-verify.log 2>&1 &
sleep 25
grep -c "Strapi started successfully" .tmp/strapi-verify.log
grep -c "\[ERROR\]" .tmp/strapi-verify.log
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
```
Expected: `1` then `0`.

- [ ] **Step 7: Confirm table now exists (GREEN)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(tags)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: includes `id,document_id,name,slug`.

---

### Task 6: `Product` content-type + wire reverse relations on Brand/Category/Tag

**Files:**
- Create: `src/api/product/content-types/product/schema.json`
- Create: `src/api/product/controllers/product.ts`
- Create: `src/api/product/routes/product.ts`
- Create: `src/api/product/services/product.ts`
- Modify: `src/api/brand/content-types/brand/schema.json` (add reverse `products` relation)
- Modify: `src/api/category/content-types/category/schema.json` (add reverse `products` relation)
- Modify: `src/api/tag/content-types/tag/schema.json` (add reverse `products` relation)

**Interfaces:**
- Consumes: `ecommerce.spec` (Task 2), `ecommerce.color`(unused here), `api::brand.brand` (Task 3), `api::category.category` (Task 4), `api::tag.tag` (Task 5), `shared.seo` (pre-existing).
- Produces: UID `api::product.product` with fields `name`, `slug`, `brand`, `category`, `tags`, `basePrice`, `variantGroupLabel`, `specs`, `description`, `warranty`, `mainImage`, `gallery`, `seo` — consumed by `ProductVariant.product` (Task 7).

- [ ] **Step 1: Confirm table doesn't exist yet (RED)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(products)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: empty string.

- [ ] **Step 2: Create `src/api/product/content-types/product/schema.json`**

```json
{
  "kind": "collectionType",
  "collectionName": "products",
  "info": {
    "singularName": "product",
    "pluralName": "products",
    "displayName": "Product"
  },
  "options": {
    "draftAndPublish": true
  },
  "pluginOptions": {},
  "attributes": {
    "name": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "name"
    },
    "brand": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::brand.brand",
      "inversedBy": "products"
    },
    "category": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::category.category",
      "inversedBy": "products"
    },
    "tags": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "api::tag.tag",
      "inversedBy": "products"
    },
    "basePrice": {
      "type": "decimal",
      "required": true
    },
    "variantGroupLabel": {
      "type": "string"
    },
    "specs": {
      "type": "component",
      "repeatable": true,
      "component": "ecommerce.spec"
    },
    "description": {
      "type": "richtext"
    },
    "warranty": {
      "type": "string"
    },
    "mainImage": {
      "type": "media",
      "multiple": false,
      "required": false,
      "allowedTypes": ["images"]
    },
    "gallery": {
      "type": "media",
      "multiple": true,
      "required": false,
      "allowedTypes": ["images"]
    },
    "seo": {
      "type": "component",
      "repeatable": false,
      "component": "shared.seo"
    }
  }
}
```

- [ ] **Step 3: Create `src/api/product/controllers/product.ts`**

```ts
/**
 *  product controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::product.product');
```

- [ ] **Step 4: Create `src/api/product/routes/product.ts`**

```ts
/**
 * product router.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::product.product');
```

- [ ] **Step 5: Create `src/api/product/services/product.ts`**

```ts
/**
 * product service.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::product.product');
```

- [ ] **Step 6: Modify `src/api/brand/content-types/brand/schema.json`** — add a `products` attribute after `logo`:

```json
{
  "kind": "collectionType",
  "collectionName": "brands",
  "info": {
    "singularName": "brand",
    "pluralName": "brands",
    "displayName": "Brand"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "name": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "name"
    },
    "logo": {
      "type": "media",
      "multiple": false,
      "required": false,
      "allowedTypes": ["images"]
    },
    "products": {
      "type": "relation",
      "relation": "oneToMany",
      "target": "api::product.product",
      "mappedBy": "brand"
    }
  }
}
```

- [ ] **Step 7: Modify `src/api/category/content-types/category/schema.json`** — add a `products` attribute after `image`:

```json
{
  "kind": "collectionType",
  "collectionName": "categories",
  "info": {
    "singularName": "category",
    "pluralName": "categories",
    "displayName": "Category"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "name": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "name"
    },
    "description": {
      "type": "text"
    },
    "image": {
      "type": "media",
      "multiple": false,
      "required": false,
      "allowedTypes": ["images"]
    },
    "products": {
      "type": "relation",
      "relation": "oneToMany",
      "target": "api::product.product",
      "mappedBy": "category"
    }
  }
}
```

- [ ] **Step 8: Modify `src/api/tag/content-types/tag/schema.json`** — add a `products` attribute after `slug`:

```json
{
  "kind": "collectionType",
  "collectionName": "tags",
  "info": {
    "singularName": "tag",
    "pluralName": "tags",
    "displayName": "Tag"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "name": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "name"
    },
    "products": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "api::product.product",
      "mappedBy": "tags"
    }
  }
}
```

- [ ] **Step 9: Restart Strapi and verify clean boot**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
rm -f .tmp/strapi-verify.log
npm run develop > .tmp/strapi-verify.log 2>&1 &
sleep 25
grep -c "Strapi started successfully" .tmp/strapi-verify.log
grep -c "\[ERROR\]" .tmp/strapi-verify.log
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
```
Expected: `1` then `0`.

- [ ] **Step 10: Confirm `products` table and relation link tables exist (GREEN)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log('products:', db.prepare(\"PRAGMA table_info(products)\").all().map(c=>c.name).join(','));
console.log('brand_lnk:', db.prepare(\"PRAGMA table_info(products_brand_lnk)\").all().map(c=>c.name).join(','));
console.log('category_lnk:', db.prepare(\"PRAGMA table_info(products_category_lnk)\").all().map(c=>c.name).join(','));
console.log('tags_lnk:', db.prepare(\"PRAGMA table_info(products_tags_lnk)\").all().map(c=>c.name).join(','));
console.log('cmps:', db.prepare(\"PRAGMA table_info(products_cmps)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected:
- `products:` includes `id,document_id,name,slug,base_price,variant_group_label,description,warranty` (plus standard columns)
- `brand_lnk:` → `id,product_id,brand_id,product_ord` (or similar ordering columns)
- `category_lnk:` → `id,product_id,category_id,product_ord`
- `tags_lnk:` → `id,product_id,tag_id,product_ord,tag_ord`
- `cmps:` → `id,entity_id,cmp_id,component_type,field,order` (join table for the `specs` and `seo` component fields)

---

### Task 7: `ProductVariant` content-type + wire reverse relation on Product

**Files:**
- Create: `src/api/product-variant/content-types/product-variant/schema.json`
- Create: `src/api/product-variant/controllers/product-variant.ts`
- Create: `src/api/product-variant/routes/product-variant.ts`
- Create: `src/api/product-variant/services/product-variant.ts`
- Modify: `src/api/product/content-types/product/schema.json` (add reverse `variants` relation)

**Interfaces:**
- Consumes: `ecommerce.color` (Task 2), `api::product.product` (Task 6).
- Produces: UID `api::product-variant.product-variant` with fields `product`, `sku`, `color`, `configLabel`, `price`, `compareAtPrice`, `available`, `stockQuantity`, `image`.

- [ ] **Step 1: Confirm table doesn't exist yet (RED)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(product_variants)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: empty string.

- [ ] **Step 2: Create `src/api/product-variant/content-types/product-variant/schema.json`**

```json
{
  "kind": "collectionType",
  "collectionName": "product_variants",
  "info": {
    "singularName": "product-variant",
    "pluralName": "product-variants",
    "displayName": "Product Variant"
  },
  "options": {
    "draftAndPublish": true
  },
  "pluginOptions": {},
  "attributes": {
    "product": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::product.product",
      "inversedBy": "variants"
    },
    "sku": {
      "type": "string",
      "required": true,
      "unique": true
    },
    "color": {
      "type": "component",
      "repeatable": false,
      "component": "ecommerce.color"
    },
    "configLabel": {
      "type": "string"
    },
    "price": {
      "type": "decimal",
      "required": true
    },
    "compareAtPrice": {
      "type": "decimal"
    },
    "available": {
      "type": "boolean",
      "default": true,
      "required": true
    },
    "stockQuantity": {
      "type": "integer"
    },
    "image": {
      "type": "media",
      "multiple": false,
      "required": false,
      "allowedTypes": ["images"]
    }
  }
}
```

- [ ] **Step 3: Create `src/api/product-variant/controllers/product-variant.ts`**

```ts
/**
 *  product-variant controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::product-variant.product-variant');
```

- [ ] **Step 4: Create `src/api/product-variant/routes/product-variant.ts`**

```ts
/**
 * product-variant router.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::product-variant.product-variant');
```

- [ ] **Step 5: Create `src/api/product-variant/services/product-variant.ts`**

```ts
/**
 * product-variant service.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::product-variant.product-variant');
```

- [ ] **Step 6: Modify `src/api/product/content-types/product/schema.json`** — add a `variants` attribute after `seo`:

```json
{
  "kind": "collectionType",
  "collectionName": "products",
  "info": {
    "singularName": "product",
    "pluralName": "products",
    "displayName": "Product"
  },
  "options": {
    "draftAndPublish": true
  },
  "pluginOptions": {},
  "attributes": {
    "name": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "name"
    },
    "brand": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::brand.brand",
      "inversedBy": "products"
    },
    "category": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::category.category",
      "inversedBy": "products"
    },
    "tags": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "api::tag.tag",
      "inversedBy": "products"
    },
    "basePrice": {
      "type": "decimal",
      "required": true
    },
    "variantGroupLabel": {
      "type": "string"
    },
    "specs": {
      "type": "component",
      "repeatable": true,
      "component": "ecommerce.spec"
    },
    "description": {
      "type": "richtext"
    },
    "warranty": {
      "type": "string"
    },
    "mainImage": {
      "type": "media",
      "multiple": false,
      "required": false,
      "allowedTypes": ["images"]
    },
    "gallery": {
      "type": "media",
      "multiple": true,
      "required": false,
      "allowedTypes": ["images"]
    },
    "seo": {
      "type": "component",
      "repeatable": false,
      "component": "shared.seo"
    },
    "variants": {
      "type": "relation",
      "relation": "oneToMany",
      "target": "api::product-variant.product-variant",
      "mappedBy": "product"
    }
  }
}
```

- [ ] **Step 7: Restart Strapi and verify clean boot**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
rm -f .tmp/strapi-verify.log
npm run develop > .tmp/strapi-verify.log 2>&1 &
sleep 25
grep -c "Strapi started successfully" .tmp/strapi-verify.log
grep -c "\[ERROR\]" .tmp/strapi-verify.log
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
```
Expected: `1` then `0`.

- [ ] **Step 8: Confirm `product_variants` table and relation link table exist (GREEN)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log('variants:', db.prepare(\"PRAGMA table_info(product_variants)\").all().map(c=>c.name).join(','));
console.log('product_lnk:', db.prepare(\"PRAGMA table_info(product_variants_product_lnk)\").all().map(c=>c.name).join(','));
console.log('cmps:', db.prepare(\"PRAGMA table_info(product_variants_cmps)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected:
- `variants:` includes `id,document_id,sku,config_label,price,compare_at_price,available,stock_quantity`
- `product_lnk:` → `id,product_variant_id,product_id,product_variant_ord`
- `cmps:` → `id,entity_id,cmp_id,component_type,field,order` (join table for the `color` component field)

---

### Task 8: Add `institutional` leaf components (no nested components)

**Files:**
- Create: `src/components/institutional/trust-badge.json`
- Create: `src/components/institutional/benefit.json`
- Create: `src/components/institutional/step.json`
- Create: `src/components/institutional/testimonial.json`
- Create: `src/components/institutional/banner.json`
- Create: `src/components/institutional/stat.json`
- Create: `src/components/institutional/link.json`

**Interfaces:**
- Consumes: nothing.
- Produces: components `institutional.trust-badge`, `institutional.benefit`, `institutional.step`, `institutional.testimonial`, `institutional.banner`, `institutional.stat`, `institutional.link` — `trust-badge` and `link` are consumed by the composite components in Task 9; `benefit`, `step`, `testimonial`, `banner` are consumed directly by `Homepage` (Task 10).

- [ ] **Step 1: Confirm tables don't exist yet (RED)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
for (const t of ['components_institutional_trust_badges','components_institutional_benefits','components_institutional_steps','components_institutional_testimonials','components_institutional_banners','components_institutional_stats','components_institutional_links']) {
  console.log(t + ':', db.prepare('PRAGMA table_info(' + t + ')').all().map(c=>c.name).join(','));
}
db.close();
"
```
Expected: all seven lines end with an empty value (`tablename: `).

- [ ] **Step 2: Create `src/components/institutional/trust-badge.json`**

```json
{
  "collectionName": "components_institutional_trust_badges",
  "info": {
    "displayName": "Trust Badge"
  },
  "options": {},
  "attributes": {
    "text": {
      "type": "string"
    }
  }
}
```

- [ ] **Step 3: Create `src/components/institutional/benefit.json`**

```json
{
  "collectionName": "components_institutional_benefits",
  "info": {
    "displayName": "Benefit"
  },
  "options": {},
  "attributes": {
    "icon": {
      "type": "string"
    },
    "title": {
      "type": "string"
    },
    "description": {
      "type": "text"
    }
  }
}
```

- [ ] **Step 4: Create `src/components/institutional/step.json`**

```json
{
  "collectionName": "components_institutional_steps",
  "info": {
    "displayName": "Step"
  },
  "options": {},
  "attributes": {
    "number": {
      "type": "string"
    },
    "title": {
      "type": "string"
    },
    "description": {
      "type": "text"
    }
  }
}
```

- [ ] **Step 5: Create `src/components/institutional/testimonial.json`**

```json
{
  "collectionName": "components_institutional_testimonials",
  "info": {
    "displayName": "Testimonial"
  },
  "options": {},
  "attributes": {
    "quote": {
      "type": "text"
    },
    "authorName": {
      "type": "string"
    },
    "authorLocation": {
      "type": "string"
    }
  }
}
```

- [ ] **Step 6: Create `src/components/institutional/banner.json`**

```json
{
  "collectionName": "components_institutional_banners",
  "info": {
    "displayName": "Banner"
  },
  "options": {},
  "attributes": {
    "headline": {
      "type": "string"
    },
    "text": {
      "type": "text"
    },
    "buttonLabel": {
      "type": "string"
    },
    "buttonLink": {
      "type": "string"
    }
  }
}
```

- [ ] **Step 7: Create `src/components/institutional/stat.json`**

```json
{
  "collectionName": "components_institutional_stats",
  "info": {
    "displayName": "Stat"
  },
  "options": {},
  "attributes": {
    "value": {
      "type": "string"
    },
    "label": {
      "type": "string"
    }
  }
}
```

- [ ] **Step 8: Create `src/components/institutional/link.json`**

```json
{
  "collectionName": "components_institutional_links",
  "info": {
    "displayName": "Link"
  },
  "options": {},
  "attributes": {
    "label": {
      "type": "string"
    },
    "url": {
      "type": "string"
    }
  }
}
```

- [ ] **Step 9: Restart Strapi and verify clean boot**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
rm -f .tmp/strapi-verify.log
npm run develop > .tmp/strapi-verify.log 2>&1 &
sleep 25
grep -c "Strapi started successfully" .tmp/strapi-verify.log
grep -c "\[ERROR\]" .tmp/strapi-verify.log
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
```
Expected: `1` then `0`.

- [ ] **Step 10: Confirm all seven tables now exist (GREEN)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
for (const t of ['components_institutional_trust_badges','components_institutional_benefits','components_institutional_steps','components_institutional_testimonials','components_institutional_banners','components_institutional_stats','components_institutional_links']) {
  console.log(t + ':', db.prepare('PRAGMA table_info(' + t + ')').all().map(c=>c.name).join(','));
}
db.close();
"
```
Expected:
- `components_institutional_trust_badges:` → `id,text`
- `components_institutional_benefits:` → `id,icon,title,description`
- `components_institutional_steps:` → `id,number,title,description`
- `components_institutional_testimonials:` → `id,quote,author_name,author_location`
- `components_institutional_banners:` → `id,headline,text,button_label,button_link`
- `components_institutional_stats:` → `id,value,label`
- `components_institutional_links:` → `id,label,url`

---

### Task 9: Add `institutional` composite components (`hero`, `link-column`)

**Files:**
- Create: `src/components/institutional/hero.json`
- Create: `src/components/institutional/link-column.json`

**Interfaces:**
- Consumes: `institutional.trust-badge` and `institutional.link` (Task 8).
- Produces: components `institutional.hero` and `institutional.link-column` — consumed by `Homepage.hero` (Task 10) and `SiteSettings.footerLinkColumns` (Task 11) respectively.

- [ ] **Step 1: Confirm tables don't exist yet (RED)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log('heroes:', db.prepare(\"PRAGMA table_info(components_institutional_heroes)\").all().map(c=>c.name).join(','));
console.log('link_columns:', db.prepare(\"PRAGMA table_info(components_institutional_link_columns)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: both empty.

- [ ] **Step 2: Create `src/components/institutional/hero.json`**

```json
{
  "collectionName": "components_institutional_heroes",
  "info": {
    "displayName": "Hero"
  },
  "options": {},
  "attributes": {
    "eyebrow": {
      "type": "string"
    },
    "headline": {
      "type": "string"
    },
    "subtext": {
      "type": "text"
    },
    "ctaLabel": {
      "type": "string"
    },
    "ctaLink": {
      "type": "string"
    },
    "secondaryCtaLabel": {
      "type": "string"
    },
    "secondaryCtaLink": {
      "type": "string"
    },
    "trustBadges": {
      "type": "component",
      "repeatable": true,
      "component": "institutional.trust-badge"
    }
  }
}
```

- [ ] **Step 3: Create `src/components/institutional/link-column.json`**

```json
{
  "collectionName": "components_institutional_link_columns",
  "info": {
    "displayName": "Link Column"
  },
  "options": {},
  "attributes": {
    "title": {
      "type": "string"
    },
    "links": {
      "type": "component",
      "repeatable": true,
      "component": "institutional.link"
    }
  }
}
```

- [ ] **Step 4: Restart Strapi and verify clean boot**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
rm -f .tmp/strapi-verify.log
npm run develop > .tmp/strapi-verify.log 2>&1 &
sleep 25
grep -c "Strapi started successfully" .tmp/strapi-verify.log
grep -c "\[ERROR\]" .tmp/strapi-verify.log
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
```
Expected: `1` then `0`.

- [ ] **Step 5: Confirm both tables now exist (GREEN)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log('heroes:', db.prepare(\"PRAGMA table_info(components_institutional_heroes)\").all().map(c=>c.name).join(','));
console.log('link_columns:', db.prepare(\"PRAGMA table_info(components_institutional_link_columns)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected:
- `heroes:` → `id,eyebrow,headline,subtext,cta_label,cta_link,secondary_cta_label,secondary_cta_link`
- `link_columns:` → `id,title`

---

### Task 10: `Homepage` single-type

**Files:**
- Create: `src/api/homepage/content-types/homepage/schema.json`
- Create: `src/api/homepage/controllers/homepage.ts`
- Create: `src/api/homepage/routes/homepage.ts`
- Create: `src/api/homepage/services/homepage.ts`

**Interfaces:**
- Consumes: `institutional.hero`, `institutional.benefit`, `institutional.step`, `institutional.testimonial`, `institutional.banner` (Tasks 8–9).
- Produces: UID `api::homepage.homepage` (single-type) with fields `hero`, `benefits`, `steps`, `testimonials`, `whatsappBanner`.

- [ ] **Step 1: Confirm table doesn't exist yet (RED)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(homepage)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: empty string.

- [ ] **Step 2: Create `src/api/homepage/content-types/homepage/schema.json`**

```json
{
  "kind": "singleType",
  "collectionName": "homepage",
  "info": {
    "singularName": "homepage",
    "pluralName": "homepages",
    "displayName": "Homepage"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "hero": {
      "type": "component",
      "repeatable": false,
      "component": "institutional.hero"
    },
    "benefits": {
      "type": "component",
      "repeatable": true,
      "component": "institutional.benefit"
    },
    "steps": {
      "type": "component",
      "repeatable": true,
      "component": "institutional.step"
    },
    "testimonials": {
      "type": "component",
      "repeatable": true,
      "component": "institutional.testimonial"
    },
    "whatsappBanner": {
      "type": "component",
      "repeatable": false,
      "component": "institutional.banner"
    }
  }
}
```

- [ ] **Step 3: Create `src/api/homepage/controllers/homepage.ts`**

```ts
/**
 *  homepage controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::homepage.homepage');
```

- [ ] **Step 4: Create `src/api/homepage/routes/homepage.ts`**

```ts
/**
 * homepage router.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::homepage.homepage');
```

- [ ] **Step 5: Create `src/api/homepage/services/homepage.ts`**

```ts
/**
 * homepage service.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::homepage.homepage');
```

- [ ] **Step 6: Restart Strapi and verify clean boot**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
rm -f .tmp/strapi-verify.log
npm run develop > .tmp/strapi-verify.log 2>&1 &
sleep 25
grep -c "Strapi started successfully" .tmp/strapi-verify.log
grep -c "\[ERROR\]" .tmp/strapi-verify.log
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
```
Expected: `1` then `0`.

- [ ] **Step 7: Confirm table and its component join table now exist (GREEN)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log('homepage:', db.prepare(\"PRAGMA table_info(homepage)\").all().map(c=>c.name).join(','));
console.log('cmps:', db.prepare(\"PRAGMA table_info(homepage_cmps)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: `homepage:` includes `id,document_id` (plus standard columns); `cmps:` → `id,entity_id,cmp_id,component_type,field,order`.

---

### Task 11: `SiteSettings` single-type

**Files:**
- Create: `src/api/site-setting/content-types/site-setting/schema.json`
- Create: `src/api/site-setting/controllers/site-setting.ts`
- Create: `src/api/site-setting/routes/site-setting.ts`
- Create: `src/api/site-setting/services/site-setting.ts`

**Interfaces:**
- Consumes: `institutional.link-column` (Task 9), `institutional.stat` (Task 8), `shared.seo` (pre-existing).
- Produces: UID `api::site-setting.site-setting` (single-type) with fields `whatsappNumber`, `showTopBar`, `topBarText`, `showFab`, `footerTagline`, `footerLinkColumns`, `footerLegalText`, `contactEmail`, `contactAddress`, `contactHours`, `aboutEyebrow`, `aboutHeadline`, `aboutText`, `aboutStats`, `aboutImage`, `defaultSeo`.

- [ ] **Step 1: Confirm table doesn't exist yet (RED)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(site_settings)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: empty string.

- [ ] **Step 2: Create `src/api/site-setting/content-types/site-setting/schema.json`**

```json
{
  "kind": "singleType",
  "collectionName": "site_settings",
  "info": {
    "singularName": "site-setting",
    "pluralName": "site-settings",
    "displayName": "Site Settings"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "whatsappNumber": {
      "type": "string",
      "required": true
    },
    "showTopBar": {
      "type": "boolean",
      "default": true
    },
    "topBarText": {
      "type": "string"
    },
    "showFab": {
      "type": "boolean",
      "default": true
    },
    "footerTagline": {
      "type": "text"
    },
    "footerLinkColumns": {
      "type": "component",
      "repeatable": true,
      "component": "institutional.link-column"
    },
    "footerLegalText": {
      "type": "text"
    },
    "contactEmail": {
      "type": "string"
    },
    "contactAddress": {
      "type": "string"
    },
    "contactHours": {
      "type": "string"
    },
    "aboutEyebrow": {
      "type": "string"
    },
    "aboutHeadline": {
      "type": "string"
    },
    "aboutText": {
      "type": "richtext"
    },
    "aboutStats": {
      "type": "component",
      "repeatable": true,
      "component": "institutional.stat"
    },
    "aboutImage": {
      "type": "media",
      "multiple": false,
      "required": false,
      "allowedTypes": ["images"]
    },
    "defaultSeo": {
      "type": "component",
      "repeatable": false,
      "component": "shared.seo"
    }
  }
}
```

- [ ] **Step 3: Create `src/api/site-setting/controllers/site-setting.ts`**

```ts
/**
 *  site-setting controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::site-setting.site-setting');
```

- [ ] **Step 4: Create `src/api/site-setting/routes/site-setting.ts`**

```ts
/**
 * site-setting router.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::site-setting.site-setting');
```

- [ ] **Step 5: Create `src/api/site-setting/services/site-setting.ts`**

```ts
/**
 * site-setting service.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::site-setting.site-setting');
```

- [ ] **Step 6: Restart Strapi and verify clean boot**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
rm -f .tmp/strapi-verify.log
npm run develop > .tmp/strapi-verify.log 2>&1 &
sleep 25
grep -c "Strapi started successfully" .tmp/strapi-verify.log
grep -c "\[ERROR\]" .tmp/strapi-verify.log
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
```
Expected: `1` then `0`.

- [ ] **Step 7: Confirm table has the expected scalar columns (GREEN)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(site_settings)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: includes `id,document_id,whatsapp_number,show_top_bar,top_bar_text,show_fab,footer_tagline,footer_legal_text,contact_email,contact_address,contact_hours,about_eyebrow,about_headline,about_text`.

---

### Task 12: `Faq` collection-type

**Files:**
- Create: `src/api/faq/content-types/faq/schema.json`
- Create: `src/api/faq/controllers/faq.ts`
- Create: `src/api/faq/routes/faq.ts`
- Create: `src/api/faq/services/faq.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: UID `api::faq.faq` with fields `question`, `answer`, `order`.

- [ ] **Step 1: Confirm table doesn't exist yet (RED)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(faqs)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: empty string.

- [ ] **Step 2: Create `src/api/faq/content-types/faq/schema.json`**

```json
{
  "kind": "collectionType",
  "collectionName": "faqs",
  "info": {
    "singularName": "faq",
    "pluralName": "faqs",
    "displayName": "FAQ"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "question": {
      "type": "string",
      "required": true
    },
    "answer": {
      "type": "richtext",
      "required": true
    },
    "order": {
      "type": "integer"
    }
  }
}
```

- [ ] **Step 3: Create `src/api/faq/controllers/faq.ts`**

```ts
/**
 *  faq controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::faq.faq');
```

- [ ] **Step 4: Create `src/api/faq/routes/faq.ts`**

```ts
/**
 * faq router.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::faq.faq');
```

- [ ] **Step 5: Create `src/api/faq/services/faq.ts`**

```ts
/**
 * faq service.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::faq.faq');
```

- [ ] **Step 6: Restart Strapi and verify clean boot**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
rm -f .tmp/strapi-verify.log
npm run develop > .tmp/strapi-verify.log 2>&1 &
sleep 25
grep -c "Strapi started successfully" .tmp/strapi-verify.log
grep -c "\[ERROR\]" .tmp/strapi-verify.log
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
```
Expected: `1` then `0`.

- [ ] **Step 7: Confirm table now exists (GREEN)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(faqs)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: includes `id,document_id,question,answer,order`.

---

### Task 13: `Policy` collection-type

**Files:**
- Create: `src/api/policy/content-types/policy/schema.json`
- Create: `src/api/policy/controllers/policy.ts`
- Create: `src/api/policy/routes/policy.ts`
- Create: `src/api/policy/services/policy.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: UID `api::policy.policy` with fields `title`, `slug`, `body`.

- [ ] **Step 1: Confirm table doesn't exist yet (RED)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(policies)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: empty string.

- [ ] **Step 2: Create `src/api/policy/content-types/policy/schema.json`**

```json
{
  "kind": "collectionType",
  "collectionName": "policies",
  "info": {
    "singularName": "policy",
    "pluralName": "policies",
    "displayName": "Policy"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "title": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "title"
    },
    "body": {
      "type": "richtext",
      "required": true
    }
  }
}
```

- [ ] **Step 3: Create `src/api/policy/controllers/policy.ts`**

```ts
/**
 *  policy controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::policy.policy');
```

- [ ] **Step 4: Create `src/api/policy/routes/policy.ts`**

```ts
/**
 * policy router.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::policy.policy');
```

- [ ] **Step 5: Create `src/api/policy/services/policy.ts`**

```ts
/**
 * policy service.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::policy.policy');
```

- [ ] **Step 6: Restart Strapi and verify clean boot**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
rm -f .tmp/strapi-verify.log
npm run develop > .tmp/strapi-verify.log 2>&1 &
sleep 25
grep -c "Strapi started successfully" .tmp/strapi-verify.log
grep -c "\[ERROR\]" .tmp/strapi-verify.log
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
```
Expected: `1` then `0`.

- [ ] **Step 7: Confirm table now exists (GREEN)**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
console.log(db.prepare(\"PRAGMA table_info(policies)\").all().map(c=>c.name).join(','));
db.close();
"
```
Expected: includes `id,document_id,title,slug,body`.

---

### Task 14: Full-system verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything built in Tasks 1–13.
- Produces: confirmation that all 9 content-types + 11 components coexist cleanly and the REST API for each is reachable.

- [ ] **Step 1: Restart Strapi and verify clean boot**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
rm -f .tmp/strapi-verify.log
npm run develop > .tmp/strapi-verify.log 2>&1 &
sleep 30
grep -c "Strapi started successfully" .tmp/strapi-verify.log
grep -c "\[ERROR\]" .tmp/strapi-verify.log
```
Expected: `1` then `0`. **Leave Strapi running** for the next step (do not stop it).

- [ ] **Step 2: Confirm every expected table exists in one pass**

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const Database = require('better-sqlite3');
const db = new Database('.tmp/data.db');
const expected = [
  'brands','categories','tags','products','product_variants',
  'homepage','site_settings','faqs','policies',
  'components_ecommerce_specs','components_ecommerce_colors',
  'components_institutional_trust_badges','components_institutional_benefits',
  'components_institutional_steps','components_institutional_testimonials',
  'components_institutional_banners','components_institutional_stats',
  'components_institutional_links','components_institutional_heroes',
  'components_institutional_link_columns'
];
const existing = new Set(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map(r => r.name));
const missing = expected.filter(t => !existing.has(t));
console.log('missing:', missing.length === 0 ? 'none' : missing.join(','));
db.close();
"
```
Expected: `missing: none`.

- [ ] **Step 3: Confirm the Content-Type Builder lists all 9 content-types via the admin API**

The Strapi admin API requires an authenticated session cookie, which this plan's execution environment does not have (the project owner logs in manually). Instead, confirm indirectly through the public content-type schema file Strapi generates at boot:

```bash
cd "C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api"
node -e "
const fs = require('fs');
const schema = JSON.parse(fs.readFileSync('.strapi/types/generated/contentTypes.d.ts', 'utf-8').includes('ApiBrandBrand') ? '\"ok\"' : '\"missing\"');
console.log(schema);
" 2>&1 || echo "TYPES_FILE_CHECK_SKIPPED"
```
If `.strapi/types/generated/contentTypes.d.ts` exists, expect it to contain the interfaces `ApiBrandBrand`, `ApiCategoryCategory`, `ApiTagTag`, `ApiProductProduct`, `ApiProductVariantProductVariant`, `ApiHomepageHomepage`, `ApiSiteSettingSiteSetting`, `ApiFaqFaq`, `ApiPolicyPolicy`. A simpler manual check: open the file and confirm those 9 names appear.

- [ ] **Step 4: Stop Strapi**

```bash
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" > /dev/null 2>&1
```

- [ ] **Step 5: Report done**

At this point the content model matches every section of `docs/superpowers/specs/2026-07-13-ecommerce-content-types-design.md`. Next steps (not part of this plan): the project owner populates real data through the Strapi admin UI at `http://localhost:1337/admin`, and set up Users & Permissions (`Settings → Roles → Public`) to allow the frontend to read `Product`, `ProductVariant`, `Brand`, `Category`, `Tag`, `Homepage`, `SiteSettings`, `Faq`, `Policy` over the public REST API.

---

## Self-Review Notes

- **Spec coverage:** every content-type/component/cleanup item from the design doc has exactly one task (Tasks 1–13); Task 14 is a final cross-cutting check. The `Product`/`ProductVariant` split, the `available`+`stockQuantity` dual-field stock design, and the plain-string `ctaLink`/`buttonLink` convention are all carried through verbatim from the spec.
- **Placeholder scan:** no TBD/TODO; every step has full file contents or full commands with concrete expected output.
- **Type consistency:** field names are used identically across tasks — e.g. `ProductVariant.product` (Task 7 Step 2) declares `inversedBy: "product"`... rather, precisely: `ProductVariant.product` (Task 7 Step 2, `relation: manyToOne, inversedBy: "variants"`) pairs correctly with `Product.variants` (Task 7 Step 6, `relation: oneToMany, mappedBy: "product"`) — same field names (`variants` / `product`) used on both sides. Likewise `institutional.hero`'s `trustBadges` (Task 9) matches the component name `institutional.trust-badge` created in Task 8; `SiteSettings.footerLinkColumns` (Task 11) matches `institutional.link-column` (Task 9), which in turn matches `institutional.link` (Task 8).
