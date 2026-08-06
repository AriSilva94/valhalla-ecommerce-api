import { describe, expect, it, vi } from "vitest";

import { SEED_VERSION, seedAdminViews } from "../admin-view-seed";

const CONTENT_TYPE_PREFIX =
  "plugin_content_manager_configuration_content_types::";
const COMPONENT_PREFIX = "plugin_content_manager_configuration_components::";
const MARKER_KEY = "valhalla_admin_seed_version";

const PATCH_FIELDS: Record<string, string[]> = {
  [`${CONTENT_TYPE_PREFIX}api::product.product`]: [
    "name",
    "slug",
    "basePrice",
    "brand",
    "category",
    "tags",
    "variantGroupLabel",
    "variants",
    "specs",
    "description",
    "warranty",
    "mainImage",
    "gallery",
    "seo",
  ],
  [`${COMPONENT_PREFIX}ecommerce.variant`]: [
    "sku",
    "colorName",
    "colorHex",
    "configLabel",
    "price",
    "compareAtPrice",
    "available",
    "stockQuantity",
    "image",
  ],
  [`${CONTENT_TYPE_PREFIX}api::brand.brand`]: [
    "name",
    "slug",
    "logo",
    "products",
  ],
  [`${CONTENT_TYPE_PREFIX}api::category.category`]: [
    "name",
    "slug",
    "description",
    "sortOrder",
    "order",
    "image",
    "products",
  ],
  [`${CONTENT_TYPE_PREFIX}api::tag.tag`]: ["name", "slug", "products"],
  [`${CONTENT_TYPE_PREFIX}api::faq.faq`]: ["question", "answer", "order"],
  [`${CONTENT_TYPE_PREFIX}api::policy.policy`]: ["title", "slug", "body"],
  [`${CONTENT_TYPE_PREFIX}api::homepage.homepage`]: [
    "hero",
    "benefits",
    "steps",
    "testimonials",
    "whatsappBanner",
  ],
  [`${CONTENT_TYPE_PREFIX}api::site-setting.site-setting`]: [
    "whatsappNumber",
    "showTopBar",
    "topBarText",
    "showFab",
    "footerTagline",
    "footerLinkColumns",
    "footerLegalText",
    "contactEmail",
    "contactAddress",
    "contactHours",
    "aboutEyebrow",
    "aboutHeadline",
    "aboutText",
    "aboutStats",
    "aboutImage",
    "defaultSeo",
  ],
  [`${COMPONENT_PREFIX}shared.seo`]: [
    "metaTitle",
    "metaDescription",
    "shareImage",
  ],
  [`${COMPONENT_PREFIX}ecommerce.spec`]: ["key", "value"],
  [`${COMPONENT_PREFIX}institutional.banner`]: [
    "headline",
    "text",
    "buttonLabel",
    "buttonLink",
  ],
  [`${COMPONENT_PREFIX}institutional.benefit`]: [
    "icon",
    "title",
    "description",
  ],
  [`${COMPONENT_PREFIX}institutional.hero`]: [
    "eyebrow",
    "headlineAccent",
    "headline",
    "headlineHighlight",
    "subtext",
    "ctaLabel",
    "ctaLink",
    "secondaryCtaLabel",
    "secondaryCtaLink",
    "trustBadges",
  ],
  [`${COMPONENT_PREFIX}institutional.link-column`]: ["title", "links"],
  [`${COMPONENT_PREFIX}institutional.link`]: ["label", "url"],
  [`${COMPONENT_PREFIX}institutional.stat`]: ["value", "label"],
  [`${COMPONENT_PREFIX}institutional.step`]: ["number", "title", "description"],
  [`${COMPONENT_PREFIX}institutional.testimonial`]: [
    "quote",
    "authorName",
    "authorLocation",
  ],
  [`${COMPONENT_PREFIX}institutional.trust-badge`]: ["text"],
};

