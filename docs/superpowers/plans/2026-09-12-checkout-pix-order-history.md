# Checkout Pix (Asaas) + Histórico de Pedidos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cliente autenticado finaliza a compra do carrinho pagando via Pix (Asaas Sandbox) a partir de `/lista`, e consulta o histórico de pedidos pelo menu de conta.

**Architecture:** Mesmo padrão BFF da autenticação — navegador fala só com o Next.js (`app/api/**`), que fala com Strapi via `STRAPI_INTERNAL_URL` usando o JWT do cliente. Strapi encapsula a Asaas; `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` nunca saem do backend. Preço é sempre resolvido no servidor a partir do catálogo, nunca confiado do cliente.

**Tech Stack:** Next.js 16.3.2, React 19, TypeScript 5, Strapi 5.50.2, PostgreSQL, Node 20+, Vitest (backend), Node test runner (frontend), fetch nativo.

**Spec:** `docs/superpowers/specs/2026-09-12-checkout-pix-order-history-design.md`

## Global Constraints

- Método de pagamento único: Pix. Sem cartão, boleto, frete ou controle de estoque neste plano.
- Preço de cada item é sempre resolvido pelo Strapi a partir do catálogo atual (`product.basePrice`/`variant.price`) — o cliente nunca envia `unitPrice`.
- `customer-profile` é um content-type separado do schema nativo de `users-permissions.user` (1:1), nunca sobrescreve o plugin.
- `order.items` é um snapshot JSON imutável, gravado uma vez na criação.
- `GET/PUT /api/customer-profiles/me` e `GET/POST /api/orders*` sempre derivam o dono de `ctx.state.user.id` — nunca aceitam um `id`/filtro de usuário vindo do cliente.
- Webhook Asaas (`POST /api/asaas/webhook`) valida `asaas-access-token` com comparação em tempo constante (`timingSafeEqual`), mesmo padrão de `src/policies/internal-test-token.ts`; nunca loga o payload bruto; sempre responde `200` quando o token é válido, mesmo se o pedido não for encontrado.
- CPF/CNPJ e CEP validados por checksum/formato antes de persistir; nunca logados.
- `/lista` (`ListaClient.tsx`) mantém o fluxo de WhatsApp existente sem alterações de comportamento — o checkout Pix é um botão adicional no mesmo step `"cart"`.
- Toda rota BFF nova segue os padrões já existentes em `app/api/auth/_shared.ts` (rate limit, origem, cookies) e `app/lib/auth-session.ts` (`resolveSession`).

---

## Backend (`valhalla-ecommerce-api`)

### Task 1: Validação de CPF/CNPJ/CEP/UF

**Files:**
- Create: `src/customer-profile/validation.ts`
- Create: `src/customer-profile/validation.test.ts`

**Interfaces:**
- Produces: `onlyDigits(value: string): string`, `isValidCpfCnpj(value: string): boolean`, `isValidCep(value: string): boolean`, `isValidUf(value: string): boolean` — consumidos pelos Tasks 2 e (no frontend, duplicados) 7.

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, expect, it } from 'vitest';
import { onlyDigits, isValidCpfCnpj, isValidCep, isValidUf } from './validation';

describe('onlyDigits', () => {
  it('remove tudo que não é dígito', () => {
    expect(onlyDigits('123.456.789-09')).toBe('12345678909');
    expect(onlyDigits('12345-678')).toBe('12345678');
  });
});

describe('isValidCpfCnpj', () => {
  it('aceita um CPF válido', () => {
    expect(isValidCpfCnpj('11144477735')).toBe(true);
  });

  it('rejeita um CPF com dígito verificador errado', () => {
    expect(isValidCpfCnpj('11144477736')).toBe(false);
  });

  it('rejeita CPF com todos os dígitos iguais', () => {
    expect(isValidCpfCnpj('11111111111')).toBe(false);
  });

  it('aceita um CNPJ válido', () => {
    expect(isValidCpfCnpj('11222333000181')).toBe(true);
  });

  it('rejeita um CNPJ com dígito verificador errado', () => {
    expect(isValidCpfCnpj('11222333000182')).toBe(false);
  });

  it('rejeita comprimento que não é 11 nem 14', () => {
    expect(isValidCpfCnpj('123')).toBe(false);
  });
});

describe('isValidCep', () => {
  it('aceita 8 dígitos', () => {
    expect(isValidCep('01310100')).toBe(true);
  });

  it('rejeita comprimento diferente de 8', () => {
    expect(isValidCep('123')).toBe(false);
    expect(isValidCep('013101000')).toBe(false);
  });
});

describe('isValidUf', () => {
  it('aceita UF válida', () => {
    expect(isValidUf('SP')).toBe(true);
    expect(isValidUf('sp')).toBe(false);
  });

  it('rejeita UF inexistente', () => {
    expect(isValidUf('XX')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- src/customer-profile/validation.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// src/customer-profile/validation.ts

const VALID_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
]);

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCep(value: string): boolean {
  return /^\d{8}$/.test(value);
}

export function isValidUf(value: string): boolean {
  return VALID_UFS.has(value);
}

export function isValidCpfCnpj(value: string): boolean {
  if (value.length === 11) return isValidCpf(value);
  if (value.length === 14) return isValidCnpj(value);
  return false;
}

function isValidCpf(cpf: string): boolean {
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  return digit === Number(cpf[10]);
}

function isValidCnpj(cnpj: string): boolean {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (length: 12 | 13): number => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cnpj[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  if (calcDigit(12) !== Number(cnpj[12])) return false;
  return calcDigit(13) === Number(cnpj[13]);
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- src/customer-profile/validation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/customer-profile/validation.ts src/customer-profile/validation.test.ts
git commit -m "feat: add CPF/CNPJ/CEP/UF validation for customer profile"
```

---

### Task 2: Content-type `customer-profile` + rotas `me`

**Files:**
- Create: `src/api/customer-profile/content-types/customer-profile/schema.json`
- Create: `src/api/customer-profile/controllers/customer-profile.ts`
- Create: `src/api/customer-profile/controllers/customer-profile.test.ts`
- Create: `src/api/customer-profile/routes/customer-profile.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `onlyDigits`, `isValidCpfCnpj`, `isValidCep`, `isValidUf` from `../../../customer-profile/validation` (Task 1).
- Produces: `GET /api/customer-profiles/me` → `{ ok: true, data: CustomerProfile | null }`; `PUT /api/customer-profiles/me` → `{ ok: true, data: CustomerProfile }` ou `{ ok: false, error: 'VALIDATION_ERROR' }` (400). `CustomerProfile = { cpfCnpj, phone, addressLine, addressNumber, addressComplement, neighborhood, city, state, postalCode }` — Task 5 (order controller) lê o registro bruto do content-type (inclui `asaasCustomerId`, não exposto por este serializer).

- [ ] **Step 1: Criar o schema do content-type**

```json
{
  "kind": "collectionType",
  "collectionName": "customer_profiles",
  "info": {
    "singularName": "customer-profile",
    "pluralName": "customer-profiles",
    "displayName": "Perfil do Cliente",
    "description": "CPF/CNPJ, endereço e id Asaas do cliente autenticado"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "user": {
      "type": "relation",
      "relation": "oneToOne",
      "target": "plugin::users-permissions.user"
    },
    "cpfCnpj": { "type": "string" },
    "phone": { "type": "string" },
    "addressLine": { "type": "string" },
    "addressNumber": { "type": "string" },
    "addressComplement": { "type": "string" },
    "neighborhood": { "type": "string" },
    "city": { "type": "string" },
    "state": { "type": "string" },
    "postalCode": { "type": "string" },
    "asaasCustomerId": { "type": "string" }
  }
}
```

Salve em `src/api/customer-profile/content-types/customer-profile/schema.json`.

- [ ] **Step 2: Escrever os testes do controller**

```ts
// src/api/customer-profile/controllers/customer-profile.test.ts
import { describe, expect, it, vi } from 'vitest';
import controller from './customer-profile';

function buildStrapi(overrides: {
  findOne?: any;
  create?: any;
  update?: any;
}) {
  return {
    db: {
      query: () => ({
        findOne: overrides.findOne ?? vi.fn().mockResolvedValue(null),
        create: overrides.create ?? vi.fn(),
        update: overrides.update ?? vi.fn(),
      }),
    },
  };
}

function buildCtx(userId: number | undefined, body: unknown = {}) {
  const ctx: any = {
    state: { user: userId ? { id: userId } : undefined },
    request: { body },
    status: 0,
    body: undefined,
    unauthorized: vi.fn(),
  };
  return ctx;
}

describe('customer-profile controller: me', () => {
  it('retorna 401 sem usuário autenticado', async () => {
    const ctx = buildCtx(undefined);
    (globalThis as any).strapi = buildStrapi({});
    await controller.me(ctx);
    expect(ctx.unauthorized).toHaveBeenCalled();
  });

  it('retorna null quando o perfil ainda não existe', async () => {
    const ctx = buildCtx(1);
    (globalThis as any).strapi = buildStrapi({ findOne: vi.fn().mockResolvedValue(null) });
    await controller.me(ctx);
    expect(ctx.body).toEqual({ ok: true, data: null });
  });

  it('serializa só os campos públicos, sem asaasCustomerId', async () => {
    const ctx = buildCtx(1);
    (globalThis as any).strapi = buildStrapi({
      findOne: vi.fn().mockResolvedValue({
        id: 9,
        cpfCnpj: '11144477735',
        phone: '11999999999',
        addressLine: 'Rua X',
        addressNumber: '10',
        addressComplement: '',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        postalCode: '01310100',
        asaasCustomerId: 'cus_123',
      }),
    });
    await controller.me(ctx);
    expect(ctx.body.data.asaasCustomerId).toBeUndefined();
    expect(ctx.body.data.cpfCnpj).toBe('11144477735');
  });
});

describe('customer-profile controller: updateMe', () => {
  it('retorna 401 sem usuário autenticado', async () => {
    const ctx = buildCtx(undefined);
    (globalThis as any).strapi = buildStrapi({});
    await controller.updateMe(ctx);
    expect(ctx.unauthorized).toHaveBeenCalled();
  });

  it('rejeita CPF inválido com 400 VALIDATION_ERROR', async () => {
    const ctx = buildCtx(1, {
      cpfCnpj: '00000000000',
      postalCode: '01310100',
      state: 'SP',
      addressLine: 'Rua X',
      addressNumber: '10',
      neighborhood: 'Centro',
      city: 'São Paulo',
    });
    (globalThis as any).strapi = buildStrapi({});
    await controller.updateMe(ctx);
    expect(ctx.status).toBe(400);
    expect(ctx.body).toEqual({ ok: false, error: 'VALIDATION_ERROR' });
  });

  it('cria o perfil quando ainda não existe', async () => {
    const create = vi.fn().mockResolvedValue({
      cpfCnpj: '11144477735',
      phone: '',
      addressLine: 'Rua X',
      addressNumber: '10',
      addressComplement: '',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '01310100',
    });
    const ctx = buildCtx(1, {
      cpfCnpj: '111.444.777-35',
      postalCode: '01310-100',
      state: 'sp',
      addressLine: 'Rua X',
      addressNumber: '10',
      neighborhood: 'Centro',
      city: 'São Paulo',
    });
    (globalThis as any).strapi = buildStrapi({ findOne: vi.fn().mockResolvedValue(null), create });
    await controller.updateMe(ctx);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cpfCnpj: '11144477735', user: 1 }) })
    );
    expect(ctx.body.ok).toBe(true);
  });
});
```

- [ ] **Step 3: Confirmar que os testes falham**

Run: `npm test -- src/api/customer-profile/controllers/customer-profile.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 4: Implementar o controller**

```ts
// src/api/customer-profile/controllers/customer-profile.ts
import type { Context } from 'koa';

import { isValidCep, isValidCpfCnpj, isValidUf, onlyDigits } from '../../../customer-profile/validation';

const PUBLIC_FIELDS = [
  'cpfCnpj',
  'phone',
  'addressLine',
  'addressNumber',
  'addressComplement',
  'neighborhood',
  'city',
  'state',
  'postalCode',
] as const;

function serializeProfile(profile: Record<string, unknown> | null) {
  if (!profile) return null;
  const out: Record<string, unknown> = {};
  for (const field of PUBLIC_FIELDS) out[field] = profile[field] ?? '';
  return out;
}

function readInput(body: Record<string, unknown>) {
  return {
    cpfCnpj: onlyDigits(typeof body.cpfCnpj === 'string' ? body.cpfCnpj : ''),
    phone: onlyDigits(typeof body.phone === 'string' ? body.phone : ''),
    addressLine: typeof body.addressLine === 'string' ? body.addressLine.trim() : '',
    addressNumber: typeof body.addressNumber === 'string' ? body.addressNumber.trim() : '',
    addressComplement: typeof body.addressComplement === 'string' ? body.addressComplement.trim() : '',
    neighborhood: typeof body.neighborhood === 'string' ? body.neighborhood.trim() : '',
    city: typeof body.city === 'string' ? body.city.trim() : '',
    state: typeof body.state === 'string' ? body.state.trim().toUpperCase() : '',
    postalCode: onlyDigits(typeof body.postalCode === 'string' ? body.postalCode : ''),
  };
}

function isComplete(input: ReturnType<typeof readInput>): boolean {
  return (
    isValidCpfCnpj(input.cpfCnpj) &&
    isValidCep(input.postalCode) &&
    isValidUf(input.state) &&
    input.addressLine.length > 0 &&
    input.addressNumber.length > 0 &&
    input.neighborhood.length > 0 &&
    input.city.length > 0
  );
}

export default {
  async me(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const profile = await strapi.db
      .query('api::customer-profile.customer-profile')
      .findOne({ where: { user: userId } });

    ctx.body = { ok: true, data: serializeProfile(profile) };
  },

  async updateMe(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const input = readInput((ctx.request.body ?? {}) as Record<string, unknown>);

    if (!isComplete(input)) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'VALIDATION_ERROR' };
      return;
    }

    const existing = await strapi.db
      .query('api::customer-profile.customer-profile')
      .findOne({ where: { user: userId } });

    const saved = existing
      ? await strapi.db
          .query('api::customer-profile.customer-profile')
          .update({ where: { id: existing.id }, data: input })
      : await strapi.db
          .query('api::customer-profile.customer-profile')
          .create({ data: { ...input, user: userId } });

    ctx.body = { ok: true, data: serializeProfile(saved) };
  },
};
```

- [ ] **Step 5: Criar as rotas**

```ts
// src/api/customer-profile/routes/customer-profile.ts
export default {
  routes: [
    {
      method: 'GET',
      path: '/customer-profiles/me',
      handler: 'customer-profile.me',
      config: { policies: [] },
    },
    {
      method: 'PUT',
      path: '/customer-profiles/me',
      handler: 'customer-profile.updateMe',
      config: { policies: [] },
    },
  ],
};
```

Nenhuma delas usa `auth: false` — ambas exigem o JWT padrão do plugin `users-permissions`, gated pela permissão da role `authenticated` concedida no Step 6.

- [ ] **Step 6: Conceder permissão à role `authenticated` no bootstrap**

Em `src/index.ts`, adicione (perto de `PUBLIC_READ`):

```ts
const AUTHENTICATED_ACTIONS: Record<string, string[]> = {
  'api::customer-profile.customer-profile': ['me', 'updateMe'],
};
```

E, dentro de `bootstrap`, logo após o bloco que concede `PUBLIC_READ` ao `publicRole`, adicione:

```ts
    const authenticatedRole = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'authenticated' } });

    if (authenticatedRole) {
      for (const [uid, actions] of Object.entries(AUTHENTICATED_ACTIONS)) {
        for (const action of actions) {
          const actionId = `${uid}.${action}`;
          const existing = await strapi.db
            .query('plugin::users-permissions.permission')
            .findOne({ where: { action: actionId, role: authenticatedRole.id } });

          if (!existing) {
            await strapi.db.query('plugin::users-permissions.permission').create({
              data: { action: actionId, role: authenticatedRole.id },
            });
          }
        }
      }
    }
