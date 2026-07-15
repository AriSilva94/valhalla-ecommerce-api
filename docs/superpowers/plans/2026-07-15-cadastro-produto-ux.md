# Cadastro de Produto Simplificado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastro completo de produto (com variações) em uma única tela do Strapi admin, em PT-BR, sem o usuário digitar SKU, hex, slug ou SEO.

**Architecture:** Variantes deixam de ser collection type e viram componente repetível dentro de Product. Lifecycles preenchem SKU/SEO/slug quando vazios. Bootstrap seeda a configuração de views do content-manager (labels PT-BR, slug oculto, ordem de campos) de forma idempotente via core store. Frontend Next.js só ajusta tipos e populate.

**Tech Stack:** Strapi 5.50.1 (TypeScript), `@strapi/plugin-color-picker` (oficial), vitest (testes de helpers puros), Next.js (`valhalla-ecommerce`).

**Spec:** `docs/superpowers/specs/2026-07-15-cadastro-produto-ux-design.md`

## Global Constraints

- Repositório backend: `C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api` (todos os paths relativos abaixo são deste repo, exceto Task 6).
- Repositório frontend: `C:\Users\ariov\Desktop\projetos\valhalla-ecommerce`.
- Strapi `5.50.1` — não fazer upgrade de versão.
- Dados atuais são de teste: **sem migração de dados**; collection `product-variant` é deletada.
- Seed de view-config deve ser **idempotente e não-destrutivo** (marker de versão no core store; ajustes manuais posteriores no admin não são sobrescritos).
- Todo texto visível ao usuário do admin em PT-BR.
- Frontend: shape TS `ProductVariant.color = {name, hex}` é preservado (zero mudança em componentes React).

---

### Task 1: Plugin color-picker + admin em pt-BR

**Files:**
- Modify: `package.json` (dependência nova)
- Create: `src/admin/app.tsx`

**Interfaces:**
- Produces: custom field `plugin::color-picker.color` disponível para schemas (Task 2); admin com locale pt-BR.

- [x] **Step 1: Instalar plugin oficial**

```bash
cd C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api
npm info @strapi/plugin-color-picker version   # confirmar que existe e é compatível com Strapi 5
npm install @strapi/plugin-color-picker
```

Expected: instalação sem erro. Se `npm info` mostrar que o pacote não suporta Strapi 5.x, PARAR e reportar (não substituir por plugin de comunidade sem aprovação).

- [x] **Step 2: Criar `src/admin/app.tsx`**

```tsx
import type { StrapiApp } from '@strapi/strapi/admin';

export default {
  config: {
    locales: ['pt-BR'],
    translations: {
      'pt-BR': {
        'app.components.LeftMenu.navbrand.title': 'Valhalla',
        'app.components.LeftMenu.navbrand.workplace': 'Painel da loja',
      },
    },
  },
  bootstrap(_app: StrapiApp) {},
};
```

- [x] **Step 3: Verificar boot**

```bash
npm run develop
```

Expected: admin compila e sobe sem erro. No admin, em perfil do usuário, idioma "Português (Brasil)" disponível; selecionar e conferir menus em PT-BR.

- [x] **Step 4: Commit**

```bash
git add package.json package-lock.json src/admin/app.tsx
git commit -m "feat: plugin color-picker e admin em pt-BR"
```

---

### Task 2: Variante vira componente repetível

**Files:**
- Create: `src/components/ecommerce/variant.json`
- Modify: `src/api/product/content-types/product/schema.json`
- Modify: `src/components/shared/seo.json` (required → false)
- Modify: `src/index.ts` (remover product-variant de PUBLIC_READ)
- Delete: `src/api/product-variant/` (pasta inteira)
- Delete: `src/components/ecommerce/color.json`

**Interfaces:**
- Consumes: custom field `plugin::color-picker.color` (Task 1).
- Produces: componente `ecommerce.variant` com campos `sku`, `colorName`, `colorHex`, `configLabel`, `price`, `compareAtPrice`, `available`, `stockQuantity`, `image`. `Product.variants` = repeatable component obrigatório (min 1). Tasks 3, 5 e 6 dependem desses nomes exatos.