interface StoreRow {
  id: number;
  key: string;
  value: string;
  type?: string;
  environment?: string;
  tag?: string;
}

function makeConfig(fields: string[]) {
  return {
    settings: { bulkable: true, pageSize: 10 },
    metadatas: Object.fromEntries(
      fields.map((field) => [
        field,
        {
          edit: { label: `Edit ${field}`, description: "" },
          list: { label: `List ${field}` },
        },
      ]),
    ),
    layouts: {
      edit: fields.map((field) => [{ name: field, size: 6 }]),
      list: fields.slice(0, 2),
    },
  };
}

function makeHarness(keys: string[] = Object.keys(PATCH_FIELDS)) {
  const rows = new Map<string, StoreRow>();
  let nextId = 1;

  for (const key of keys) {
    rows.set(key, {
      id: nextId++,
      key,
      value: JSON.stringify(makeConfig(PATCH_FIELDS[key])),
    });
  }

  const coreStore = {
    findOne: vi.fn(async ({ where: { key } }: { where: { key: string } }) =>
      rows.get(key),
    ),
    update: vi.fn(
      async ({
        where: { id },
        data,
      }: {
        where: { id: number };
        data: Partial<StoreRow>;
      }) => {
        const existing = [...rows.values()].find((row) => row.id === id);
        if (!existing) throw new Error(`row ${id} not found`);
        const updated = { ...existing, ...data };
        rows.set(updated.key, updated);
        return updated;
      },
    ),
    create: vi.fn(async ({ data }: { data: Omit<StoreRow, "id"> }) => {
      const created = { id: nextId++, ...data };
      rows.set(created.key, created);
      return created;
    }),
  };

  const log = { info: vi.fn(), warn: vi.fn() };
  const transaction = vi.fn(async (callback: () => Promise<unknown>) => {
    const snapshot = new Map(
      [...rows.entries()].map(([key, row]) => [key, { ...row }]),
    );

    try {
      return await callback();
    } catch (error) {
      rows.clear();
      for (const [key, row] of snapshot) rows.set(key, row);
      throw error;
    }
  });
  const strapi = {
    db: { query: vi.fn(() => coreStore), transaction },
    log,
  };

  return {
    coreStore,
    log,
    rows,
    transaction,
    strapi: strapi as never,
    config(key: string) {
      return JSON.parse(rows.get(key)!.value);
    },
  };
}

const PRODUCT_EDIT_LAYOUT_V4 = [
  [
    { name: "name", size: 6 },
    { name: "slug", size: 6 },
  ],
  [
    { name: "mainImage", size: 6 },
    { name: "gallery", size: 6 },
  ],
  [{ name: "variantGroupLabel", size: 6 }],
  [{ name: "variants", size: 12 }],
  [{ name: "description", size: 12 }],
  [{ name: "specs", size: 12 }],
  [{ name: "warranty", size: 6 }],
  [
    { name: "brand", size: 6 },
    { name: "category", size: 6 },
  ],
  [{ name: "tags", size: 12 }],
  [{ name: "seo", size: 12 }],
];