```

- [ ] **Step 7: Rodar os testes e validar**

Run: `npm test -- src/api/customer-profile`
Expected: PASS

Run: `npm run build`
Expected: exit 0

- [ ] **Step 8: Commit**

```bash
git add src/api/customer-profile src/index.ts
git commit -m "feat: add customer-profile content-type and /me routes"
```

---

### Task 3: Resolução de preço do pedido (função pura)

**Files:**
- Create: `src/order/pricing.ts`
- Create: `src/order/pricing.test.ts`

**Interfaces:**
- Produces: `resolveOrderItems(rawItems: unknown, lookup: ProductLookup): Promise<ResolveOrderItemsResult>`, tipos `OrderItemInput`, `OrderItem`, `ProductLookup`, `ProductLookupResult`, `ResolveOrderItemsResult`, `MIN_QTY`, `MAX_QTY` — consumidos pelo Task 5 (controller de `order`).

- [ ] **Step 1: Escrever os testes**

```ts
// src/order/pricing.test.ts
import { describe, expect, it } from 'vitest';
import { resolveOrderItems, type ProductLookup } from './pricing';

const lookup: ProductLookup = async (slug) => {
  if (slug !== 'iphone-15') return null;
  return {
    name: 'iPhone 15',
    variants: [
      { sku: 'IP15-BLK-128', colorName: 'Preto', configLabel: '128GB', price: 5999, available: true },
      { sku: 'IP15-BLK-256', colorName: 'Preto', configLabel: '256GB', price: 6999, available: false },
    ],
  };
};

describe('resolveOrderItems', () => {
  it('retorna EMPTY_CART para lista vazia', async () => {
    const result = await resolveOrderItems([], lookup);
    expect(result).toEqual({ ok: false, error: 'EMPTY_CART' });
  });

  it('retorna EMPTY_CART quando não é um array', async () => {
    const result = await resolveOrderItems(null, lookup);
    expect(result).toEqual({ ok: false, error: 'EMPTY_CART' });
  });

  it('retorna INVALID_ITEM para item malformado', async () => {
    const result = await resolveOrderItems([{ productSlug: 'x' }], lookup);
    expect(result).toEqual({ ok: false, error: 'INVALID_ITEM' });
  });

  it('retorna PRODUCT_NOT_FOUND quando o slug não existe', async () => {
    const result = await resolveOrderItems(
      [{ productSlug: 'nao-existe', variantSku: 'X', qty: 1 }],
      lookup
    );
    expect(result).toEqual({ ok: false, error: 'PRODUCT_NOT_FOUND' });
  });

  it('retorna VARIANT_NOT_FOUND quando o sku não bate', async () => {
    const result = await resolveOrderItems(
      [{ productSlug: 'iphone-15', variantSku: 'INEXISTENTE', qty: 1 }],
      lookup
    );
    expect(result).toEqual({ ok: false, error: 'VARIANT_NOT_FOUND' });
  });

  it('retorna VARIANT_UNAVAILABLE para variante indisponível', async () => {
    const result = await resolveOrderItems(
      [{ productSlug: 'iphone-15', variantSku: 'IP15-BLK-256', qty: 1 }],
      lookup
    );
    expect(result).toEqual({ ok: false, error: 'VARIANT_UNAVAILABLE' });
  });

  it('resolve preço do catálogo, ignora qualquer preço do cliente e soma o total', async () => {
    const result = await resolveOrderItems(
      [
        { productSlug: 'iphone-15', variantSku: 'IP15-BLK-128', qty: 2, unitPrice: 1 } as any,
      ],
      lookup
    );
    expect(result).toEqual({
      ok: true,
      items: [
        {
          productSlug: 'iphone-15',
          productName: 'iPhone 15',
          variantSku: 'IP15-BLK-128',
          colorName: 'Preto',
          configLabel: '128GB',
          unitPrice: 5999,
          qty: 2,
        },
      ],
      totalAmount: 11998,
    });
  });

  it('limita a quantidade entre 1 e 10', async () => {
    const result = await resolveOrderItems(
      [{ productSlug: 'iphone-15', variantSku: 'IP15-BLK-128', qty: 99 }],
      lookup
    );
    expect(result.ok && result.items[0].qty).toBe(10);
  });
});
```

- [ ] **Step 2: Confirmar que os testes falham**

Run: `npm test -- src/order/pricing.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// src/order/pricing.ts

export const MIN_QTY = 1;
export const MAX_QTY = 10;

export type OrderItemInput = { productSlug: string; variantSku: string; qty: number };

export type OrderItem = {
  productSlug: string;
  productName: string;
  variantSku: string;
  colorName: string;
  configLabel: string;
  unitPrice: number;
  qty: number;
};

export type ProductVariantLookup = {
  sku: string;
  colorName: string;
  configLabel: string;
  price: number;
  available: boolean;
};

export type ProductLookupResult = { name: string; variants: ProductVariantLookup[] };

export type ProductLookup = (productSlug: string) => Promise<ProductLookupResult | null>;

export type ResolveOrderItemsError =
  | 'EMPTY_CART'
  | 'INVALID_ITEM'
  | 'PRODUCT_NOT_FOUND'
  | 'VARIANT_NOT_FOUND'
  | 'VARIANT_UNAVAILABLE';

export type ResolveOrderItemsResult =
  | { ok: true; items: OrderItem[]; totalAmount: number }
  | { ok: false; error: ResolveOrderItemsError };

export async function resolveOrderItems(
  rawItems: unknown,
  lookup: ProductLookup
): Promise<ResolveOrderItemsResult> {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: 'EMPTY_CART' };
  }

  const items: OrderItem[] = [];

  for (const raw of rawItems) {
    if (!isValidRawItem(raw)) {
      return { ok: false, error: 'INVALID_ITEM' };
    }

    const product = await lookup(raw.productSlug);
    if (!product) {
      return { ok: false, error: 'PRODUCT_NOT_FOUND' };
    }

    const variant = product.variants.find((v) => v.sku === raw.variantSku);
    if (!variant) {
      return { ok: false, error: 'VARIANT_NOT_FOUND' };
    }

    if (!variant.available) {
      return { ok: false, error: 'VARIANT_UNAVAILABLE' };
    }

    items.push({
      productSlug: raw.productSlug,
      productName: product.name,
      variantSku: variant.sku,
      colorName: variant.colorName,
      configLabel: variant.configLabel,
      unitPrice: variant.price,
      qty: clampQty(raw.qty),
    });
  }

  const totalAmount = roundCents(items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0));
  return { ok: true, items, totalAmount };
}

function clampQty(qty: number): number {
  return Math.max(MIN_QTY, Math.min(MAX_QTY, Math.trunc(qty)));
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function isValidRawItem(value: unknown): value is OrderItemInput {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.productSlug === 'string' &&
    v.productSlug.length > 0 &&
    typeof v.variantSku === 'string' &&
    v.variantSku.length > 0 &&
    typeof v.qty === 'number' &&
    Number.isFinite(v.qty) &&
    v.qty >= 1
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- src/order/pricing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/order/pricing.ts src/order/pricing.test.ts
git commit -m "feat: add server-side order pricing resolution"
```

---

### Task 4: Cliente Asaas — cobrança Pix

**Files:**
- Modify: `src/services/external/asaas.service.ts`
- Modify: `src/services/external/asaas.service.test.ts`

**Interfaces:**
- Consumes: `AsaasConfig`, `AsaasErrorCode`, `isTimeoutError` já existentes no arquivo.
- Produces: `createAsaasCustomer`, `createAsaasPixCharge`, `getAsaasPixQrCode`, tipo `AsaasApiResult<T>` — consumidos pelo Task 5.

- [ ] **Step 1: Escrever os testes (adicionar ao arquivo existente)**

Adicione ao final de `src/services/external/asaas.service.test.ts` (mantendo os testes existentes de `testAsaasConnection`):

```ts
import { createAsaasCustomer, createAsaasPixCharge, getAsaasPixQrCode } from './asaas.service';

const config = {
  apiUrl: 'https://api-sandbox.asaas.com/v3',
  apiKey: 'test-key',
  timeoutMs: 5000,
  userAgent: 'Test/1.0',
};

describe('createAsaasCustomer', () => {
  it('cria o cliente e retorna o id', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'cus_123' }),
    }) as any;

    const result = await createAsaasCustomer(config, {
      name: 'Fulano',
      cpfCnpj: '11144477735',
      email: 'fulano@example.com',
      postalCode: '01310100',
      addressNumber: '10',
      address: 'Rua X',
      province: 'Centro',
    });

    expect(result).toEqual({ ok: true, data: { id: 'cus_123' } });
  });

  it('mapeia 401 para ASAAS_AUTH_FAILED', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }) as any;
    const result = await createAsaasCustomer(config, {
      name: 'Fulano', cpfCnpj: '11144477735', email: 'x@x.com',
      postalCode: '01310100', addressNumber: '10', address: 'Rua X', province: 'Centro',
    });
    expect(result).toEqual({ ok: false, code: 'ASAAS_AUTH_FAILED', status: 502 });
  });
});