- [x] **Step 1: Criar `src/components/ecommerce/variant.json`**

```json
{
  "collectionName": "components_ecommerce_variants",
  "info": {
    "displayName": "Variação",
    "description": "Variação de produto (cor/configuração) com preço próprio"
  },
  "options": {},
  "attributes": {
    "sku": {
      "type": "string"
    },
    "colorName": {
      "type": "string"
    },
    "colorHex": {
      "type": "customField",
      "customField": "plugin::color-picker.color",
      "options": {
        "format": "hex"
      }
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

- [x] **Step 2: Atualizar `src/api/product/content-types/product/schema.json`** — substituir o atributo `variants` (relação) por componente:

```json
"variants": {
  "type": "component",
  "repeatable": true,
  "component": "ecommerce.variant",
  "required": true,
  "min": 1
}
```

(Manter todos os demais atributos como estão.)

- [x] **Step 3: `src/components/shared/seo.json`** — trocar `"required": true` por `"required": false` em `metaTitle` e `metaDescription` (lifecycle preencherá; obrigatório travaria o form quando usuário adiciona o componente sem preencher).

- [x] **Step 4: Deletar collection antiga e componente color**

```powershell
Remove-Item -Recurse -Force src\api\product-variant
Remove-Item -Force src\components\ecommerce\color.json
```

- [x] **Step 5: `src/index.ts`** — remover a linha de PUBLIC_READ:

```ts
'api::product-variant.product-variant': ['find', 'findOne'],
```

- [x] **Step 6: Verificar boot e API**

```bash
npm run develop
```

Expected: sobe sem erro (banco sqlite local recria estruturas; dados de variantes antigos são perdidos — esperado). No admin: Content-Type "Product" mostra campo "Variações" repetível inline com color picker. Criar 1 produto de teste com 2 variações preenchendo só cor, preço.

```bash
curl "http://localhost:1337/api/products?populate[variants][populate]=image"
```

Expected: HTTP 200, produto com array `variants` contendo `colorName`, `colorHex`, `price`.

- [x] **Step 7: Commit**

```bash
git add -A src/
git commit -m "feat: variantes como componente repetivel no produto"
```

---

### Task 3: Middleware — SKU, slug e SEO automáticos

**Files:**
- Create: `src/utils/product-autofill.ts`
- Create: `src/utils/__tests__/product-autofill.test.ts`
- Create: `src/utils/__tests__/product-autofill-middleware.test.ts`
- Create: `src/utils/product-autofill-middleware.ts`
- Modify: `src/index.ts`
- Modify: `package.json` (vitest + script test)

**Interfaces:**
- Consumes: nomes de campos de `ecommerce.variant` (Task 2): `sku`, `colorName`, `configLabel`.
- Produces: `slugify(text: string): string`, `fillVariantSkus<T>(productSlug: string, variants: T[], reservedSkus?: Iterable<string>): T[]`, `buildSeoDefaults(name: string, description: string | null | undefined, existing?: { metaTitle?: string | null; metaDescription?: string | null } | null): { metaTitle: string; metaDescription: string }` e `autofillProductData(data, existing?, reservedSkus?)`.

- [x] **Step 1: Instalar vitest e adicionar script**

```bash
npm install --save-dev vitest
```

Em `package.json`, adicionar em `scripts`: `"test": "vitest run"`.

- [x] **Step 2: Escrever testes que falham — `src/utils/__tests__/product-autofill.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { slugify, fillVariantSkus, buildSeoDefaults } from '../product-autofill';

describe('slugify', () => {
  it('remove acentos, minúsculas, hífens', () => {
    expect(slugify('Cadeira Gamer Épica 220V')).toBe('cadeira-gamer-epica-220v');
  });
  it('colapsa separadores repetidos e bordas', () => {
    expect(slugify('  Aço -- Inox!  ')).toBe('aco-inox');
  });
});