describe("seedAdminViews", () => {
  it("aplica labels, ajuda, settings, lista, expõe o slug e oculta o basePrice", async () => {
    const harness = makeHarness();
    const productKey = `${CONTENT_TYPE_PREFIX}api::product.product`;

    await seedAdminViews(harness.strapi);

    const product = harness.config(productKey);
    expect(product.settings).toMatchObject({
      bulkable: true,
      defaultSortBy: "updatedAt",
      defaultSortOrder: "DESC",
      pageSize: 50,
      mainField: "name",
    });
    expect(product.metadatas.name.edit.label).toBe("Nome do produto");
    expect(product.metadatas.name.list.label).toBe("Nome do produto");
    expect(product.metadatas.slug.edit.label).toBe("Endereço (URL)");
    expect(product.layouts.list).toEqual(["mainImage", "name", "category"]);
    expect(product.layouts.edit).toEqual(PRODUCT_EDIT_LAYOUT_V4);
  });

  it("não faz nada quando o marker já está na versão atual", async () => {
    const harness = makeHarness();
    harness.rows.set(MARKER_KEY, {
      id: 99,
      key: MARKER_KEY,
      value: JSON.stringify(SEED_VERSION),
      type: "number",
      environment: "",
      tag: "",
    });

    await seedAdminViews(harness.strapi);

    expect(harness.coreStore.update).not.toHaveBeenCalled();
    expect(harness.coreStore.create).not.toHaveBeenCalled();
    expect(harness.log.info).not.toHaveBeenCalled();
    expect(harness.log.warn).not.toHaveBeenCalled();
  });

  it("trata marker com JSON malformado como versão zero e o corrige", async () => {
    const harness = makeHarness();
    harness.rows.set(MARKER_KEY, {
      id: 99,
      key: MARKER_KEY,
      value: "{invalido",
      type: "number",
      environment: "",
      tag: "",
    });

    await expect(seedAdminViews(harness.strapi)).resolves.toBeUndefined();

    expect(harness.log.warn).toHaveBeenCalledWith(
      `[admin-view-seed] marker inválido, tratando como versão 0: ${MARKER_KEY}`,
    );
    expect(
      harness.config(`${CONTENT_TYPE_PREFIX}api::product.product`).metadatas
        .name.edit.label,
    ).toBe("Nome do produto");
    expect(harness.rows.get(MARKER_KEY)?.value).toBe(JSON.stringify(SEED_VERSION));
    expect(harness.coreStore.create).not.toHaveBeenCalled();
  });

  it("migra v1 para a versão atual sem sobrescrever customizações dos patches antigos", async () => {
    const harness = makeHarness();
    const productKey = `${CONTENT_TYPE_PREFIX}api::product.product`;
    const variantKey = `${COMPONENT_PREFIX}ecommerce.variant`;
    const brandKey = `${CONTENT_TYPE_PREFIX}api::brand.brand`;
    const homepageKey = `${CONTENT_TYPE_PREFIX}api::homepage.homepage`;
    const product = harness.config(productKey);
    const variant = harness.config(variantKey);
    const brand = harness.config(brandKey);

    product.settings.pageSize = 17;
    product.settings.defaultSortBy = "name";
    product.metadatas.name.edit.label = "Nome personalizado";
    product.metadatas.name.list.label = "Nome personalizado";
    product.layouts.list = ["name"];
    variant.metadatas.sku.edit.label = "SKU personalizado";
    variant.metadatas.sku.list.label = "SKU personalizado";
    brand.metadatas.name.edit.label = "Marca personalizada";
    brand.metadatas.name.list.label = "Marca personalizada";
    harness.rows.get(productKey)!.value = JSON.stringify(product);
    harness.rows.get(variantKey)!.value = JSON.stringify(variant);
    harness.rows.get(brandKey)!.value = JSON.stringify(brand);
    harness.rows.set(MARKER_KEY, {
      id: 99,
      key: MARKER_KEY,
      value: JSON.stringify(1),
      type: "number",
      environment: "",
      tag: "",
    });

    await seedAdminViews(harness.strapi);

    expect(harness.config(productKey).settings).toMatchObject({
      pageSize: 17,
      defaultSortBy: "name",
    });
    expect(harness.config(productKey).metadatas.name.edit.label).toBe(
      "Nome personalizado",
    );
    expect(harness.config(productKey).layouts.list).toEqual(["name"]);
    expect(harness.config(variantKey).metadatas.sku.edit.label).toBe(
      "SKU personalizado",
    );
    expect(harness.config(brandKey).metadatas.name.edit.label).toBe(
      "Marca personalizada",
    );
    expect(harness.config(homepageKey).metadatas.hero.edit.label).toBe(
      "Destaque principal",
    );
    expect(harness.config(productKey).layouts.edit).toEqual(
      PRODUCT_EDIT_LAYOUT_V4,
    );
    const expectedUpdatedIds = [
      productKey,
      `${CONTENT_TYPE_PREFIX}api::category.category`,
      homepageKey,
      `${CONTENT_TYPE_PREFIX}api::site-setting.site-setting`,
      `${COMPONENT_PREFIX}institutional.banner`,
      `${COMPONENT_PREFIX}institutional.benefit`,
      `${COMPONENT_PREFIX}institutional.hero`,
      `${COMPONENT_PREFIX}institutional.link-column`,
      `${COMPONENT_PREFIX}institutional.link`,
      `${COMPONENT_PREFIX}institutional.stat`,
      `${COMPONENT_PREFIX}institutional.step`,
      `${COMPONENT_PREFIX}institutional.testimonial`,
      `${COMPONENT_PREFIX}institutional.trust-badge`,
    ].map((key) => harness.rows.get(key)!.id);
    expectedUpdatedIds.push(99);
    const updatedIds = harness.coreStore.update.mock.calls.map(
      ([
        {
          where: { id },
        },
      ]) => id,
    );
    expect(updatedIds.sort((left, right) => left - right)).toEqual(
      expectedUpdatedIds.sort((left, right) => left - right),
    );
    expect(harness.rows.get(MARKER_KEY)?.value).toBe(JSON.stringify(SEED_VERSION));
  });

  it("migra v2 para a versão atual mexendo apenas nas views de produto (v4) e categoria (v5/v6)", async () => {
    const harness = makeHarness();
    const productKey = `${CONTENT_TYPE_PREFIX}api::product.product`;
    const categoryKey = `${CONTENT_TYPE_PREFIX}api::category.category`;
    const product = harness.config(productKey);

    product.metadatas.name.edit.label = "Nome personalizado";
    product.layouts.list = ["mainImage", "name", "basePrice", "category"];
    harness.rows.get(productKey)!.value = JSON.stringify(product);
    harness.rows.set(MARKER_KEY, {
      id: 99,
      key: MARKER_KEY,
      value: JSON.stringify(2),
      type: "number",
      environment: "",
      tag: "",
    });

    await seedAdminViews(harness.strapi);

    const migrated = harness.config(productKey);
    expect(migrated.metadatas.name.edit.label).toBe("Nome personalizado");
    expect(migrated.layouts.list).toEqual(["mainImage", "name", "category"]);
    expect(migrated.layouts.edit).toEqual(PRODUCT_EDIT_LAYOUT_V4);
    expect(migrated.metadatas.slug.edit.label).toBe("Endereço (URL)");
    expect(migrated.metadatas.basePrice.edit.description).toBe(
      "Calculado com o menor preço entre as variações. Para mudar o preço, edite a variação",
    );

    const category = harness.config(categoryKey);
    expect(category.metadatas.sortOrder.edit.label).toBe("Ordem");
    expect(category.layouts.list).toEqual(["name", "sortOrder", "products"]);
    expect(category.settings).toMatchObject({
      defaultSortBy: "sortOrder",
      defaultSortOrder: "ASC",
    });
    expect(
      category.layouts.edit.flat().map((cell: { name: string }) => cell.name),
    ).not.toContain("order");

    const updatedIds = harness.coreStore.update.mock.calls.map(
      ([
        {
          where: { id },
        },
      ]) => id,
    );
    expect(updatedIds.sort((left, right) => left - right)).toEqual(
      [harness.rows.get(productKey)!.id, harness.rows.get(categoryKey)!.id, 99].sort(
        (left, right) => left - right,
      ),
    );
    expect(harness.rows.get(MARKER_KEY)?.value).toBe(JSON.stringify(SEED_VERSION));
  });

  it("migra o marker órfão v3 para v4", async () => {
    const harness = makeHarness();
    const productKey = `${CONTENT_TYPE_PREFIX}api::product.product`;
    harness.rows.set(MARKER_KEY, {
      id: 99,
      key: MARKER_KEY,
      value: JSON.stringify(3),
      type: "number",
      environment: "",
      tag: "",
    });

    await seedAdminViews(harness.strapi);

    expect(harness.config(productKey).layouts.edit).toEqual(
      PRODUCT_EDIT_LAYOUT_V4,
    );
    expect(harness.rows.get(MARKER_KEY)?.value).toBe(JSON.stringify(SEED_VERSION));
  });

  it("avisa sobre cada config ausente e não altera nenhuma config nem grava marker", async () => {
    const productKey = `${CONTENT_TYPE_PREFIX}api::product.product`;
    const harness = makeHarness([productKey]);
    const originalProduct = harness.rows.get(productKey)?.value;

    await seedAdminViews(harness.strapi);

    expect(harness.rows.get(productKey)?.value).toBe(originalProduct);
    expect(harness.coreStore.update).not.toHaveBeenCalled();
    expect(harness.log.warn).toHaveBeenCalledWith(
      `[admin-view-seed] config ausente, adiada: ${COMPONENT_PREFIX}ecommerce.variant`,
    );
    expect(harness.log.warn).toHaveBeenCalledTimes(
      Object.keys(PATCH_FIELDS).length - 1,
    );
    expect(harness.rows.has(MARKER_KEY)).toBe(false);
  });

  it("adia config com JSON malformado sem alterar as demais nem gravar marker", async () => {
    const productKey = `${CONTENT_TYPE_PREFIX}api::product.product`;
    const variantKey = `${COMPONENT_PREFIX}ecommerce.variant`;
    const harness = makeHarness();
    harness.rows.get(productKey)!.value = "{invalido";
    const originalVariant = harness.rows.get(variantKey)?.value;

    await expect(seedAdminViews(harness.strapi)).resolves.toBeUndefined();

    expect(harness.rows.get(productKey)?.value).toBe("{invalido");
    expect(harness.rows.get(variantKey)?.value).toBe(originalVariant);
    expect(harness.coreStore.update).not.toHaveBeenCalled();
    expect(harness.log.warn).toHaveBeenCalledWith(
      `[admin-view-seed] config inválida, adiada: ${productKey} (JSON malformado)`,
    );
    expect(harness.rows.has(MARKER_KEY)).toBe(false);
  });

  it.each([
    [
      "settings como array",
      { settings: [], metadatas: {}, layouts: { edit: [], list: [] } },
    ],
    ["metadatas ausente", { settings: {}, layouts: { edit: [], list: [] } }],
    [
      "metadatas como array",
      { settings: {}, metadatas: [], layouts: { edit: [], list: [] } },
    ],
    ["layouts ausente", { settings: {}, metadatas: {} }],
    [
      "layouts.edit fora de array",
      { settings: {}, metadatas: {}, layouts: { edit: {}, list: [] } },
    ],
    [
      "layouts.list fora de array",
      { settings: {}, metadatas: {}, layouts: { edit: [], list: null } },
    ],
    [
      "layouts.edit com row fora de array",
      { settings: {}, metadatas: {}, layouts: { edit: [{}], list: [] } },
    ],
    [
      "layouts.edit com cell null",
      { settings: {}, metadatas: {}, layouts: { edit: [[null]], list: [] } },
    ],
    [
      "layouts.edit com cell booleana",
      { settings: {}, metadatas: {}, layouts: { edit: [[true]], list: [] } },
    ],
    [
      "layouts.edit com cell sem name",
      {
        settings: {},
        metadatas: {},
        layouts: { edit: [[{ size: 6 }]], list: [] },
      },
    ],
    [
      "layouts.list com item não-string",
      {
        settings: {},
        metadatas: {},
        layouts: { edit: [], list: ["name", null] },
      },
    ],
    [
      "metadata entry fora de objeto",
      {
        settings: {},
        metadatas: { name: true },
        layouts: { edit: [], list: [] },
      },
    ],
    [
      "metadata.edit fora de objeto",
      {
        settings: {},
        metadatas: { name: { edit: true, list: {} } },
        layouts: { edit: [], list: [] },
      },
    ],
    [
      "metadata.list fora de objeto",
      {
        settings: {},
        metadatas: { name: { edit: {}, list: [] } },
        layouts: { edit: [], list: [] },
      },
    ],
  ])("adia config com shape inválido: %s", async (_case, invalidConfig) => {
    const productKey = `${CONTENT_TYPE_PREFIX}api::product.product`;
    const variantKey = `${COMPONENT_PREFIX}ecommerce.variant`;
    const harness = makeHarness();
    const invalidValue = JSON.stringify(invalidConfig);
    harness.rows.get(productKey)!.value = invalidValue;
    const originalVariant = harness.rows.get(variantKey)?.value;

    await expect(seedAdminViews(harness.strapi)).resolves.toBeUndefined();

    expect(harness.rows.get(productKey)?.value).toBe(invalidValue);
    expect(harness.rows.get(variantKey)?.value).toBe(originalVariant);
    expect(harness.coreStore.update).not.toHaveBeenCalled();
    expect(harness.log.warn).toHaveBeenCalledWith(
      `[admin-view-seed] config inválida, adiada: ${productKey} (formato inesperado)`,
    );
    expect(harness.rows.has(MARKER_KEY)).toBe(false);
  });

  it("não altera nenhuma config quando um campo esperado não tem metadata de edição", async () => {
    const variantKey = `${COMPONENT_PREFIX}ecommerce.variant`;
    const harness = makeHarness();
    const variant = harness.config(variantKey);
    delete variant.metadatas.sku.edit;
    harness.rows.get(variantKey)!.value = JSON.stringify(variant);
    const originalProduct = harness.rows.get(
      `${CONTENT_TYPE_PREFIX}api::product.product`,
    )?.value;

    await seedAdminViews(harness.strapi);

    expect(harness.coreStore.update).not.toHaveBeenCalled();
    expect(
      harness.rows.get(`${CONTENT_TYPE_PREFIX}api::product.product`)?.value,
    ).toBe(originalProduct);
    expect(harness.rows.has(MARKER_KEY)).toBe(false);
    expect(harness.log.warn).toHaveBeenCalledWith(
      `[admin-view-seed] config inválida, adiada: ${variantKey} (campos esperados ausentes)`,
    );
  });

  it("reverte todos os updates quando uma escrita falha dentro da transação", async () => {
    const harness = makeHarness();
    const originalValues = new Map(
      [...harness.rows.entries()].map(([key, row]) => [key, row.value]),
    );
    const updateImplementation =
      harness.coreStore.update.getMockImplementation()!;
    let updateCount = 0;
    harness.coreStore.update.mockImplementation(async (args) => {
      updateCount += 1;
      if (updateCount === 2) throw new Error("falha de escrita simulada");
      return updateImplementation(args);
    });

    await expect(seedAdminViews(harness.strapi)).rejects.toThrow(
      "falha de escrita simulada",
    );

    expect(harness.transaction).toHaveBeenCalledOnce();
    expect(harness.rows.has(MARKER_KEY)).toBe(false);
    for (const [key, value] of originalValues) {
      expect(harness.rows.get(key)?.value).toBe(value);
    }
  });

  it("aplica todas as configs e cria o marker de versão", async () => {
    const harness = makeHarness();

    await seedAdminViews(harness.strapi);

    expect(
      harness.config(`${COMPONENT_PREFIX}ecommerce.variant`).metadatas.sku.edit
        .label,
    ).toBe("Código (SKU)");
    expect(
      harness.config(`${CONTENT_TYPE_PREFIX}api::category.category`).metadatas
        .slug.edit.label,
    ).toBe("Endereço (URL)");
    expect(
      harness.config(`${COMPONENT_PREFIX}shared.seo`).metadatas.metaTitle.edit
        .description,
    ).toBe("Até 60 caracteres. Vazio = usa o nome do produto");
    expect(
      harness.config(`${CONTENT_TYPE_PREFIX}api::homepage.homepage`).metadatas
        .hero.edit.label,
    ).toBe("Destaque principal");
    expect(
      harness.config(`${CONTENT_TYPE_PREFIX}api::site-setting.site-setting`)
        .metadatas.whatsappNumber.edit.description,
    ).toBe("Somente números, com código do país e DDD. Ex.: 5511999999999");
    expect(
      harness.config(`${COMPONENT_PREFIX}institutional.hero`).metadatas.ctaLink
        .edit.label,
    ).toBe("Link do botão principal");
    expect(
      harness.config(`${COMPONENT_PREFIX}institutional.link`).metadatas.url.edit
        .description,
    ).toBe("Use uma rota do site (ex.: /produtos) ou uma URL completa");
    for (const key of Object.keys(PATCH_FIELDS)) {
      for (const field of PATCH_FIELDS[key]) {
        expect(harness.config(key).metadatas[field].edit.label).not.toMatch(
          /^Edit /,
        );
        expect(harness.config(key).metadatas[field].list.label).not.toMatch(
          /^List /,
        );
      }
    }
    expect(harness.rows.get(MARKER_KEY)).toMatchObject({
      key: MARKER_KEY,
      value: JSON.stringify(SEED_VERSION),
      type: "number",
      environment: "",
      tag: "",
    });
    expect(harness.log.info).toHaveBeenCalledWith(
      "[admin-view-seed] views do admin configuradas (pt-BR)",
    );
  });

  it("audita todas as configurações próprias presentes no core store do app", () => {
    expect(Object.keys(PATCH_FIELDS).sort()).toEqual(
      [
        `${CONTENT_TYPE_PREFIX}api::brand.brand`,
        `${CONTENT_TYPE_PREFIX}api::category.category`,
        `${CONTENT_TYPE_PREFIX}api::faq.faq`,
        `${CONTENT_TYPE_PREFIX}api::homepage.homepage`,
        `${CONTENT_TYPE_PREFIX}api::policy.policy`,
        `${CONTENT_TYPE_PREFIX}api::product.product`,
        `${CONTENT_TYPE_PREFIX}api::site-setting.site-setting`,
        `${CONTENT_TYPE_PREFIX}api::tag.tag`,
        `${COMPONENT_PREFIX}ecommerce.spec`,
        `${COMPONENT_PREFIX}ecommerce.variant`,
        `${COMPONENT_PREFIX}institutional.banner`,
        `${COMPONENT_PREFIX}institutional.benefit`,
        `${COMPONENT_PREFIX}institutional.hero`,
        `${COMPONENT_PREFIX}institutional.link-column`,
        `${COMPONENT_PREFIX}institutional.link`,
        `${COMPONENT_PREFIX}institutional.stat`,
        `${COMPONENT_PREFIX}institutional.step`,
        `${COMPONENT_PREFIX}institutional.testimonial`,
        `${COMPONENT_PREFIX}institutional.trust-badge`,
        `${COMPONENT_PREFIX}shared.seo`,
      ].sort(),
    );
  });

  it("preserva ajustes manuais após o marker ser criado", async () => {
    const harness = makeHarness();
    const productKey = `${CONTENT_TYPE_PREFIX}api::product.product`;

    await seedAdminViews(harness.strapi);
    const product = harness.config(productKey);
    product.metadatas.name.edit.label = "Nome ajustado manualmente";
    harness.rows.get(productKey)!.value = JSON.stringify(product);
    harness.coreStore.update.mockClear();

    await seedAdminViews(harness.strapi);

    expect(harness.config(productKey).metadatas.name.edit.label).toBe(
      "Nome ajustado manualmente",
    );
    expect(harness.coreStore.update).not.toHaveBeenCalled();
  });
});