describe('createAsaasPixCharge', () => {
  it('cria a cobrança e retorna id + invoiceUrl', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'pay_123', invoiceUrl: 'https://asaas.test/i/pay_123' }),
    }) as any;

    const result = await createAsaasPixCharge(config, {
      customerId: 'cus_123',
      value: 100,
      description: 'Pedido #1',
    });

    expect(result).toEqual({
      ok: true,
      data: { id: 'pay_123', invoiceUrl: 'https://asaas.test/i/pay_123' },
    });
  });
});

describe('getAsaasPixQrCode', () => {
  it('retorna o QR code e o copia-e-cola', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        encodedImage: 'base64-png',
        payload: '00020126...copia-cola',
        expirationDate: '2026-09-13 12:00:00',
      }),
    }) as any;

    const result = await getAsaasPixQrCode(config, 'pay_123');

    expect(result).toEqual({
      ok: true,
      data: {
        encodedImage: 'base64-png',
        payload: '00020126...copia-cola',
        expirationDate: '2026-09-13 12:00:00',
      },
    });
  });

  it('mapeia timeout para ASAAS_TIMEOUT', async () => {
    global.fetch = vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')) as any;
    const result = await getAsaasPixQrCode(config, 'pay_123');
    expect(result).toEqual({ ok: false, code: 'ASAAS_TIMEOUT', status: 504 });
  });
});
```

- [ ] **Step 2: Confirmar que os testes falham**

Run: `npm test -- src/services/external/asaas.service.test.ts`
Expected: FAIL (`createAsaasCustomer` não existe).

- [ ] **Step 3: Implementar (adicionar ao final de `asaas.service.ts`)**

```ts
export type AsaasApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: AsaasErrorCode; status: 502 | 504 | 503 };

async function asaasRequest<T>(
  config: AsaasConfig,
  path: string,
  init: RequestInit
): Promise<AsaasApiResult<T>> {
  const { apiUrl, apiKey, timeoutMs, userAgent } = config;

  if (!apiKey) {
    return { ok: false, code: 'ASAAS_AUTH_FAILED', status: 502 };
  }

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        access_token: apiKey,
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        ...(init.headers as Record<string, string> | undefined),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status === 401) {
      return { ok: false, code: 'ASAAS_AUTH_FAILED', status: 502 };
    }
    if (response.status === 403) {
      return { ok: false, code: 'ASAAS_FORBIDDEN', status: 502 };
    }
    if (!response.ok) {
      return { ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 };
    }

    const json = (await response.json()) as T;
    return { ok: true, data: json };
  } catch (error) {
    if (isTimeoutError(error)) {
      return { ok: false, code: 'ASAAS_TIMEOUT', status: 504 };
    }
    return { ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 };
  }
}

export type AsaasCustomerInput = {
  name: string;
  cpfCnpj: string;
  email: string;
  phone?: string;
  postalCode: string;
  addressNumber: string;
  address: string;
  complement?: string;
  province: string;
};

/** Cria um cliente na Asaas. Chamar só quando `customer-profile.asaasCustomerId` ainda não existir. */
export async function createAsaasCustomer(
  config: AsaasConfig,
  input: AsaasCustomerInput
): Promise<AsaasApiResult<{ id: string }>> {
  return asaasRequest<{ id: string }>(config, '/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type AsaasPixChargeInput = {
  customerId: string;
  value: number;
  description: string;
};

/** Cria uma cobrança Pix com vencimento hoje (Pix não expira por `dueDate`, mas pelo próprio QR code). */
export async function createAsaasPixCharge(
  config: AsaasConfig,
  input: AsaasPixChargeInput
): Promise<AsaasApiResult<{ id: string; invoiceUrl: string }>> {
  const dueDate = new Date().toISOString().slice(0, 10);
  return asaasRequest<{ id: string; invoiceUrl: string }>(config, '/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: input.customerId,
      billingType: 'PIX',
      value: input.value,
      dueDate,
      description: input.description,
    }),
  });
}

export async function getAsaasPixQrCode(
  config: AsaasConfig,
  paymentId: string
): Promise<AsaasApiResult<{ encodedImage: string; payload: string; expirationDate: string }>> {
  return asaasRequest<{ encodedImage: string; payload: string; expirationDate: string }>(
    config,
    `/payments/${encodeURIComponent(paymentId)}/pixQrCode`,
    { method: 'GET' }
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- src/services/external/asaas.service.test.ts`
Expected: PASS (todos, incluindo os testes pré-existentes de `testAsaasConnection`).

- [ ] **Step 5: Commit**

```bash
git add src/services/external/asaas.service.ts src/services/external/asaas.service.test.ts
git commit -m "feat: add Asaas customer and Pix charge creation"
```

---

### Task 5: Content-type `order` + rotas de criação/listagem

**Files:**
- Create: `src/api/order/content-types/order/schema.json`
- Create: `src/order/serialize-order.ts`
- Create: `src/order/serialize-order.test.ts`
- Create: `src/api/order/controllers/order.ts`
- Create: `src/api/order/controllers/order.test.ts`
- Create: `src/api/order/routes/order.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `resolveOrderItems`, `ProductLookup`, `OrderItemInput` (Task 3); `readAsaasConfigFromEnv`, `createAsaasCustomer`, `createAsaasPixCharge`, `getAsaasPixQrCode` (Task 4).
- Produces: `POST /api/orders` → `201 { ok: true, data: SerializedOrder }` ou erro; `GET /api/orders` → `{ ok: true, data: SerializedOrder[] }`; `GET /api/orders/:id` → `{ ok: true, data: SerializedOrder }` ou `404`. `SerializedOrder = { id, items, totalAmount, status, asaasInvoiceUrl, pixQrCodeImage, pixCopyPaste, pixExpiration, createdAt }` (sem `asaasPaymentId`, nunca exposto ao cliente) — consumido pelo Task 6 (webhook busca por `asaasPaymentId` direto no `db.query`, não pelo serializer) e pelo frontend Task 8.

- [ ] **Step 1: Criar o schema do content-type**

```json
{
  "kind": "collectionType",
  "collectionName": "orders",
  "info": {
    "singularName": "order",
    "pluralName": "orders",
    "displayName": "Pedido",
    "description": "Pedido do cliente com snapshot dos itens e cobrança Pix Asaas"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "user": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "plugin::users-permissions.user"
    },
    "items": {
      "type": "json",
      "required": true
    },
    "totalAmount": {
      "type": "decimal",
      "required": true
    },
    "status": {
      "type": "enumeration",
      "enum": ["pending", "paid", "expired", "cancelled", "failed"],
      "default": "pending",
      "required": true
    },
    "asaasPaymentId": { "type": "string" },
    "asaasInvoiceUrl": { "type": "string" },
    "pixQrCodeImage": { "type": "text" },
    "pixCopyPaste": { "type": "text" },
    "pixExpiration": { "type": "datetime" }
  }
}
```

Salve em `src/api/order/content-types/order/schema.json`.

- [ ] **Step 2: Escrever os testes do serializer**

```ts
// src/order/serialize-order.test.ts
import { describe, expect, it } from 'vitest';
import { serializeOrder } from './serialize-order';

describe('serializeOrder', () => {
  it('expõe os campos públicos e nunca asaasPaymentId', () => {
    const result = serializeOrder({
      id: 1,
      items: [{ productSlug: 'x', productName: 'X', variantSku: 'S', colorName: 'C', configLabel: 'L', unitPrice: 10, qty: 2 }],
      totalAmount: 20,
      status: 'pending',
      asaasPaymentId: 'pay_123',
      asaasInvoiceUrl: 'https://asaas.test/i/pay_123',
      pixQrCodeImage: 'base64',
      pixCopyPaste: 'copia-cola',
      pixExpiration: '2026-09-13T12:00:00.000Z',
      createdAt: '2026-09-12T10:00:00.000Z',
    });

    expect(result).toEqual({
      id: 1,
      items: [{ productSlug: 'x', productName: 'X', variantSku: 'S', colorName: 'C', configLabel: 'L', unitPrice: 10, qty: 2 }],
      totalAmount: 20,
      status: 'pending',
      asaasInvoiceUrl: 'https://asaas.test/i/pay_123',
      pixQrCodeImage: 'base64',
      pixCopyPaste: 'copia-cola',
      pixExpiration: '2026-09-13T12:00:00.000Z',
      createdAt: '2026-09-12T10:00:00.000Z',
    });
    expect((result as any).asaasPaymentId).toBeUndefined();
  });
});
```

- [ ] **Step 3: Confirmar que os testes falham**

Run: `npm test -- src/order/serialize-order.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 4: Implementar o serializer**

```ts
// src/order/serialize-order.ts
import type { OrderItem } from './pricing';

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed';

export type OrderRecord = {
  id: number;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  asaasPaymentId?: string | null;
  asaasInvoiceUrl?: string | null;
  pixQrCodeImage?: string | null;
  pixCopyPaste?: string | null;
  pixExpiration?: string | null;
  createdAt: string;
};

export type SerializedOrder = {
  id: number;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  asaasInvoiceUrl: string | null;
  pixQrCodeImage: string | null;
  pixCopyPaste: string | null;
  pixExpiration: string | null;
  createdAt: string;
};

export function serializeOrder(order: OrderRecord): SerializedOrder {
  return {
    id: order.id,
    items: order.items,
    totalAmount: order.totalAmount,
    status: order.status,
    asaasInvoiceUrl: order.asaasInvoiceUrl ?? null,
    pixQrCodeImage: order.pixQrCodeImage ?? null,
    pixCopyPaste: order.pixCopyPaste ?? null,
    pixExpiration: order.pixExpiration ?? null,
    createdAt: order.createdAt,
  };
}
```

- [ ] **Step 5: Rodar e confirmar sucesso do serializer**

Run: `npm test -- src/order/serialize-order.test.ts`
Expected: PASS

- [ ] **Step 6: Escrever os testes do controller**

```ts
// src/api/order/controllers/order.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/external/asaas.service', () => ({
  readAsaasConfigFromEnv: () => ({ apiUrl: 'x', apiKey: 'k', timeoutMs: 1000, userAgent: 'ua' }),
  createAsaasCustomer: vi.fn(),
  createAsaasPixCharge: vi.fn(),
  getAsaasPixQrCode: vi.fn(),
}));

import controller from './order';
import * as asaas from '../../../services/external/asaas.service';

function buildCtx(userId: number | undefined, body: unknown = {}, params: Record<string, string> = {}) {
  return {
    state: { user: userId ? { id: userId } : undefined },
    request: { body },
    params,
    status: 0,
    body: undefined,
    unauthorized: vi.fn(),
    notFound: vi.fn(),
  } as any;
}