describe('fillVariantSkus', () => {
  it('gera SKU de slug + cor + índice quando vazio', () => {
    const out = fillVariantSkus('cadeira-gamer', [
      { sku: '', colorName: 'Preto Fosco', configLabel: '' },
      { sku: null as any, colorName: 'Azul', configLabel: '' },
    ]);
    expect(out[0].sku).toBe('CADEIRA-GAMER-PRETO-FOSCO-1');
    expect(out[1].sku).toBe('CADEIRA-GAMER-AZUL-2');
  });
  it('usa configLabel quando não há cor, e VAR como fallback', () => {
    const out = fillVariantSkus('mesa', [
      { sku: '', colorName: '', configLabel: '128GB' },
      { sku: '', colorName: '', configLabel: '' },
    ]);
    expect(out[0].sku).toBe('MESA-128GB-1');
    expect(out[1].sku).toBe('MESA-VAR-2');
  });
  it('preserva SKU preenchido pelo usuário e evita duplicata', () => {
    const out = fillVariantSkus('mesa', [
      { sku: 'MEU-CODIGO', colorName: 'Preto', configLabel: '' },
      { sku: 'MEU-CODIGO', colorName: 'Azul', configLabel: '' },
    ]);
    expect(out[0].sku).toBe('MEU-CODIGO');
    expect(out[1].sku).toBe('MEU-CODIGO-2');
  });
});

