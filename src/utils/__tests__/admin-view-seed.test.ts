import { describe, expect, it, vi } from "vitest";

import { seedAdminViews } from "../admin-view-seed";

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
  const strapi = {
    db: { query: vi.fn(() => coreStore) },
    log,
  };

  return {
    coreStore,
    log,
    rows,
    strapi: strapi as never,
    config(key: string) {
      return JSON.parse(rows.get(key)!.value);
    },
  };
}

describe("seedAdminViews", () => {
  it("aplica labels, ajuda, settings, lista e oculta o slug do produto", async () => {
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
    expect(product.metadatas.basePrice.edit.description).toBe(
      "Usado como referência; o preço real vem de cada variação",
    );
    expect(product.layouts.list).toEqual([
      "mainImage",
      "name",
      "basePrice",
      "category",
    ]);
    expect(product.layouts.edit).toEqual([
      [
        { name: "name", size: 6 },
        { name: "basePrice", size: 6 },
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
    ]);
  });

  it("não faz nada quando o marker já está na versão atual", async () => {
    const harness = makeHarness();
    harness.rows.set(MARKER_KEY, {
      id: 99,
      key: MARKER_KEY,
      value: JSON.stringify(2),
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
    expect(harness.rows.get(MARKER_KEY)?.value).toBe(JSON.stringify(2));
    expect(harness.coreStore.create).not.toHaveBeenCalled();
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
        if (key.endsWith("api::product.product") && field === "slug") continue;
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
      value: JSON.stringify(2),
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