function buildStrapiForCreate(opts: {
  product?: any;
  profile?: any;
  user?: any;
  order?: any;
}) {
  const queries: Record<string, any> = {
    'api::product.product': { findOne: vi.fn().mockResolvedValue(opts.product ?? null) },
    'api::customer-profile.customer-profile': {
      findOne: vi.fn().mockResolvedValue(opts.profile ?? null),
      update: vi.fn().mockResolvedValue(undefined),
    },
    'plugin::users-permissions.user': {
      findOne: vi.fn().mockResolvedValue(opts.user ?? { id: 1, username: 'joe', email: 'joe@example.com' }),
    },
    'api::order.order': {
      create: vi.fn().mockResolvedValue(opts.order ?? { id: 1, createdAt: '2026-09-12T10:00:00.000Z' }),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 1, createdAt: '2026-09-12T10:00:00.000Z', ...data })),
      findMany: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
    },
  };
  return { db: { query: (uid: string) => queries[uid] } };
}

const COMPLETE_PROFILE = {
  id: 5,
  cpfCnpj: '11144477735',
  addressLine: 'Rua X',
  addressNumber: '10',
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  postalCode: '01310100',
  asaasCustomerId: 'cus_existing',
};

const PRODUCT = {
  name: 'iPhone 15',
  variants: [{ sku: 'S1', colorName: 'Preto', configLabel: '128GB', price: 100, available: true }],
};

describe('order controller: create', () => {
  it('retorna 401 sem usuário', async () => {
    const ctx = buildCtx(undefined);
    (globalThis as any).strapi = buildStrapiForCreate({});
    await controller.create(ctx);
    expect(ctx.unauthorized).toHaveBeenCalled();
  });

  it('retorna 400 EMPTY_CART com items vazio', async () => {
    const ctx = buildCtx(1, { items: [] });
    (globalThis as any).strapi = buildStrapiForCreate({});
    await controller.create(ctx);
    expect(ctx.status).toBe(400);
    expect(ctx.body).toEqual({ ok: false, error: 'EMPTY_CART' });
  });

  it('retorna 422 PROFILE_INCOMPLETE sem perfil salvo', async () => {
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    (globalThis as any).strapi = buildStrapiForCreate({ product: PRODUCT, profile: null });
    await controller.create(ctx);
    expect(ctx.status).toBe(422);
    expect(ctx.body).toEqual({ ok: false, error: 'PROFILE_INCOMPLETE' });
  });

  it('cria o pedido e a cobrança Pix com perfil e asaasCustomerId já existentes', async () => {
    (asaas.createAsaasPixCharge as any).mockResolvedValue({
      ok: true,
      data: { id: 'pay_1', invoiceUrl: 'https://asaas.test/i/pay_1' },
    });
    (asaas.getAsaasPixQrCode as any).mockResolvedValue({
      ok: true,
      data: { encodedImage: 'b64', payload: 'copia-cola', expirationDate: '2026-09-13T00:00:00.000Z' },
    });

    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    (globalThis as any).strapi = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });

    await controller.create(ctx);

    expect(asaas.createAsaasCustomer).not.toHaveBeenCalled();
    expect(ctx.status).toBe(201);
    expect(ctx.body.ok).toBe(true);
    expect(ctx.body.data.pixCopyPaste).toBe('copia-cola');
  });

  it('marca o pedido como failed quando a cobrança Pix falha', async () => {
    (asaas.createAsaasPixCharge as any).mockResolvedValue({ ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 });

    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    (globalThis as any).strapi = strapiMock;

    await controller.create(ctx);

    expect(ctx.status).toBe(502);
    expect(ctx.body).toEqual({ ok: false, error: 'ASAAS_UNAVAILABLE' });
  });
});

describe('order controller: find/findOne', () => {
  it('find retorna só os pedidos do usuário autenticado', async () => {
    const ctx = buildCtx(1);
    const findMany = vi.fn().mockResolvedValue([]);
    (globalThis as any).strapi = { db: { query: () => ({ findMany }) } };
    await controller.find(ctx);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ user: 1 }) })
    );
  });

  it('findOne retorna 404 quando o pedido não pertence ao usuário', async () => {
    const ctx = buildCtx(1, {}, { id: '99' });
    (globalThis as any).strapi = { db: { query: () => ({ findOne: vi.fn().mockResolvedValue(null) }) } };
    await controller.findOne(ctx);
    expect(ctx.notFound).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Confirmar que os testes falham**

Run: `npm test -- src/api/order/controllers/order.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 8: Implementar o controller**

```ts
// src/api/order/controllers/order.ts
import type { Context } from 'koa';

import { resolveOrderItems, type ProductLookup } from '../../../order/pricing';
import { serializeOrder, type OrderRecord } from '../../../order/serialize-order';
import {
  createAsaasCustomer,
  createAsaasPixCharge,
  getAsaasPixQrCode,
  readAsaasConfigFromEnv,
} from '../../../services/external/asaas.service';

function makeProductLookup(): ProductLookup {
  return async (productSlug: string) => {
    const product: any = await strapi.db
      .query('api::product.product')
      .findOne({ where: { slug: productSlug }, populate: ['variants'] });

    if (!product) return null;

    return {
      name: product.name,
      variants: (product.variants || []).map((v: any) => ({
        sku: v.sku,
        colorName: v.colorName,
        configLabel: v.configLabel,
        price: Number(v.price ?? product.basePrice ?? 0),
        available: v.available !== false,
      })),
    };
  };
}

async function failOrder(orderId: number, code: string, status: number, ctx: Context) {
  await strapi.db.query('api::order.order').update({ where: { id: orderId }, data: { status: 'failed' } });
  ctx.status = status;
  ctx.body = { ok: false, error: code };
}

export default {
  async create(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const body = ctx.request.body as { items?: unknown };
    const pricing = await resolveOrderItems(body?.items, makeProductLookup());
    if (!pricing.ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: pricing.error };
      return;
    }

    const profile: any = await strapi.db
      .query('api::customer-profile.customer-profile')
      .findOne({ where: { user: userId } });

    if (!profile || !profile.cpfCnpj || !profile.addressLine) {
      ctx.status = 422;
      ctx.body = { ok: false, error: 'PROFILE_INCOMPLETE' };
      return;
    }

    const user: any = await strapi.db
      .query('plugin::users-permissions.user')
      .findOne({ where: { id: userId } });

    const order: OrderRecord = await strapi.db.query('api::order.order').create({
      data: { user: userId, items: pricing.items, totalAmount: pricing.totalAmount, status: 'pending' },
    });

    const asaasConfig = readAsaasConfigFromEnv();

    let asaasCustomerId: string | undefined = profile.asaasCustomerId;
    if (!asaasCustomerId) {
      const customerResult = await createAsaasCustomer(asaasConfig, {
        name: user.username,
        cpfCnpj: profile.cpfCnpj,
        email: user.email,
        phone: profile.phone || undefined,
        postalCode: profile.postalCode,
        addressNumber: profile.addressNumber,
        address: profile.addressLine,
        complement: profile.addressComplement || undefined,
        province: profile.neighborhood,
      });

      if (!customerResult.ok) {
        return failOrder(order.id, 'ASAAS_UNAVAILABLE', 502, ctx);
      }

      asaasCustomerId = customerResult.data.id;
      await strapi.db
        .query('api::customer-profile.customer-profile')
        .update({ where: { id: profile.id }, data: { asaasCustomerId } });
    }

    const chargeResult = await createAsaasPixCharge(asaasConfig, {
      customerId: asaasCustomerId,
      value: pricing.totalAmount,
      description: `Pedido #${order.id} - Valhalla Tecnologia`,
    });

    if (!chargeResult.ok) {
      return failOrder(order.id, 'ASAAS_UNAVAILABLE', 502, ctx);
    }

    const qrResult = await getAsaasPixQrCode(asaasConfig, chargeResult.data.id);
    if (!qrResult.ok) {
      return failOrder(order.id, 'ASAAS_UNAVAILABLE', 502, ctx);
    }

    const updated: OrderRecord = await strapi.db.query('api::order.order').update({
      where: { id: order.id },
      data: {
        asaasPaymentId: chargeResult.data.id,
        asaasInvoiceUrl: chargeResult.data.invoiceUrl,
        pixQrCodeImage: qrResult.data.encodedImage,
        pixCopyPaste: qrResult.data.payload,
        pixExpiration: qrResult.data.expirationDate,
      },
    });

    ctx.status = 201;
    ctx.body = { ok: true, data: serializeOrder(updated) };
  },

  async find(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const orders: OrderRecord[] = await strapi.db
      .query('api::order.order')
      .findMany({ where: { user: userId }, orderBy: { createdAt: 'desc' } });

    ctx.body = { ok: true, data: orders.map(serializeOrder) };
  },

  async findOne(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const id = Number(ctx.params.id);
    const order: OrderRecord | null = await strapi.db
      .query('api::order.order')
      .findOne({ where: { id, user: userId } });

    if (!order) return ctx.notFound();

    ctx.body = { ok: true, data: serializeOrder(order) };
  },
};
```

- [ ] **Step 9: Criar as rotas**

```ts
// src/api/order/routes/order.ts
export default {
  routes: [
    { method: 'POST', path: '/orders', handler: 'order.create', config: { policies: [] } },
    { method: 'GET', path: '/orders', handler: 'order.find', config: { policies: [] } },
    { method: 'GET', path: '/orders/:id', handler: 'order.findOne', config: { policies: [] } },
  ],
};
```

- [ ] **Step 10: Conceder permissão à role `authenticated`**

Em `src/index.ts`, atualize `AUTHENTICATED_ACTIONS` (criado no Task 2):

```ts
const AUTHENTICATED_ACTIONS: Record<string, string[]> = {
  'api::customer-profile.customer-profile': ['me', 'updateMe'],
  'api::order.order': ['create', 'find', 'findOne'],
};
```

- [ ] **Step 11: Rodar os testes e validar**

Run: `npm test -- src/api/order src/order`
Expected: PASS

Run: `npm run build`
Expected: exit 0

- [ ] **Step 12: Commit**

```bash
git add src/api/order src/order src/index.ts
git commit -m "feat: add order creation with Asaas Pix charge and order history routes"
```

---

### Task 6: Webhook Asaas

**Files:**
- Create: `src/policies/asaas-webhook-token.ts`
- Create: `src/policies/asaas-webhook-token.test.ts`
- Create: `src/order/webhook-mapping.ts`
- Create: `src/order/webhook-mapping.test.ts`
- Modify: `src/api/asaas/controllers/asaas.ts`
- Modify: `src/api/asaas/routes/asaas.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `mapAsaasEventToOrderStatus(event: string): OrderStatus | null`; policy `global::asaas-webhook-token`; rota `POST /api/asaas/webhook`.

- [ ] **Step 1: Escrever os testes do mapeamento de evento**

```ts
// src/order/webhook-mapping.test.ts
import { describe, expect, it } from 'vitest';
import { mapAsaasEventToOrderStatus } from './webhook-mapping';

describe('mapAsaasEventToOrderStatus', () => {
  it('mapeia PAYMENT_RECEIVED e PAYMENT_CONFIRMED para paid', () => {
    expect(mapAsaasEventToOrderStatus('PAYMENT_RECEIVED')).toBe('paid');
    expect(mapAsaasEventToOrderStatus('PAYMENT_CONFIRMED')).toBe('paid');
  });

  it('mapeia PAYMENT_OVERDUE para expired', () => {
    expect(mapAsaasEventToOrderStatus('PAYMENT_OVERDUE')).toBe('expired');
  });

  it('mapeia PAYMENT_DELETED para cancelled', () => {
    expect(mapAsaasEventToOrderStatus('PAYMENT_DELETED')).toBe('cancelled');
  });

  it('retorna null para evento desconhecido', () => {
    expect(mapAsaasEventToOrderStatus('PAYMENT_UPDATED')).toBeNull();
    expect(mapAsaasEventToOrderStatus('')).toBeNull();
  });
});
```

- [ ] **Step 2: Confirmar que falha**

Run: `npm test -- src/order/webhook-mapping.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```ts
// src/order/webhook-mapping.ts
import type { OrderStatus } from './serialize-order';

export function mapAsaasEventToOrderStatus(event: string): OrderStatus | null {
  switch (event) {
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_CONFIRMED':
      return 'paid';
    case 'PAYMENT_OVERDUE':
      return 'expired';
    case 'PAYMENT_DELETED':
      return 'cancelled';
    default:
      return null;
  }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- src/order/webhook-mapping.test.ts`
Expected: PASS

- [ ] **Step 5: Escrever os testes da policy**

```ts
// src/policies/asaas-webhook-token.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import policy from './asaas-webhook-token';

const ORIGINAL_ENV = process.env.ASAAS_WEBHOOK_TOKEN;

function buildContext(headerValue?: string): any {
  return {
    request: { header: headerValue === undefined ? {} : { 'asaas-access-token': headerValue } },
  };
}

describe('asaas-webhook-token policy', () => {
  beforeEach(() => {
    process.env.ASAAS_WEBHOOK_TOKEN = 'expected-webhook-token';
  });

  afterEach(() => {
    process.env.ASAAS_WEBHOOK_TOKEN = ORIGINAL_ENV;
  });

  it('permite quando o header bate com ASAAS_WEBHOOK_TOKEN', () => {
    expect(policy(buildContext('expected-webhook-token'), {}, { strapi: {} as never })).toBe(true);
  });

  it('nega quando o header não bate', () => {
    expect(policy(buildContext('wrong'), {}, { strapi: {} as never })).toBe(false);
  });

  it('nega quando o header está ausente', () => {
    expect(policy(buildContext(undefined), {}, { strapi: {} as never })).toBe(false);
  });

  it('nega quando ASAAS_WEBHOOK_TOKEN não está configurado', () => {
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    expect(policy(buildContext('anything'), {}, { strapi: {} as never })).toBe(false);
  });
});
```

- [ ] **Step 6: Confirmar que falha**

Run: `npm test -- src/policies/asaas-webhook-token.test.ts`
Expected: FAIL

- [ ] **Step 7: Implementar a policy**

```ts
// src/policies/asaas-webhook-token.ts
import { timingSafeEqual } from 'crypto';

import type { Core } from '@strapi/strapi';

export default (policyContext: Core.PolicyContext, _config: unknown, _opts: unknown): boolean => {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expectedToken) return false;

  const headerValue = policyContext.request?.header?.['asaas-access-token'];
  if (typeof headerValue !== 'string' || headerValue.length === 0) return false;

  return constantTimeEquals(headerValue, expectedToken);
};

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
```

- [ ] **Step 8: Rodar e confirmar sucesso**

Run: `npm test -- src/policies/asaas-webhook-token.test.ts`
Expected: PASS

- [ ] **Step 9: Adicionar a action `webhook` ao controller**

Adicione ao objeto exportado por `src/api/asaas/controllers/asaas.ts` (mantendo a action `test` já existente):

```ts
import { mapAsaasEventToOrderStatus } from '../../../order/webhook-mapping';

// ... dentro do objeto exportado, ao lado de `test`:
  async webhook(ctx: Context) {
    const body = ctx.request.body as { event?: unknown; payment?: { id?: unknown } };
    const event = typeof body?.event === 'string' ? body.event : '';
    const paymentId = typeof body?.payment?.id === 'string' ? body.payment.id : '';

    const status = mapAsaasEventToOrderStatus(event);

    if (status && paymentId) {
      const order = await strapi.db
        .query('api::order.order')
        .findOne({ where: { asaasPaymentId: paymentId } });

      if (order) {
        await strapi.db.query('api::order.order').update({ where: { id: order.id }, data: { status } });
      }
    }

    ctx.status = 200;
    ctx.body = { ok: true };
  },
```

- [ ] **Step 10: Adicionar a rota**

Em `src/api/asaas/routes/asaas.ts`, adicione ao array `routes` (mantendo a rota `/asaas/test`):

```ts
    {
      method: 'POST',
      path: '/asaas/webhook',
      handler: 'asaas.webhook',
      config: {
        policies: ['global::asaas-webhook-token'],
        auth: false,
      },
    },
```

- [ ] **Step 11: Declarar a variável de exemplo**

Em `.env.example`, adicione junto às demais variáveis `ASAAS_*`:

```
ASAAS_WEBHOOK_TOKEN=
```

- [ ] **Step 12: Rodar os testes e validar**

Run: `npm test`
Expected: PASS (suíte completa)

Run: `npm run build`
Expected: exit 0

- [ ] **Step 13: Commit**

```bash
git add src/policies/asaas-webhook-token.ts src/policies/asaas-webhook-token.test.ts \
  src/order/webhook-mapping.ts src/order/webhook-mapping.test.ts \
  src/api/asaas/controllers/asaas.ts src/api/asaas/routes/asaas.ts .env.example
git commit -m "feat: add Asaas webhook to confirm Pix payments"
```

---

## Frontend (`valhalla-ecommerce`)

### Task 7: Contratos e validação do checkout

**Files:**
- Create: `app/lib/checkout-contracts.ts`
- Create: `app/lib/checkout-validation.ts`
- Create: `app/lib/checkout-validation.test.ts`

**Interfaces:**
- Produces: tipos `OrderItemInput`, `OrderItem`, `Order`, `OrderStatus`, `CustomerProfile`, `CheckoutResult<T>`, `CHECKOUT_ERROR_CODES`; funções `onlyDigits`, `isValidCpfCnpj`, `isValidCep`, `isValidUf` — consumidos pelos Tasks 8, 9, 10, 11.

- [ ] **Step 1: Criar os contratos (sem lógica, sem teste — mesmo padrão de `auth-contracts.ts`)**

```ts
// app/lib/checkout-contracts.ts

export type OrderItemInput = { productSlug: string; variantSku: string; qty: number };

export type OrderItem = {
  productSlug: string;
  productName: string;
  variantSku: string;
  colorName: string;
  configLabel: string;
  unitPrice: number;
  qty: number;
};

export type OrderStatus = "pending" | "paid" | "expired" | "cancelled" | "failed";

export type Order = {
  id: number;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  asaasInvoiceUrl: string | null;
  pixQrCodeImage: string | null;
  pixCopyPaste: string | null;
  pixExpiration: string | null;
  createdAt: string;
};

export type CustomerProfile = {
  cpfCnpj: string;
  phone: string;
  addressLine: string;
  addressNumber: string;
  addressComplement: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
};

export type CheckoutResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

export const CHECKOUT_ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  PROFILE_INCOMPLETE: "PROFILE_INCOMPLETE",
  EMPTY_CART: "EMPTY_CART",
  INVALID_ITEM: "INVALID_ITEM",
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  VARIANT_NOT_FOUND: "VARIANT_NOT_FOUND",
  VARIANT_UNAVAILABLE: "VARIANT_UNAVAILABLE",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_ORIGIN: "INVALID_ORIGIN",
  RATE_LIMITED: "RATE_LIMITED",
  NOT_FOUND: "NOT_FOUND",
} as const;