describe('buildSeoDefaults', () => {
  it('usa nome como metaTitle truncado em 60', () => {
    const seo = buildSeoDefaults('Produto X', 'Descrição simples.');
    expect(seo.metaTitle).toBe('Produto X');
  });
  it('remove markdown e trunca descrição em 155 chars', () => {
    const md = '# Título\n\n**Negrito** e [link](http://x.com). ' + 'a'.repeat(300);
    const seo = buildSeoDefaults('P', md);
    expect(seo.metaDescription.length).toBeLessThanOrEqual(155);
    expect(seo.metaDescription).not.toContain('#');
    expect(seo.metaDescription).not.toContain('**');
    expect(seo.metaDescription).not.toContain('](');
  });
  it('não sobrescreve valores existentes', () => {
    const seo = buildSeoDefaults('P', 'desc', { metaTitle: 'Manual', metaDescription: '' });
    expect(seo.metaTitle).toBe('Manual');
    expect(seo.metaDescription).toBe('desc');
  });
});
```

- [x] **Step 3: Rodar e ver falhar**

```bash
npx vitest run
```

Expected: FAIL — módulo `../product-autofill` não existe.

- [x] **Step 4: Implementar `src/utils/product-autofill.ts`**

```ts
const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function slugify(text: string): string {
  return stripAccents(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface VariantLike {
  sku?: string | null;
  colorName?: string | null;
  configLabel?: string | null;
}

export function fillVariantSkus<T extends VariantLike>(productSlug: string, variants: T[]): T[] {
  const used = new Set<string>();
  const unique = (base: string): string => {
    let sku = base;
    let n = 2;
    while (used.has(sku)) sku = `${base}-${n++}`;
    used.add(sku);
    return sku;
  };

  return variants.map((v, i) => {
    if (v.sku && v.sku.trim()) {
      return { ...v, sku: unique(v.sku.trim()) };
    }
    const part = slugify(v.colorName || v.configLabel || 'var').toUpperCase() || 'VAR';
    const base = `${productSlug.toUpperCase()}-${part}-${i + 1}`;
    return { ...v, sku: unique(base) };
  });
}

function stripMarkdown(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links e imagens
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

export function buildSeoDefaults(
  name: string,
  description: string | null | undefined,
  existing?: { metaTitle?: string | null; metaDescription?: string | null } | null
): { metaTitle: string; metaDescription: string } {
  const metaTitle =
    existing?.metaTitle && existing.metaTitle.trim()
      ? existing.metaTitle
      : truncate(name, 60);
  const metaDescription =
    existing?.metaDescription && existing.metaDescription.trim()
      ? existing.metaDescription
      : truncate(stripMarkdown(description || ''), 155);
  return { metaTitle, metaDescription };
}
```

- [x] **Step 5: Rodar testes**

```bash
npx vitest run
```

Expected: PASS (14 testes: os 8 originais, 1 de colisão de SKU reservado, 4 de criação/update parcial e 1 de serialização assíncrona no middleware).

- [x] **Step 6: Criar e registrar `src/utils/product-autofill-middleware.ts`**

Trecho simplificado do registro (helpers puros, carregamento de estado e coleta de SKUs ficam no mesmo módulo):

```ts
import type { Core } from '@strapi/strapi';

import { buildSeoDefaults, fillVariantSkus, slugify } from './product-autofill';

export function registerProductAutofill(strapi: Core.Strapi): void {
  strapi.documents.use(async (context, next) => {
    if (context.uid !== 'api::product.product') return next();
    if (
      context.action !== 'create' &&
      context.action !== 'update' &&
      context.action !== 'clone'
    ) {
      return next();
    }

    return serializeProductWrite(async () => {
      // create/update: carrega estado quando necessário e transforma o patch cru.
      // clone: carrega a fonte, remove IDs de componentes e reserva também os SKUs da fonte.
      return next();
    });
  });
}
```

Em `src/index.ts`, chamar `registerProductAutofill(strapi)` dentro de `register({ strapi })`.

Nota: no Strapi 5, componentes são resolvidos antes dos database lifecycles; o middleware do Document Service preserva o payload cru necessário para preencher variantes e SEO.

No update, o middleware carrega o draft persistido por `documentId`/locale (com fallback para published) para distinguir campo omitido de campo vazio. Antes de preencher variantes em create/update/clone, consulta via Document Service os SKUs das versões draft/published. Update exclui o próprio `documentId`; clone inclui a fonte, regenera os SKUs e remove IDs dos componentes reinjetados.

As actions de escrita Product (`create`, `update` e `clone`) são serializadas por uma fila module-scoped desde antes da consulta de SKUs até `await next()` concluir. A garantia vale por instância/processo; um deploy com múltiplas réplicas exigiria lock distribuído, fora do plano e do deploy atual.

Nota: unicidade global de SKU é aplicada reservando os SKUs já persistidos; SKUs gerados também usam o slug único como prefixo. Título SEO usa apenas o nome (marca chega como shape de relação instável no payload — fora do autofill).

- [x] **Step 7: Verificação manual**

```bash
npm run develop
```

No admin: criar produto "Teste Lifecycle" com 2 variações (só cor + preço), sem tocar em SKU/SEO. Salvar e publicar. Conferir via:

```bash
curl "http://localhost:1337/api/products?filters[slug][$eq]=teste-lifecycle&populate[variants]=true&populate[seo]=true"
```

Expected: `slug: "teste-lifecycle"`, variantes com `sku` `TESTE-LIFECYCLE-...-1/2`, `seo.metaTitle` = nome.

Clonar um produto mantém o SKU da fonte intacto, cria novos IDs de componente e atribui sufixo incremental ao SKU do clone; fonte e clone publicados devem refletir esses valores na REST API.

- [x] **Step 8: Commit**

```bash
git add package.json package-lock.json src/utils/ src/index.ts docs/superpowers/plans/2026-07-15-cadastro-produto-ux.md
git commit -m "feat: autofill de slug, SKU e SEO via lifecycles do produto"
```

---

### Task 4: Schemas com displayName/description em PT-BR

**Files:**
- Modify: `src/api/product/content-types/product/schema.json`
- Modify: `src/api/brand/content-types/brand/schema.json`
- Modify: `src/api/category/content-types/category/schema.json`
- Modify: `src/api/tag/content-types/tag/schema.json`
- Modify: `src/api/faq/content-types/faq/schema.json`
- Modify: `src/api/policy/content-types/policy/schema.json`
- Modify: `src/api/homepage/content-types/homepage/schema.json`
- Modify: `src/api/site-setting/content-types/site-setting/schema.json`
- Modify: `src/components/ecommerce/spec.json`, `src/components/shared/seo.json`

**Interfaces:**
- Produces: nomes exibidos no menu do Content Manager em PT-BR. **Não alterar** `singularName`, `pluralName` nem `collectionName` (quebraria rotas de API e banco).

- [x] **Step 1: Editar somente o bloco `info` de cada schema** (`displayName` e `description`):

| Arquivo | displayName | description |
|---|---|---|
| product | `Produto` | `Produtos da loja, com variações, imagens e preços` |
| brand | `Marca` | `Marcas dos produtos` |
| category | `Categoria` | `Categorias de navegação da loja` |
| tag | `Etiqueta` | `Etiquetas para filtrar/agrupar produtos` |
| faq | `Pergunta Frequente` | `Perguntas e respostas da página de FAQ` |
| policy | `Política` | `Políticas da loja (trocas, privacidade etc.)` |
| homepage | `Página Inicial` | `Conteúdo da página inicial` |
| site-setting | `Configurações do Site` | `WhatsApp, rodapé, contato e textos institucionais` |
| ecommerce/spec.json | `Especificação` | `Par característica → valor` |
| shared/seo.json | `SEO` | `Título e descrição para buscadores — preenchido automaticamente se vazio` |

Exemplo (product):

```json
"info": {
  "singularName": "product",
  "pluralName": "products",
  "displayName": "Produto",
  "description": "Produtos da loja, com variações, imagens e preços"
}
```

- [x] **Step 2: Verificar boot**

```bash
npm run develop
```

Expected: menu Content Manager mostra "Produto", "Marca", "Categoria" etc.

- [x] **Step 3: Commit**

```bash
git add src/api src/components
git commit -m "feat: displayName dos content types em pt-BR"
```

---

### Task 5: Seed idempotente das views do admin (labels, ajuda, slug oculto, list view)

**Files:**
- Create: `src/utils/admin-view-seed.ts`
- Modify: `src/index.ts` (chamar seed no bootstrap)

**Interfaces:**
- Consumes: campos de `ecommerce.variant` (Task 2) e schemas PT-BR (Task 4).
- Produces: `seedAdminViews(strapi: Core.Strapi): Promise<void>` chamada no bootstrap.

**Mecânica:** configurações de view ficam no core store (`strapi::core-store`), chaves `plugin_content_manager_configuration_content_types::<uid>` e `plugin_content_manager_configuration_components::<uid>`, valor JSON `{ settings, metadatas, layouts }`. O seed faz **merge** sobre a config default gerada pelo Strapi. Marker `valhalla_admin_seed_version` garante execução única; se alguma chave ainda não existir no boot (banco novo), o marker não é gravado e o seed roda de novo no próximo boot.

- [ ] **Step 1: Criar `src/utils/admin-view-seed.ts`**

```ts
import type { Core } from '@strapi/strapi';

const SEED_VERSION = 1;
const MARKER_KEY = 'valhalla_admin_seed_version';

interface FieldPatch {
  label?: string;
  description?: string;
  hidden?: boolean; // remove da edit view
}

interface ViewPatch {
  fields: Record<string, FieldPatch>;
  settings?: Record<string, unknown>;
  listFields?: string[]; // colunas da list view, em ordem
}

const PRODUCT_PATCH: ViewPatch = {
  settings: {
    defaultSortBy: 'updatedAt',
    defaultSortOrder: 'DESC',
    pageSize: 50,
    mainField: 'name',
  },
  listFields: ['mainImage', 'name', 'basePrice', 'category'],
  fields: {
    name: { label: 'Nome do produto' },
    slug: { hidden: true },
    basePrice: { label: 'Preço base (R$)', description: 'Usado como referência; o preço real vem de cada variação' },
    brand: { label: 'Marca' },
    category: { label: 'Categoria' },
    tags: { label: 'Etiquetas', description: 'Opcional — ajuda na busca e nos filtros' },
    variantGroupLabel: { label: 'Título do grupo de variações', description: 'Ex.: "Tamanho", "Configuração". Aparece acima das opções na página do produto' },
    variants: { label: 'Variações', description: 'Cada variação é uma cor/configuração com preço próprio. Deixe o SKU vazio para gerar automaticamente' },
    specs: { label: 'Especificações', description: 'Ex.: Material → Aço inox' },
    description: { label: 'Descrição' },
    warranty: { label: 'Garantia', description: 'Ex.: "12 meses"' },
    mainImage: { label: 'Imagem principal' },
    gallery: { label: 'Galeria de imagens' },
    seo: { label: 'SEO (opcional)', description: 'Pode deixar vazio — é preenchido automaticamente com nome e descrição' },
  },
};

const VARIANT_PATCH: ViewPatch = {
  fields: {
    sku: { label: 'Código (SKU)', description: 'Deixe vazio para gerar automaticamente' },
    colorName: { label: 'Nome da cor', description: 'Ex.: "Preto", "Azul Marinho"' },
    colorHex: { label: 'Cor' },
    configLabel: { label: 'Configuração', description: 'Ex.: "128GB", "220V". Deixe vazio se não se aplica' },
    price: { label: 'Preço (R$)' },
    compareAtPrice: { label: "Preço 'De' (R$)", description: 'Preço riscado. Deixe vazio se não houver desconto' },
    available: { label: 'Disponível' },
    stockQuantity: { label: 'Estoque', description: 'Opcional' },
    image: { label: 'Imagem da variação' },
  },
};

const SIMPLE_PATCHES: Record<string, ViewPatch> = {
  'plugin_content_manager_configuration_content_types::api::brand.brand': {
    fields: {
      name: { label: 'Nome' },
      slug: { label: 'Endereço (URL)', description: 'Gerado automaticamente — não é preciso mexer' },
      logo: { label: 'Logo' },
      products: { label: 'Produtos' },
    },
  },
  'plugin_content_manager_configuration_content_types::api::category.category': {
    fields: {
      name: { label: 'Nome' },
      slug: { label: 'Endereço (URL)', description: 'Gerado automaticamente — não é preciso mexer' },
      description: { label: 'Descrição' },
      image: { label: 'Imagem' },
      products: { label: 'Produtos' },
    },
  },
  'plugin_content_manager_configuration_content_types::api::tag.tag': {
    fields: {
      name: { label: 'Nome' },
      slug: { label: 'Endereço (URL)', description: 'Gerado automaticamente — não é preciso mexer' },
      products: { label: 'Produtos' },
    },
  },
  'plugin_content_manager_configuration_content_types::api::faq.faq': {
    fields: {
      question: { label: 'Pergunta' },
      answer: { label: 'Resposta' },
      order: { label: 'Ordem', description: 'Menor número aparece primeiro' },
    },
  },
  'plugin_content_manager_configuration_content_types::api::policy.policy': {
    fields: {
      title: { label: 'Título' },
      slug: { label: 'Endereço (URL)', description: 'Gerado automaticamente — não é preciso mexer' },
      body: { label: 'Texto' },
    },
  },
  'plugin_content_manager_configuration_components::shared.seo': {
    fields: {
      metaTitle: { label: 'Título (SEO)', description: 'Até 60 caracteres. Vazio = usa o nome do produto' },
      metaDescription: { label: 'Descrição (SEO)', description: 'Até 155 caracteres. Vazio = usa a descrição do produto' },
      shareImage: { label: 'Imagem de compartilhamento' },
    },
  },
  'plugin_content_manager_configuration_components::ecommerce.spec': {
    fields: {
      key: { label: 'Característica' },
      value: { label: 'Valor' },
    },
  },
};

const ALL_PATCHES: Record<string, ViewPatch> = {
  'plugin_content_manager_configuration_content_types::api::product.product': PRODUCT_PATCH,
  'plugin_content_manager_configuration_components::ecommerce.variant': VARIANT_PATCH,
  ...SIMPLE_PATCHES,
};

function applyPatch(config: any, patch: ViewPatch): void {
  if (patch.settings) Object.assign(config.settings, patch.settings);

  for (const [field, p] of Object.entries(patch.fields)) {
    const meta = config.metadatas?.[field];
    if (!meta) continue;
    if (p.label) {
      if (meta.edit) meta.edit.label = p.label;
      if (meta.list) meta.list.label = p.label;
    }
    if (p.description && meta.edit) meta.edit.description = p.description;
    if (p.hidden && Array.isArray(config.layouts?.edit)) {
      config.layouts.edit = config.layouts.edit
        .map((row: any[]) => row.filter((cell: any) => cell.name !== field))
        .filter((row: any[]) => row.length > 0);
    }
  }

  if (patch.listFields && Array.isArray(config.layouts?.list)) {
    config.layouts.list = patch.listFields;
  }
}

export async function seedAdminViews(strapi: Core.Strapi): Promise<void> {
  const coreStore = strapi.db.query('strapi::core-store');

  const marker = await coreStore.findOne({ where: { key: MARKER_KEY } });
  const currentVersion = marker ? Number(JSON.parse(marker.value)) : 0;
  if (currentVersion >= SEED_VERSION) return;

  let allApplied = true;

  for (const [key, patch] of Object.entries(ALL_PATCHES)) {
    const row = await coreStore.findOne({ where: { key } });
    if (!row) {
      // Config default ainda não gerada (banco novo) — tenta de novo no próximo boot.
      allApplied = false;
      strapi.log.warn(`[admin-view-seed] config ausente, adiada: ${key}`);
      continue;
    }
    const config = JSON.parse(row.value);
    applyPatch(config, patch);
    await coreStore.update({ where: { id: row.id }, data: { value: JSON.stringify(config) } });
  }

  if (allApplied) {
    const data = { key: MARKER_KEY, value: JSON.stringify(SEED_VERSION), type: 'number', environment: '', tag: '' };
    if (marker) await coreStore.update({ where: { id: marker.id }, data });
    else await coreStore.create({ data });
    strapi.log.info('[admin-view-seed] views do admin configuradas (pt-BR)');
  }
}
```

- [ ] **Step 2: Chamar no bootstrap — `src/index.ts`**

No topo: `import { seedAdminViews } from './utils/admin-view-seed';`
No fim da função `bootstrap`, após o loop de permissões:

```ts
await seedAdminViews(strapi);
```

- [ ] **Step 3: Verificar em banco existente**

```bash
npm run develop
```

Expected: log `[admin-view-seed] views do admin configuradas (pt-BR)`. No admin: edit view do Produto sem campo slug, labels PT-BR com textos de ajuda, list view com colunas imagem/nome/preço/categoria. Reiniciar o Strapi: seed NÃO roda de novo (sem novo log).

- [ ] **Step 4: Verificar em banco novo (simula deploy dokploy)**

```powershell
Copy-Item .tmp\data.db .tmp\data.db.bak; Remove-Item .tmp\data.db
npm run develop
```

Expected: primeiro boot pode logar `config ausente, adiada` (aceitável); abrir o admin uma vez (gera configs default), reiniciar o Strapi e conferir que o seed aplica e loga sucesso. Restaurar: parar, `Move-Item .tmp\data.db.bak .tmp\data.db -Force`.

Se as configs default NÃO aparecerem no core store nem após abrir o admin: investigar formato/momento de geração na 5.50.1 antes de prosseguir (risco mapeado na spec).

- [ ] **Step 5: Testar criação de produto com slug oculto**

No admin (slug agora invisível): criar produto novo só com nome/preço/variação. Expected: salva sem erro e `slug` vem preenchido (lifecycle da Task 3 garante).

- [ ] **Step 6: Commit**

```bash
git add src/utils/admin-view-seed.ts src/index.ts
git commit -m "feat: seed idempotente das views do admin em pt-BR"
```

---

### Task 6: Frontend — tipos e populate para variante-componente

**Files (repo `C:\Users\ariov\Desktop\projetos\valhalla-ecommerce`):**
- Modify: `app/lib/strapi.ts`

**Interfaces:**
- Consumes: API do produto com `variants` como componente (`colorName`, `colorHex` no lugar de `color` populado).
- Produces: shape TS inalterado para os componentes React (`ProductVariant.color: {name, hex}`), exceto remoção de `documentId` (não usado fora de `strapi.ts`).

- [ ] **Step 1: Editar `app/lib/strapi.ts`**

Interface `ProductVariant` (linhas 11–20) — remover `documentId`:

```ts
export interface ProductVariant {
  id: number;
  sku: string;
  color: Color;
  configLabel: string;
  price: number;
  compareAtPrice: number | null;
  available: boolean;
}
```

`mapVariant` (linhas 175–186):

```ts
function mapVariant(raw: any): ProductVariant {
  return {
    id: raw.id,
    sku: raw.sku,
    color: { name: raw.colorName ?? "", hex: raw.colorHex ?? "#000000" },
    configLabel: raw.configLabel ?? "",
    price: raw.price,
    compareAtPrice: raw.compareAtPrice ?? null,
    available: raw.available,
  };
}
```

`PRODUCT_POPULATE` (linha 209):

```ts
const PRODUCT_POPULATE =
  "populate[brand]=true&populate[category]=true&populate[tags]=true&populate[specs]=true&populate[variants][populate]=image&populate[seo][populate]=*";
```

- [ ] **Step 2: Checar usos de `documentId` de variante**

```bash
cd C:\Users\ariov\Desktop\projetos\valhalla-ecommerce
grep -rn "variant" app --include=*.tsx | grep -i documentId
```

Expected: nenhum resultado. Se houver, trocar por `sku`.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: build sem erro de tipo.

- [ ] **Step 4: Verificação visual** — com Strapi local rodando (produto de teste da Task 3 publicado):

```bash
npm run dev
```

Abrir `http://localhost:3000/p/teste-lifecycle`. Expected: variações com bolinhas de cor, preço trocando por variação, botão de carrinho funcionando (item usa `sku`).

- [ ] **Step 5: Commit (no repo frontend)**

```bash
git add app/lib/strapi.ts
git commit -m "feat: variantes como componente do produto (novo shape da API)"
```

---

### Task 7: Verificação ponta a ponta (critérios da spec)

**Files:** nenhum (checklist manual).

- [ ] **Step 1: Banco limpo + fluxo completo**

Com Strapi e Next rodando localmente:

1. Criar do zero, **numa única tela**, produto com 3 variações (2 cores × configs), preenchendo apenas: nome, preço base, categoria, marca, imagem, e por variação: cor (picker), nome da cor, preço. NÃO tocar em SKU, slug, SEO.
2. Publicar.

Expected (critérios de sucesso da spec):
- Nenhuma segunda tela ou vínculo manual de variante.
- Admin todo em PT-BR com textos de ajuda.
- `curl "http://localhost:1337/api/products?populate[variants]=true&populate[seo]=true"` → SKUs gerados, slug gerado, SEO preenchido.
- Página do produto no Next renderiza cores/preços/carrinho corretamente.

- [ ] **Step 2: Rodar testes**

```bash
cd C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api && npx vitest run
```

Expected: PASS.

- [ ] **Step 3: Anotar pendências de deploy**

Deploy no dokploy (Postgres): banco novo → primeiro acesso ao admin gera configs default; seed aplica no boot seguinte (comportamento da Task 5 Step 4). Recadastrar produtos de teste manualmente (sem migração, conforme spec).