export type CheckoutErrorCode = (typeof CHECKOUT_ERROR_CODES)[keyof typeof CHECKOUT_ERROR_CODES];
```

- [ ] **Step 2: Escrever os testes de validação**

```ts
// app/lib/checkout-validation.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { onlyDigits, isValidCpfCnpj, isValidCep, isValidUf } from "./checkout-validation";

test("onlyDigits remove tudo que não é dígito", () => {
  assert.equal(onlyDigits("123.456.789-09"), "12345678909");
});

test("isValidCpfCnpj aceita CPF válido", () => {
  assert.equal(isValidCpfCnpj("11144477735"), true);
});

test("isValidCpfCnpj rejeita CPF com dígito errado", () => {
  assert.equal(isValidCpfCnpj("11144477736"), false);
});

test("isValidCpfCnpj aceita CNPJ válido", () => {
  assert.equal(isValidCpfCnpj("11222333000181"), true);
});

test("isValidCpfCnpj rejeita comprimento inválido", () => {
  assert.equal(isValidCpfCnpj("123"), false);
});

test("isValidCep aceita 8 dígitos", () => {
  assert.equal(isValidCep("01310100"), true);
});

test("isValidCep rejeita comprimento diferente de 8", () => {
  assert.equal(isValidCep("123"), false);
});

test("isValidUf aceita UF maiúscula válida", () => {
  assert.equal(isValidUf("SP"), true);
});

test("isValidUf rejeita UF inexistente ou minúscula", () => {
  assert.equal(isValidUf("XX"), false);
  assert.equal(isValidUf("sp"), false);
});
```

- [ ] **Step 3: Confirmar que os testes falham**

Run: `npm test`
Expected: FAIL (módulo `checkout-validation` não existe — os demais testes existentes continuam passando).

- [ ] **Step 4: Implementar (mesmo algoritmo do backend, Task 1)**

```ts
// app/lib/checkout-validation.ts

const VALID_UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
]);

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCep(value: string): boolean {
  return /^\d{8}$/.test(value);
}

export function isValidUf(value: string): boolean {
  return VALID_UFS.has(value);
}

export function isValidCpfCnpj(value: string): boolean {
  if (value.length === 11) return isValidCpf(value);
  if (value.length === 14) return isValidCnpj(value);
  return false;
}

function isValidCpf(cpf: string): boolean {
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  return digit === Number(cpf[10]);
}

function isValidCnpj(cnpj: string): boolean {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (length: 12 | 13): number => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cnpj[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  if (calcDigit(12) !== Number(cnpj[12])) return false;
  return calcDigit(13) === Number(cnpj[13]);
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/lib/checkout-contracts.ts app/lib/checkout-validation.ts app/lib/checkout-validation.test.ts
git commit -m "feat: add checkout contracts and CPF/CNPJ/CEP/UF validation"
```

---

### Task 8: Cliente Strapi do checkout (server-only)

**Files:**
- Create: `app/lib/checkout-strapi-client.ts`
- Create: `app/lib/checkout-strapi-client.test.ts`

**Interfaces:**
- Consumes: `CheckoutResult`, `CustomerProfile`, `Order`, `OrderItemInput`, `CHECKOUT_ERROR_CODES` (Task 7).
- Produces: `getProfile`, `updateProfile`, `createOrder`, `listOrders`, `getOrder` — consumidos pelo Task 9.

- [ ] **Step 1: Escrever os testes**

```ts
// app/lib/checkout-strapi-client.test.ts
import test from "node:test";
import assert from "node:assert/strict";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

test("getProfile: retorna data em caso de sucesso", async (t) => {
  process.env.STRAPI_INTERNAL_URL = "http://strapi.internal";
  const { getProfile } = await import("./checkout-strapi-client");

  t.mock.method(globalThis, "fetch", async () => jsonResponse({ ok: true, data: null }));

  const result = await getProfile("token-abc");
  assert.deepEqual(result, { ok: true, data: null });
});

test("getProfile: mapeia 401 para UNAUTHENTICATED", async (t) => {
  process.env.STRAPI_INTERNAL_URL = "http://strapi.internal";
  const { getProfile } = await import("./checkout-strapi-client");

  t.mock.method(globalThis, "fetch", async () => jsonResponse({}, 401));

  const result = await getProfile("token-abc");
  assert.deepEqual(result, { ok: false, error: "UNAUTHENTICATED", status: 401 });
});

test("updateProfile: envia PUT com o corpo do perfil", async (t) => {
  process.env.STRAPI_INTERNAL_URL = "http://strapi.internal";
  const { updateProfile } = await import("./checkout-strapi-client");

  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({ ok: true, data: { cpfCnpj: "11144477735" } })
  );

  const profile = {
    cpfCnpj: "11144477735", phone: "", addressLine: "Rua X", addressNumber: "10",
    addressComplement: "", neighborhood: "Centro", city: "São Paulo", state: "SP", postalCode: "01310100",
  };
  const result = await updateProfile("token-abc", profile);

  assert.equal(result.ok, true);
  const [, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
  assert.equal(init.method, "PUT");
  assert.equal(JSON.parse(init.body as string).cpfCnpj, "11144477735");
});

test("createOrder: envia POST e retorna o pedido criado", async (t) => {
  process.env.STRAPI_INTERNAL_URL = "http://strapi.internal";
  const { createOrder } = await import("./checkout-strapi-client");

  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({ ok: true, data: { id: 1, status: "pending" } }, 201)
  );

  const result = await createOrder("token-abc", [{ productSlug: "x", variantSku: "S", qty: 1 }]);
  assert.deepEqual(result, { ok: true, data: { id: 1, status: "pending" } });
});

test("listOrders: retorna a lista de pedidos", async (t) => {
  process.env.STRAPI_INTERNAL_URL = "http://strapi.internal";
  const { listOrders } = await import("./checkout-strapi-client");

  t.mock.method(globalThis, "fetch", async () => jsonResponse({ ok: true, data: [] }));

  const result = await listOrders("token-abc");
  assert.deepEqual(result, { ok: true, data: [] });
});

test("getOrder: retorna NOT_FOUND para 404", async (t) => {
  process.env.STRAPI_INTERNAL_URL = "http://strapi.internal";
  const { getOrder } = await import("./checkout-strapi-client");

  t.mock.method(globalThis, "fetch", async () => jsonResponse({}, 404));

  const result = await getOrder("token-abc", 999);
  assert.deepEqual(result, { ok: false, error: "NOT_FOUND", status: 404 });
});
```

- [ ] **Step 2: Confirmar que os testes falham**

Run: `npm test`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// app/lib/checkout-strapi-client.ts
// Server-only: lê STRAPI_INTERNAL_URL, nunca importar de um client component.

import type { CheckoutResult, CustomerProfile, Order, OrderItemInput } from "./checkout-contracts";
import { CHECKOUT_ERROR_CODES } from "./checkout-contracts";

const REQUEST_TIMEOUT_MS = 10000;

function getBaseUrl(): string {
  const raw = process.env.STRAPI_INTERNAL_URL || process.env.STRAPI_URL;
  if (!raw || !raw.trim()) throw new Error("STRAPI_INTERNAL_URL is not set");
  return raw.trim().replace(/\/+$/, "");
}

function errorResult<T>(error: string, status: number): CheckoutResult<T> {
  return { ok: false, error, status };
}

async function request<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<CheckoutResult<T>> {
  let baseUrl: string;
  try {
    baseUrl = getBaseUrl();
  } catch {
    return errorResult(CHECKOUT_ERROR_CODES.UPSTREAM_ERROR, 500);
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return errorResult(CHECKOUT_ERROR_CODES.UPSTREAM_ERROR, 502);
  }

  if (res.status === 401 || res.status === 403) {
    return errorResult(CHECKOUT_ERROR_CODES.UNAUTHENTICATED, 401);
  }
  if (res.status === 404) {
    return errorResult(CHECKOUT_ERROR_CODES.NOT_FOUND, 404);
  }

  let body: { ok?: boolean; data?: T; error?: string } | undefined;
  try {
    body = await res.json();
  } catch {
    return errorResult(CHECKOUT_ERROR_CODES.UPSTREAM_ERROR, 502);
  }

  if (!res.ok || body?.ok === false) {
    const code = typeof body?.error === "string" ? body.error : CHECKOUT_ERROR_CODES.UPSTREAM_ERROR;
    return errorResult(code, res.status >= 400 ? res.status : 502);
  }

  return { ok: true, data: body!.data as T };
}

export async function getProfile(accessToken: string): Promise<CheckoutResult<CustomerProfile | null>> {
  return request<CustomerProfile | null>("/api/customer-profiles/me", accessToken, { method: "GET" });
}

export async function updateProfile(
  accessToken: string,
  profile: CustomerProfile
): Promise<CheckoutResult<CustomerProfile>> {
  return request<CustomerProfile>("/api/customer-profiles/me", accessToken, {
    method: "PUT",
    body: JSON.stringify(profile),
  });
}

export async function createOrder(
  accessToken: string,
  items: OrderItemInput[]
): Promise<CheckoutResult<Order>> {
  return request<Order>("/api/orders", accessToken, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function listOrders(accessToken: string): Promise<CheckoutResult<Order[]>> {
  return request<Order[]>("/api/orders", accessToken, { method: "GET" });
}

export async function getOrder(accessToken: string, id: number): Promise<CheckoutResult<Order>> {
  return request<Order>(`/api/orders/${id}`, accessToken, { method: "GET" });
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/lib/checkout-strapi-client.ts app/lib/checkout-strapi-client.test.ts
git commit -m "feat: add server-only checkout Strapi client"
```

---

### Task 9: Rotas BFF de checkout

**Files:**
- Create: `app/api/account/profile/route.ts`
- Create: `app/api/account/profile/route.test.ts`
- Create: `app/api/checkout/route.ts`
- Create: `app/api/checkout/route.test.ts`
- Create: `app/api/orders/route.ts`
- Create: `app/api/orders/route.test.ts`
- Create: `app/api/orders/[id]/route.ts`
- Create: `app/api/orders/[id]/route.test.ts`

**Interfaces:**
- Consumes: `resolveSession` (`app/lib/auth-session.ts`), `readAuthCookies`/`jsonError`/`jsonNoStore`/`getClientIp`/`isOriginAllowed`/`enforceRateLimit` (`app/api/auth/_shared.ts`), `getAllowedOrigin` (`app/lib/auth-request.ts`), tudo de `checkout-strapi-client.ts` e `checkout-contracts.ts`/`checkout-validation.ts` (Tasks 7-8).
- Produces: `GET/PUT /api/account/profile`, `POST /api/checkout`, `GET /api/orders`, `GET /api/orders/:id` — consumidos pelas UIs dos Tasks 10-11.

- [ ] **Step 1: Escrever os testes de `/api/account/profile`**

```ts
// app/api/account/profile/route.test.ts
import test from "node:test";
import assert from "node:assert/strict";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function makeRequest(url: string, init: RequestInit = {}, cookie?: string): Request {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  return new Request(url, { ...init, headers });
}

test("GET: 401 sem sessão", async (t) => {
  process.env.STRAPI_INTERNAL_URL = "http://strapi.internal";
  const { GET } = await import("./route");

  t.mock.method(globalThis, "fetch", async () => jsonResponse({}, 401));

  const res = await GET(makeRequest("http://localhost/api/account/profile"));
  assert.equal(res.status, 401);
});

test("GET: retorna o perfil com sessão válida", async (t) => {
  process.env.STRAPI_INTERNAL_URL = "http://strapi.internal";
  const { GET } = await import("./route");

  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/api/users/me")) {
      return jsonResponse({ id: 1, username: "joe", email: "joe@example.com", confirmed: true, blocked: false, role: {} });
    }
    return jsonResponse({ ok: true, data: null });
  });

  const res = await GET(makeRequest("http://localhost/api/account/profile", {}, "valhalla_access=tok"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { ok: true, data: null });
});

test("PUT: 400 VALIDATION_ERROR com CPF inválido", async (t) => {
  process.env.STRAPI_INTERNAL_URL = "http://strapi.internal";
  const { PUT } = await import("./route");

  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/api/users/me")) {
      return jsonResponse({ id: 1, username: "joe", email: "joe@example.com", confirmed: true, blocked: false, role: {} });
    }
    return jsonResponse({});
  });

  const res = await PUT(
    makeRequest(
      "http://localhost/api/account/profile",
      { method: "PUT", body: JSON.stringify({ cpfCnpj: "000", postalCode: "01310100", state: "SP", addressLine: "Rua X", addressNumber: "10", neighborhood: "Centro", city: "SP" }) },
      "valhalla_access=tok"
    )
  );
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Confirmar que falha**

Run: `npm test`
Expected: FAIL (`app/api/account/profile/route.ts` não existe)

- [ ] **Step 3: Implementar `/api/account/profile`**

```ts
// app/api/account/profile/route.ts
import { readAuthCookies, jsonError, jsonNoStore } from "../../auth/_shared";
import { resolveSession } from "../../../lib/auth-session";
import * as checkoutClient from "../../../lib/checkout-strapi-client";
import { CHECKOUT_ERROR_CODES } from "../../../lib/checkout-contracts";
import { isValidCep, isValidCpfCnpj, isValidUf, onlyDigits } from "../../../lib/checkout-validation";

export async function GET(request: Request): Promise<Response> {
  const { accessToken, refreshToken } = readAuthCookies(request);
  const session = await resolveSession(accessToken, refreshToken);
  if (!session.ok) return jsonError(session.error, session.status);

  const result = await checkoutClient.getProfile(accessToken!);
  if (!result.ok) return jsonError(result.error, result.status);
  return jsonNoStore({ ok: true, data: result.data });
}

export async function PUT(request: Request): Promise<Response> {
  const { accessToken, refreshToken } = readAuthCookies(request);
  const session = await resolveSession(accessToken, refreshToken);
  if (!session.ok) return jsonError(session.error, session.status);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError(CHECKOUT_ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const profile = {
    cpfCnpj: onlyDigits(typeof body.cpfCnpj === "string" ? body.cpfCnpj : ""),
    phone: onlyDigits(typeof body.phone === "string" ? body.phone : ""),
    addressLine: typeof body.addressLine === "string" ? body.addressLine.trim() : "",
    addressNumber: typeof body.addressNumber === "string" ? body.addressNumber.trim() : "",
    addressComplement: typeof body.addressComplement === "string" ? body.addressComplement.trim() : "",
    neighborhood: typeof body.neighborhood === "string" ? body.neighborhood.trim() : "",
    city: typeof body.city === "string" ? body.city.trim() : "",
    state: typeof body.state === "string" ? body.state.trim().toUpperCase() : "",
    postalCode: onlyDigits(typeof body.postalCode === "string" ? body.postalCode : ""),
  };

  if (
    !isValidCpfCnpj(profile.cpfCnpj) ||
    !isValidCep(profile.postalCode) ||
    !isValidUf(profile.state) ||
    !profile.addressLine ||
    !profile.addressNumber ||
    !profile.neighborhood ||
    !profile.city
  ) {
    return jsonError(CHECKOUT_ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const result = await checkoutClient.updateProfile(accessToken!, profile);
  if (!result.ok) return jsonError(result.error, result.status);
  return jsonNoStore({ ok: true, data: result.data });
}
```

- [ ] **Step 4: Rodar e confirmar sucesso de `/api/account/profile`**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Escrever os testes de `/api/checkout`**

```ts
// app/api/checkout/route.test.ts
import test from "node:test";
import assert from "node:assert/strict";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function makeRequest(body: unknown, cookie?: string): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return new Request("http://localhost/api/checkout", { method: "POST", headers, body: JSON.stringify(body) });
}

test("400 EMPTY_CART com items vazio", async (t) => {
  process.env.STRAPI_INTERNAL_URL = "http://strapi.internal";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost";
  const { POST } = await import("./route");

  t.mock.method(globalThis, "fetch", async (url: string) =>
    url.includes("/api/users/me")
      ? jsonResponse({ id: 1, username: "joe", email: "j@x.com", confirmed: true, blocked: false, role: {} })
      : jsonResponse({})
  );

  const res = await POST(makeRequest({ items: [] }, "valhalla_access=tok"));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "EMPTY_CART");
});

test("201 com pedido criado quando o Strapi confirma", async (t) => {
  process.env.STRAPI_INTERNAL_URL = "http://strapi.internal";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost";
  const { POST } = await import("./route");

  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/api/users/me")) {
      return jsonResponse({ id: 1, username: "joe", email: "j@x.com", confirmed: true, blocked: false, role: {} });
    }
    if (url.includes("/api/orders")) {
      return jsonResponse({ ok: true, data: { id: 1, status: "pending" } }, 201);
    }
    return jsonResponse({});
  });

  const res = await POST(
    makeRequest({ items: [{ productSlug: "x", variantSku: "S", qty: 1 }] }, "valhalla_access=tok")
  );
  assert.equal(res.status, 201);
});
```

- [ ] **Step 6: Confirmar que falha**

Run: `npm test`
Expected: FAIL

- [ ] **Step 7: Implementar `/api/checkout`**

```ts
// app/api/checkout/route.ts
import { readAuthCookies, jsonError, jsonNoStore, getClientIp, isOriginAllowed, enforceRateLimit } from "../auth/_shared";
import { resolveSession } from "../../lib/auth-session";
import { getAllowedOrigin } from "../../lib/auth-request";
import * as checkoutClient from "../../lib/checkout-strapi-client";
import { CHECKOUT_ERROR_CODES, type OrderItemInput } from "../../lib/checkout-contracts";

export async function POST(request: Request): Promise<Response> {
  if (!isOriginAllowed(request, getAllowedOrigin())) {
    return jsonError(CHECKOUT_ERROR_CODES.INVALID_ORIGIN, 403);
  }

  const { accessToken, refreshToken } = readAuthCookies(request);
  const session = await resolveSession(accessToken, refreshToken);
  if (!session.ok) return jsonError(session.error, session.status);

  const rateLimitKey = `checkout:${getClientIp(request)}`;
  const rateLimit = enforceRateLimit(rateLimitKey, 10, 5 * 60 * 1000);
  if (!rateLimit.allowed) return jsonError(CHECKOUT_ERROR_CODES.RATE_LIMITED, 429);

  let body: { items?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError(CHECKOUT_ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items: OrderItemInput[] = [];
  for (const raw of rawItems) {
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof (raw as Record<string, unknown>).productSlug !== "string" ||
      typeof (raw as Record<string, unknown>).variantSku !== "string" ||
      typeof (raw as Record<string, unknown>).qty !== "number"
    ) {
      return jsonError(CHECKOUT_ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const item = raw as Record<string, unknown>;
    items.push({
      productSlug: item.productSlug as string,
      variantSku: item.variantSku as string,
      qty: item.qty as number,
    });
  }
  if (items.length === 0) return jsonError(CHECKOUT_ERROR_CODES.EMPTY_CART, 400);

  const result = await checkoutClient.createOrder(accessToken!, items);
  if (!result.ok) return jsonError(result.error, result.status);

  return jsonNoStore({ ok: true, data: result.data }, 201);
}
```

- [ ] **Step 8: Rodar e confirmar sucesso de `/api/checkout`**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Escrever os testes de `/api/orders` e `/api/orders/[id]`**

```ts
// app/api/orders/route.test.ts
import test from "node:test";
import assert from "node:assert/strict";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

test("GET: retorna a lista de pedidos com sessão válida", async (t) => {
  process.env.STRAPI_INTERNAL_URL = "http://strapi.internal";
  const { GET } = await import("./route");

  t.mock.method(globalThis, "fetch", async (url: string) =>
    url.includes("/api/users/me")
      ? jsonResponse({ id: 1, username: "joe", email: "j@x.com", confirmed: true, blocked: false, role: {} })
      : jsonResponse({ ok: true, data: [] })
  );

  const headers = new Headers({ cookie: "valhalla_access=tok" });
  const res = await GET(new Request("http://localhost/api/orders", { headers }));
  assert.equal(res.status, 200);
});
```

```ts
// app/api/orders/[id]/route.test.ts
import test from "node:test";
import assert from "node:assert/strict";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

test("GET: 404 quando o pedido não é encontrado", async (t) => {
  process.env.STRAPI_INTERNAL_URL = "http://strapi.internal";
  const { GET } = await import("./route");

  t.mock.method(globalThis, "fetch", async (url: string) =>
    url.includes("/api/users/me")
      ? jsonResponse({ id: 1, username: "joe", email: "j@x.com", confirmed: true, blocked: false, role: {} })
      : jsonResponse({}, 404)
  );

  const headers = new Headers({ cookie: "valhalla_access=tok" });
  const res = await GET(new Request("http://localhost/api/orders/999", { headers }), {
    params: Promise.resolve({ id: "999" }),
  });
  assert.equal(res.status, 404);
});
```

- [ ] **Step 10: Confirmar que falham**

Run: `npm test`
Expected: FAIL

- [ ] **Step 11: Implementar `/api/orders` e `/api/orders/[id]`**

```ts
// app/api/orders/route.ts
import { readAuthCookies, jsonError, jsonNoStore } from "../auth/_shared";
import { resolveSession } from "../../lib/auth-session";
import * as checkoutClient from "../../lib/checkout-strapi-client";

export async function GET(request: Request): Promise<Response> {
  const { accessToken, refreshToken } = readAuthCookies(request);
  const session = await resolveSession(accessToken, refreshToken);
  if (!session.ok) return jsonError(session.error, session.status);

  const result = await checkoutClient.listOrders(accessToken!);
  if (!result.ok) return jsonError(result.error, result.status);
  return jsonNoStore({ ok: true, data: result.data });
}
```

```ts
// app/api/orders/[id]/route.ts
import { readAuthCookies, jsonError, jsonNoStore } from "../../auth/_shared";
import { resolveSession } from "../../../lib/auth-session";
import * as checkoutClient from "../../../lib/checkout-strapi-client";
import { CHECKOUT_ERROR_CODES } from "../../../lib/checkout-contracts";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { accessToken, refreshToken } = readAuthCookies(request);
  const session = await resolveSession(accessToken, refreshToken);
  if (!session.ok) return jsonError(session.error, session.status);

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return jsonError(CHECKOUT_ERROR_CODES.NOT_FOUND, 404);
  }

  const result = await checkoutClient.getOrder(accessToken!, orderId);
  if (!result.ok) return jsonError(result.error, result.status);
  return jsonNoStore({ ok: true, data: result.data });
}
```

- [ ] **Step 12: Rodar todos os testes, lint e build**

Run: `npm test && npm run lint && npm run build`
Expected: `npm test` PASS; `npm run build` exit 0 (`npm run lint` já tinha achados pré-existentes antes deste plano — não deixar a rota nova introduzir novos).

- [ ] **Step 13: Commit**

```bash
git add app/api/account app/api/checkout app/api/orders
git commit -m "feat: expose checkout BFF routes (profile, checkout, orders)"
```

---

### Task 10: Tela de checkout e botão "Pagar com Pix" em `/lista`

**Files:**
- Create: `app/checkout/page.tsx`
- Create: `app/components/CheckoutClient.tsx`
- Create: `app/components/PixPayment.tsx`
- Modify: `app/components/ListaClient.tsx`
- Modify: `app/components/AccountMenu.tsx`

**Interfaces:**
- Consumes: `useCart` (`CartProvider.tsx`), `CustomerProfile`/`Order`/`OrderStatus` (Task 7), rotas `/api/account/profile`, `/api/checkout`, `/api/orders/[id]` (Task 9).

- [ ] **Step 1: Adicionar o botão "Pagar com Pix" em `ListaClient.tsx`**

No bloco de botões do step `"cart"` (`app/components/ListaClient.tsx`, dentro de `<div className="flex gap-3 flex-wrap">`, ao lado de "Revisar solicitação →"), adicione:

```tsx
<Link
  className="vh-btn-lime bg-vh-lime border-0 rounded-vh-11 py-3.75 px-7 font-bold text-vh-14 font-space-grotesk cursor-pointer shadow-vh-lime-24 text-vh-ink!"
  href="/checkout"
>
  Pagar com Pix →
</Link>
```

Não altere mais nada no arquivo — o step `"review"`/WhatsApp continua igual.

- [ ] **Step 2: Adicionar "Meus pedidos" em `AccountMenu.tsx`**

Em `app/components/AccountMenu.tsx`, importe `Receipt` de `lucide-react` e adicione um item entre "Minha lista" e o botão "Sair" (mesmo padrão visual do item existente, sem badge):

```tsx
<Link
  href="/pedidos"
  role="menuitem"
  onClick={() => setOpen(false)}
  className="vh-dropdown-item flex items-center gap-2 py-2.5 px-3.5 font-semibold text-vh-12-5 font-manrope text-vh-soft no-underline border-t border-t-vh-border [transition:background_.12s,color_.12s]"
>
  <Receipt aria-hidden="true" size={15} strokeWidth={2} />
  Meus pedidos
</Link>
```

- [ ] **Step 3: Implementar `PixPayment.tsx`**

```tsx
// app/components/PixPayment.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Order } from "../lib/checkout-contracts";
import { useCart } from "./CartProvider";

export default function PixPayment({ order }: { order: Order }) {
  const router = useRouter();
  const { clear } = useCart();
  const [status, setStatus] = useState(order.status);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status !== "pending") return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/orders/${order.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      if (body?.ok) setStatus(body.data.status);
    }, 5000);
    return () => clearInterval(interval);
  }, [status, order.id]);

  useEffect(() => {
    if (status === "paid") {
      clear();
      router.push(`/pedidos/${order.id}`);
    }
  }, [status, clear, router, order.id]);

  if (status === "expired") {
    return (
      <div className="text-center py-10">
        <h2 className="font-bold text-vh-20 font-space-grotesk mb-2">Pix expirado</h2>
        <p className="font-medium text-vh-14 font-manrope text-vh-muted mb-5">
          O tempo para pagamento acabou. Volte ao carrinho para gerar um novo pedido.
        </p>
        <a href="/lista" className="vh-btn-lime bg-vh-lime border-0 rounded-vh-11 py-3.5 px-6 font-bold text-vh-14 font-space-grotesk text-vh-ink!">
          Voltar ao carrinho
        </a>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="text-center py-10">
        <h2 className="font-bold text-vh-20 font-space-grotesk mb-2">Não foi possível gerar o Pix</h2>
        <p className="font-medium text-vh-14 font-manrope text-vh-muted">Tente novamente em instantes.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      {order.pixQrCodeImage && (
        <img
          src={`data:image/png;base64,${order.pixQrCodeImage}`}
          alt="QR code Pix"
          className="w-56 h-56 rounded-xl border border-vh-border"
        />
      )}
      {order.pixCopyPaste && (
        <button
          type="button"
          className="vh-btn-lime bg-vh-lime border-0 rounded-vh-10 py-3 px-5 font-bold text-vh-13 font-space-grotesk text-vh-ink!"
          onClick={async () => {
            await navigator.clipboard.writeText(order.pixCopyPaste!);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copiado!" : "Copiar código Pix"}
        </button>
      )}
      <p className="font-medium text-vh-12 font-manrope text-vh-muted text-center">
        Aguardando confirmação do pagamento...
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Implementar `CheckoutClient.tsx`**

```tsx
// app/components/CheckoutClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fmt } from "../lib/wa";
import { useCart } from "./CartProvider";
import type { CustomerProfile, Order } from "../lib/checkout-contracts";
import PixPayment from "./PixPayment";

const EMPTY_PROFILE: CustomerProfile = {
  cpfCnpj: "", phone: "", addressLine: "", addressNumber: "",
  addressComplement: "", neighborhood: "", city: "", state: "", postalCode: "",
};

export default function CheckoutClient() {
  const router = useRouter();
  const { cart, cartTotal, cartCount } = useCart();
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profile, setProfile] = useState<CustomerProfile>(EMPTY_PROFILE);
  const [profileComplete, setProfileComplete] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [payingNow, setPayingNow] = useState(false);

  useEffect(() => {
    if (cartCount === 0) router.replace("/lista");
  }, [cartCount, router]);

  useEffect(() => {
    fetch("/api/account/profile", { cache: "no-store" })
      .then((res) => {
        if (res.status === 401) {
          router.replace("/entrar?returnTo=/checkout");
          return null;
        }
        return res.json();
      })
      .then((body) => {
        if (!body?.ok) return;
        if (body.data) {
          setProfile(body.data);
          setProfileComplete(true);
        }
      })
      .finally(() => setLoadingProfile(false));
  }, [router]);

  async function saveProfile() {
    setSavingProfile(true);
    setProfileError("");
    const res = await fetch("/api/account/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    const body = await res.json();
    setSavingProfile(false);
    if (!body.ok) {
      setProfileError("Confira os dados: CPF/CNPJ, CEP e UF precisam ser válidos.");
      return;
    }
    setProfileComplete(true);
  }

  async function payWithPix() {
    setPayingNow(true);
    setCheckoutError("");
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.map((it) => ({ productSlug: it.productSlug, variantSku: it.variantSku, qty: it.qty })),
      }),
    });
    const body = await res.json();
    setPayingNow(false);
    if (!body.ok) {
      setCheckoutError("Não foi possível iniciar o pagamento. Tente novamente.");
      return;
    }
    setOrder(body.data);
  }

  if (loadingProfile) return null;

  if (order) {
    return (
      <section className="max-w-155 my-0 mx-auto py-10 px-6 w-full">
        <h1 className="mt-0 mx-0 mb-2 font-bold text-vh-30 font-space-grotesk text-center">Pague com Pix</h1>
        <p className="mt-0 mx-0 mb-6 font-bold text-vh-24 font-space-grotesk text-vh-lime text-center">
          {fmt(order.totalAmount)}
        </p>
        <PixPayment order={order} />
      </section>
    );
  }

  if (!profileComplete) {
    return (
      <section className="max-w-135 my-0 mx-auto py-10 px-6 w-full">
        <h1 className="mt-0 mx-0 mb-6 font-bold text-vh-24 font-space-grotesk">Complete seus dados</h1>
        <div className="flex flex-col gap-3">
          <input className="vh-input bg-vh-card border border-vh-border rounded-vh-10 py-3 px-4 text-white" placeholder="CPF ou CNPJ" value={profile.cpfCnpj} onChange={(e) => setProfile({ ...profile, cpfCnpj: e.target.value })} />
          <input className="vh-input bg-vh-card border border-vh-border rounded-vh-10 py-3 px-4 text-white" placeholder="Telefone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          <input className="vh-input bg-vh-card border border-vh-border rounded-vh-10 py-3 px-4 text-white" placeholder="Rua" value={profile.addressLine} onChange={(e) => setProfile({ ...profile, addressLine: e.target.value })} />
          <input className="vh-input bg-vh-card border border-vh-border rounded-vh-10 py-3 px-4 text-white" placeholder="Número" value={profile.addressNumber} onChange={(e) => setProfile({ ...profile, addressNumber: e.target.value })} />
          <input className="vh-input bg-vh-card border border-vh-border rounded-vh-10 py-3 px-4 text-white" placeholder="Complemento (opcional)" value={profile.addressComplement} onChange={(e) => setProfile({ ...profile, addressComplement: e.target.value })} />
          <input className="vh-input bg-vh-card border border-vh-border rounded-vh-10 py-3 px-4 text-white" placeholder="Bairro" value={profile.neighborhood} onChange={(e) => setProfile({ ...profile, neighborhood: e.target.value })} />
          <input className="vh-input bg-vh-card border border-vh-border rounded-vh-10 py-3 px-4 text-white" placeholder="Cidade" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
          <input className="vh-input bg-vh-card border border-vh-border rounded-vh-10 py-3 px-4 text-white" placeholder="UF" maxLength={2} value={profile.state} onChange={(e) => setProfile({ ...profile, state: e.target.value.toUpperCase() })} />
          <input className="vh-input bg-vh-card border border-vh-border rounded-vh-10 py-3 px-4 text-white" placeholder="CEP" value={profile.postalCode} onChange={(e) => setProfile({ ...profile, postalCode: e.target.value })} />
          {profileError && <p className="text-vh-12 font-manrope text-red-400">{profileError}</p>}
          <button
            type="button"
            disabled={savingProfile}
            className="vh-btn-lime bg-vh-lime border-0 rounded-vh-11 py-3.5 px-6 font-bold text-vh-14 font-space-grotesk text-vh-ink! disabled:opacity-60"
            onClick={saveProfile}
          >
            {savingProfile ? "Salvando..." : "Salvar e continuar"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-155 my-0 mx-auto py-10 px-6 w-full">
      <h1 className="mt-0 mx-0 mb-6 font-bold text-vh-24 font-space-grotesk">Revise e pague</h1>
      <div className="bg-vh-card border border-vh-border rounded-2xl p-6 flex flex-col gap-3 mb-5">
        {cart.map((it) => (
          <div key={it.key} className="flex justify-between gap-3">
            <span className="font-semibold text-vh-13 font-manrope">{it.qty}× {it.productName}</span>
            <span className="font-bold text-vh-14 font-space-grotesk text-vh-lime">{fmt(it.unitPrice * it.qty)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-3 border-t border-t-vh-panel">
          <span className="font-bold text-vh-14 font-space-grotesk">Total</span>
          <span className="font-bold text-vh-20 font-space-grotesk text-vh-lime">{fmt(cartTotal)}</span>
        </div>
      </div>
      {checkoutError && <p className="text-vh-12 font-manrope text-red-400 mb-3">{checkoutError}</p>}
      <button
        type="button"
        disabled={payingNow}
        className="w-full vh-btn-lime bg-vh-lime border-0 rounded-vh-11 py-4 px-6 font-bold text-vh-15 font-space-grotesk text-vh-ink! disabled:opacity-60"
        onClick={payWithPix}
      >
        {payingNow ? "Gerando cobrança..." : "Pagar com Pix"}
      </button>
    </section>
  );
}
```

- [ ] **Step 5: Implementar `app/checkout/page.tsx`**

```tsx
// app/checkout/page.tsx
import CheckoutClient from "../components/CheckoutClient";

export default function CheckoutPage() {
  return <CheckoutClient />;
}
```

- [ ] **Step 6: Rodar lint e build**

Run: `npx eslint app/checkout app/components/CheckoutClient.tsx app/components/PixPayment.tsx app/components/ListaClient.tsx app/components/AccountMenu.tsx`
Expected: sem novos erros introduzidos por estes arquivos.

Run: `npm run build`
Expected: exit 0

- [ ] **Step 7: Verificação manual no navegador**

Com os containers rodando, logar, adicionar produto ao carrinho, ir em `/lista`, clicar "Pagar com Pix →", completar o formulário de perfil (1ª vez), confirmar que o QR code/copia-cola aparecem.

- [ ] **Step 8: Commit**

```bash
git add app/checkout app/components/CheckoutClient.tsx app/components/PixPayment.tsx \
  app/components/ListaClient.tsx app/components/AccountMenu.tsx
git commit -m "feat: add Pix checkout screen and entry point from Minha lista"
```

---

### Task 11: Histórico de pedidos

**Files:**
- Create: `app/pedidos/page.tsx`
- Create: `app/pedidos/[id]/page.tsx`
- Create: `app/components/OrdersListClient.tsx`
- Create: `app/components/OrderDetailClient.tsx`

**Interfaces:**
- Consumes: `Order`, `OrderStatus` (Task 7); rotas `/api/orders`, `/api/orders/[id]` (Task 9); `PixPayment` (Task 10, reusado quando o pedido detalhado ainda está `pending`).

- [ ] **Step 1: Implementar `OrdersListClient.tsx`**

```tsx
// app/components/OrdersListClient.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmt } from "../lib/wa";
import type { Order, OrderStatus } from "../lib/checkout-contracts";
import Breadcrumb from "./Breadcrumb";

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  expired: "Expirado",
  cancelled: "Cancelado",
  failed: "Falhou",
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: "text-vh-muted",
  paid: "text-vh-lime",
  expired: "text-red-400",
  cancelled: "text-red-400",
  failed: "text-red-400",
};

export default function OrdersListClient() {
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    fetch("/api/orders", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => setOrders(body?.ok ? body.data : []));
  }, []);

  return (
    <section className="max-w-215 my-0 mx-auto py-10 px-6 w-full">
      <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Meus pedidos" }]} />
      <h1 className="mt-0 mx-0 mb-6.5 font-bold text-vh-34 font-space-grotesk">Meus pedidos</h1>
      {orders === null && <p className="font-medium text-vh-14 font-manrope text-vh-muted">Carregando...</p>}
      {orders?.length === 0 && (
        <p className="font-medium text-vh-14 font-manrope text-vh-muted">Você ainda não fez nenhum pedido.</p>
      )}
      <div className="flex flex-col gap-3">
        {orders?.map((order) => (
          <Link
            key={order.id}
            href={`/pedidos/${order.id}`}
            className="flex justify-between items-center gap-4 bg-vh-card border border-vh-border rounded-vh-14 p-4 flex-wrap"
          >
            <div className="flex flex-col gap-1">
              <span className="font-bold text-vh-14-5 font-space-grotesk">Pedido #{order.id}</span>
              <span className="font-medium text-vh-12 font-manrope text-vh-muted">
                {new Date(order.createdAt).toLocaleDateString("pt-BR")}
              </span>
            </div>
            <span className={`font-bold text-vh-13 font-space-grotesk ${STATUS_COLOR[order.status]}`}>
              {STATUS_LABEL[order.status]}
            </span>
            <span className="font-bold text-vh-16 font-space-grotesk text-vh-lime">{fmt(order.totalAmount)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Implementar `OrderDetailClient.tsx`**

```tsx
// app/components/OrderDetailClient.tsx
"use client";

import { useEffect, useState } from "react";
import { fmt } from "../lib/wa";
import type { Order } from "../lib/checkout-contracts";
import Breadcrumb from "./Breadcrumb";
import PixPayment from "./PixPayment";

export default function OrderDetailClient({ id }: { id: number }) {
  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/orders/${id}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => setOrder(body?.ok ? body.data : null));
  }, [id]);

  if (order === undefined) return null;
  if (order === null) {
    return (
      <section className="max-w-155 my-0 mx-auto py-10 px-6 w-full text-center">
        <p className="font-medium text-vh-14 font-manrope text-vh-muted">Pedido não encontrado.</p>
      </section>
    );
  }

  return (
    <section className="max-w-155 my-0 mx-auto py-10 px-6 w-full">
      <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Meus pedidos", href: "/pedidos" }, { label: `#${order.id}` }]} />
      <h1 className="mt-0 mx-0 mb-6 font-bold text-vh-24 font-space-grotesk">Pedido #{order.id}</h1>
      <div className="bg-vh-card border border-vh-border rounded-2xl p-6 flex flex-col gap-3 mb-5">
        {order.items.map((it, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span className="font-semibold text-vh-13 font-manrope">{it.qty}× {it.productName}</span>
            <span className="font-bold text-vh-14 font-space-grotesk text-vh-lime">{fmt(it.unitPrice * it.qty)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-3 border-t border-t-vh-panel">
          <span className="font-bold text-vh-14 font-space-grotesk">Total</span>
          <span className="font-bold text-vh-20 font-space-grotesk text-vh-lime">{fmt(order.totalAmount)}</span>
        </div>
      </div>
      {order.status === "pending" && <PixPayment order={order} />}
    </section>
  );
}
```

- [ ] **Step 3: Implementar as páginas**

```tsx
// app/pedidos/page.tsx
import OrdersListClient from "../components/OrdersListClient";

export default function PedidosPage() {
  return <OrdersListClient />;
}
```

```tsx
// app/pedidos/[id]/page.tsx
import OrderDetailClient from "../../components/OrderDetailClient";

export default async function PedidoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetailClient id={Number(id)} />;
}
```

- [ ] **Step 4: Rodar a suíte final**

Run: `npm test && npm run lint && npm run build`
Expected: `npm test` PASS; `npm run build` exit 0 (mesmo aviso de lint pré-existente do restante do projeto, sem novos erros nestes arquivos).

- [ ] **Step 5: Verificação manual no navegador**

Com um pedido pago (ou marcado `paid` manualmente via admin do Strapi para teste), acessar `/pedidos` pelo menu "Meus pedidos" e conferir o detalhe em `/pedidos/[id]`.

- [ ] **Step 6: Commit**

```bash
git add app/pedidos app/components/OrdersListClient.tsx app/components/OrderDetailClient.tsx
git commit -m "feat: add order history screens"
```

## Verificação do plano

Cobertura: validação de CPF/CNPJ/CEP/UF (Tasks 1, 7), perfil do cliente (Tasks 2, 9-10), preço resolvido no servidor (Task 3), integração Asaas Pix (Tasks 4-5), webhook de confirmação (Task 6), rotas BFF (Tasks 8-9), tela de checkout entrando por "Minha lista" sem remover o WhatsApp (Task 10), histórico de pedidos no menu de conta (Task 11). Frete, estoque, outros meios de pagamento e cancelamento pelo cliente permanecem fora, conforme o spec.
