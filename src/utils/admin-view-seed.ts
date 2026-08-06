import type { Core } from "@strapi/strapi";

export const SEED_VERSION = 6;
const MARKER_KEY = "valhalla_admin_seed_version";

interface FieldPatch {
  label?: string;
  description?: string;
  hidden?: boolean;
}

interface ViewPatch {
  fields: Record<string, FieldPatch>;
  settings?: Record<string, unknown>;
  listFields?: string[];
  editLayout?: Array<Array<{ name: string; size: number }>>;
}

const CONTENT_TYPE_PREFIX =
  "plugin_content_manager_configuration_content_types::";
const COMPONENT_PREFIX = "plugin_content_manager_configuration_components::";

const PRODUCT_EDIT_LAYOUT = [
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
];

const PRODUCT_V1_PATCH: ViewPatch = {
  settings: {
    defaultSortBy: "updatedAt",
    defaultSortOrder: "DESC",
    pageSize: 50,
    mainField: "name",
  },
  listFields: ["mainImage", "name", "basePrice", "category"],
  fields: {
    name: { label: "Nome do produto" },
    slug: { hidden: true },
    basePrice: {
      label: "Preço base (R$)",
      description: "Usado como referência; o preço real vem de cada variação",
    },
    brand: { label: "Marca" },
    category: { label: "Categoria" },
    tags: {
      label: "Etiquetas",
      description: "Opcional — ajuda na busca e nos filtros",
    },
    variantGroupLabel: {
      label: "Título do grupo de variações",
      description:
        'Ex.: "Tamanho", "Configuração". Aparece acima das opções na página do produto',
    },
    variants: {
      label: "Variações",
      description:
        "Cada variação é uma cor/configuração com preço próprio. Deixe o SKU vazio para gerar automaticamente",
    },
    specs: { label: "Especificações", description: "Ex.: Material → Aço inox" },
    description: { label: "Descrição" },
    warranty: { label: "Garantia", description: 'Ex.: "12 meses"' },
    mainImage: { label: "Imagem principal" },
    gallery: { label: "Galeria de imagens" },
    seo: {
      label: "SEO (opcional)",
      description:
        "Pode deixar vazio — é preenchido automaticamente com nome e descrição",
    },
  },
};

const PRODUCT_V2_PATCH: ViewPatch = {
  fields: {},
  editLayout: PRODUCT_EDIT_LAYOUT,
};

const PRODUCT_EDIT_LAYOUT_V4 = [
  [
    { name: "name", size: 6 },
    { name: "slug", size: 6 },
  ],
  ...PRODUCT_EDIT_LAYOUT.slice(1),
];

const PRODUCT_V4_FIELDS: Record<string, FieldPatch> = {
  slug: {
    label: "Endereço (URL)",
    description:
      "Final do link da página. Apague e salve para gerar de novo a partir do nome — trocar quebra os links já divulgados",
  },
  basePrice: {
    label: "Preço base (R$)",
    description:
      "Calculado com o menor preço entre as variações. Para mudar o preço, edite a variação",
    hidden: true,
  },
};

const PRODUCT_V4_PATCH: ViewPatch = {
  fields: PRODUCT_V4_FIELDS,
  editLayout: PRODUCT_EDIT_LAYOUT_V4,
};

const PRODUCT_PATCH: ViewPatch = {
  ...PRODUCT_V1_PATCH,
  fields: { ...PRODUCT_V1_PATCH.fields, ...PRODUCT_V4_FIELDS },
  listFields: ["mainImage", "name", "category"],
  editLayout: PRODUCT_EDIT_LAYOUT_V4,
};

const VARIANT_PATCH: ViewPatch = {
  fields: {
    sku: {
      label: "Código (SKU)",
      description: "Deixe vazio para gerar automaticamente",
    },
    colorName: {
      label: "Nome da cor",
      description: 'Ex.: "Preto", "Azul Marinho"',
    },
    colorHex: { label: "Cor" },
    configLabel: {
      label: "Configuração",
      description: 'Ex.: "128GB", "220V". Deixe vazio se não se aplica',
    },
    price: { label: "Preço (R$)" },
    compareAtPrice: {
      label: "Preço 'De' (R$)",
      description: "Preço riscado. Deixe vazio se não houver desconto",
    },
    available: { label: "Disponível" },
    stockQuantity: { label: "Estoque", description: "Opcional" },
    image: { label: "Imagem da variação" },
  },
};

const V1_SIMPLE_PATCHES: Record<string, ViewPatch> = {
  [`${CONTENT_TYPE_PREFIX}api::brand.brand`]: {
    fields: {
      name: { label: "Nome" },
      slug: {
        label: "Endereço (URL)",
        description: "Gerado automaticamente — não é preciso mexer",
      },
      logo: { label: "Logo" },
      products: { label: "Produtos" },
    },
  },
  [`${CONTENT_TYPE_PREFIX}api::category.category`]: {
    settings: {
      defaultSortBy: "sortOrder",
      defaultSortOrder: "ASC",
      mainField: "name",
    },
    listFields: ["name", "sortOrder", "products"],
    fields: {
      name: { label: "Nome" },
      slug: {
        label: "Endereço (URL)",
        description:
          "Gerado automaticamente — não é preciso mexer",
      },
      description: { label: "Descrição" },
      sortOrder: {
        label: "Ordem",
        description:
          "Use o botão de arrastar na lista de categorias para reordenar; este número é atualizado sozinho",
      },
      order: { label: "Ordem (legado)", hidden: true },
      image: { label: "Imagem" },
      products: { label: "Produtos" },
    },
  },
  [`${CONTENT_TYPE_PREFIX}api::tag.tag`]: {
    fields: {
      name: { label: "Nome" },
      slug: {
        label: "Endereço (URL)",
        description: "Gerado automaticamente — não é preciso mexer",
      },
      products: { label: "Produtos" },
    },
  },
  [`${CONTENT_TYPE_PREFIX}api::faq.faq`]: {
    fields: {
      question: { label: "Pergunta" },
      answer: { label: "Resposta" },
      order: { label: "Ordem", description: "Menor número aparece primeiro" },
    },
  },
  [`${CONTENT_TYPE_PREFIX}api::policy.policy`]: {
    fields: {
      title: { label: "Título" },
      slug: {
        label: "Endereço (URL)",
        description: "Gerado automaticamente — não é preciso mexer",
      },
      body: { label: "Texto" },
    },
  },
  [`${COMPONENT_PREFIX}shared.seo`]: {
    fields: {
      metaTitle: {
        label: "Título (SEO)",
        description: "Até 60 caracteres. Vazio = usa o nome do produto",
      },
      metaDescription: {
        label: "Descrição (SEO)",
        description: "Até 155 caracteres. Vazio = usa a descrição do produto",
      },
      shareImage: { label: "Imagem de compartilhamento" },
    },
  },
  [`${COMPONENT_PREFIX}ecommerce.spec`]: {
    fields: {
      key: { label: "Característica" },
      value: { label: "Valor" },
    },
  },
};

const V2_NEW_PATCHES: Record<string, ViewPatch> = {
  [`${CONTENT_TYPE_PREFIX}api::homepage.homepage`]: {
    fields: {
      hero: {
        label: "Destaque principal",
        description: "Conteúdo principal exibido no topo da página inicial",
      },
      benefits: {
        label: "Benefícios",
        description: "Diferenciais exibidos abaixo do destaque",
      },
      steps: {
        label: "Etapas",
        description: 'Passos da seção "Como funciona"',
      },
      testimonials: { label: "Depoimentos" },
      whatsappBanner: {
        label: "Banner do WhatsApp",
        description: "Chamada para contato exibida na página inicial",
      },
    },
  },
  [`${CONTENT_TYPE_PREFIX}api::site-setting.site-setting`]: {
    fields: {
      whatsappNumber: {
        label: "Número do WhatsApp",
        description:
          "Somente números, com código do país e DDD. Ex.: 5511999999999",
      },
      showTopBar: { label: "Exibir barra superior" },
      topBarText: { label: "Texto da barra superior" },
      showFab: { label: "Exibir botão flutuante do WhatsApp" },
      footerTagline: { label: "Frase do rodapé" },
      footerLinkColumns: { label: "Colunas de links do rodapé" },
      footerLegalText: { label: "Texto legal do rodapé" },
      contactEmail: { label: "E-mail de contato" },
      contactAddress: { label: "Endereço de contato" },
      contactHours: { label: "Horário de atendimento" },
      aboutEyebrow: { label: "Chamada curta da seção Sobre" },
      aboutHeadline: { label: "Título da seção Sobre" },
      aboutText: { label: "Texto da seção Sobre" },
      aboutStats: { label: "Números da seção Sobre" },
      aboutImage: { label: "Imagem da seção Sobre" },
      defaultSeo: {
        label: "SEO padrão",
        description:
          "Usado nas páginas que não possuem configurações próprias de SEO",
      },
    },
  },
  [`${COMPONENT_PREFIX}institutional.banner`]: {
    fields: {
      headline: { label: "Título" },
      text: { label: "Texto" },
      buttonLabel: { label: "Texto do botão" },
      buttonLink: {
        label: "Link do botão",
        description: "Use uma rota do site (ex.: /contato) ou uma URL completa",
      },
    },
  },
  [`${COMPONENT_PREFIX}institutional.benefit`]: {
    fields: {
      icon: { label: "Ícone", description: "Nome do ícone usado pelo site" },
      title: { label: "Título" },
      description: { label: "Descrição" },
    },
  },
  [`${COMPONENT_PREFIX}institutional.hero`]: {
    fields: {
      eyebrow: { label: "Chamada curta" },
      headlineAccent: { label: "Trecho de destaque antes do título" },
      headline: { label: "Título principal" },
      headlineHighlight: { label: "Trecho destacado do título" },
      subtext: { label: "Texto de apoio" },
      ctaLabel: { label: "Texto do botão principal" },
      ctaLink: {
        label: "Link do botão principal",
        description:
          "Use uma rota do site (ex.: /produtos) ou uma URL completa",
      },
      secondaryCtaLabel: { label: "Texto do botão secundário" },
      secondaryCtaLink: {
        label: "Link do botão secundário",
        description: "Use uma rota do site ou uma URL completa",
      },
      trustBadges: { label: "Selos de confiança" },
    },
  },
  [`${COMPONENT_PREFIX}institutional.link-column`]: {
    fields: {
      title: { label: "Título da coluna" },
      links: { label: "Links" },
    },
  },
  [`${COMPONENT_PREFIX}institutional.link`]: {
    fields: {
      label: { label: "Texto do link" },
      url: {
        label: "Destino do link",
        description:
          "Use uma rota do site (ex.: /produtos) ou uma URL completa",
      },
    },
  },
  [`${COMPONENT_PREFIX}institutional.stat`]: {
    fields: {
      value: { label: "Valor", description: "Ex.: 10 anos, +500 clientes" },
      label: { label: "Legenda" },
    },
  },
  [`${COMPONENT_PREFIX}institutional.step`]: {
    fields: {
      number: { label: "Número da etapa" },
      title: { label: "Título" },
      description: { label: "Descrição" },
    },
  },
  [`${COMPONENT_PREFIX}institutional.testimonial`]: {
    fields: {
      quote: { label: "Depoimento" },
      authorName: { label: "Nome da pessoa" },
      authorLocation: { label: "Localização da pessoa" },
    },
  },
  [`${COMPONENT_PREFIX}institutional.trust-badge`]: {
    fields: {
      text: { label: "Texto do selo" },
    },
  },
};

const ALL_PATCHES: Record<string, ViewPatch> = {
  [`${CONTENT_TYPE_PREFIX}api::product.product`]: PRODUCT_PATCH,
  [`${COMPONENT_PREFIX}ecommerce.variant`]: VARIANT_PATCH,
  ...V1_SIMPLE_PATCHES,
  ...V2_NEW_PATCHES,
};

const V2_MIGRATION_PATCHES: Record<string, ViewPatch> = {
  [`${CONTENT_TYPE_PREFIX}api::product.product`]: PRODUCT_V2_PATCH,
  ...V2_NEW_PATCHES,
};

const V4_MIGRATION_PATCHES: Record<string, ViewPatch> = {
  [`${CONTENT_TYPE_PREFIX}api::product.product`]: PRODUCT_V4_PATCH,
};

const CATEGORY_V5_PATCH: ViewPatch = {
  settings: {
    defaultSortBy: "order",
    defaultSortOrder: "ASC",
  },
  listFields: ["name", "order", "products"],
  fields: {
    order: {
      label: "Ordem",
      description:
        "Menor número aparece primeiro no site (menu, rodapé e página de categorias)",
    },
  },
};

const V5_MIGRATION_PATCHES: Record<string, ViewPatch> = {
  [`${CONTENT_TYPE_PREFIX}api::category.category`]: CATEGORY_V5_PATCH,
};

const CATEGORY_V6_PATCH: ViewPatch = {
  settings: {
    defaultSortBy: "sortOrder",
    defaultSortOrder: "ASC",
  },
  listFields: ["name", "sortOrder", "products"],
  fields: {
    sortOrder: {
      label: "Ordem",
      description:
        "Use o botão de arrastar na lista de categorias para reordenar; este número é atualizado sozinho",
    },
    order: { label: "Ordem (legado)", hidden: true },
  },
};

const V6_MIGRATION_PATCHES: Record<string, ViewPatch> = {
  [`${CONTENT_TYPE_PREFIX}api::category.category`]: CATEGORY_V6_PATCH,
};

const MIGRATION_PATCHES: Record<number, Record<string, ViewPatch>> = {
  2: V2_MIGRATION_PATCHES,
  4: V4_MIGRATION_PATCHES,
  5: V5_MIGRATION_PATCHES,
  6: V6_MIGRATION_PATCHES,
};

function patchesForUpgrade(currentVersion: number, key: string): ViewPatch[] {
  if (currentVersion === 0) {
    const fullPatch = ALL_PATCHES[key];
    return fullPatch ? [fullPatch] : [];
  }

  const chain: ViewPatch[] = [];
  for (let version = currentVersion + 1; version <= SEED_VERSION; version += 1) {
    const patch = MIGRATION_PATCHES[version]?.[key];
    if (patch) chain.push(patch);
  }

  return chain;
}

interface ParseResult {
  ok: boolean;
  value?: unknown;
}

function safeParseJson(value: string, warn: () => void): ParseResult {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    warn();
    return { ok: false };
  }
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidConfig(value: unknown): value is Record<string, any> {
  if (!isPlainObject(value)) return false;

  if (
    !isPlainObject(value.settings) ||
    !isPlainObject(value.metadatas) ||
    !isPlainObject(value.layouts) ||
    !Array.isArray(value.layouts.edit) ||
    !Array.isArray(value.layouts.list)
  ) {
    return false;
  }

  const validMetadatas = Object.values(value.metadatas).every(
    (metadata) =>
      isPlainObject(metadata) &&
      (metadata.edit === undefined || isPlainObject(metadata.edit)) &&
      (metadata.list === undefined || isPlainObject(metadata.list)),
  );
  const validEditLayout = value.layouts.edit.every(
    (row: unknown) =>
      Array.isArray(row) &&
      row.every(
        (cell: unknown) => isPlainObject(cell) && typeof cell.name === "string",
      ),
  );
  const validListLayout = value.layouts.list.every(
    (field: unknown) => typeof field === "string",
  );

  return validMetadatas && validEditLayout && validListLayout;
}

function isPatchApplicable(
  config: Record<string, any>,
  patch: ViewPatch,
): boolean {
  const referencedFields = new Set([
    ...Object.keys(patch.fields),
    ...(patch.listFields ?? []),
    ...(patch.editLayout?.flatMap((row) => row.map((cell) => cell.name)) ?? []),
  ]);

  return [...referencedFields].every((field) => {
    const metadata = config.metadatas[field];
    return (
      isPlainObject(metadata) &&
      isPlainObject(metadata.edit) &&
      isPlainObject(metadata.list)
    );
  });
}

function applyPatch(config: any, patch: ViewPatch): void {
  if (!isPlainObject(config)) return;

  if (patch.settings && isPlainObject(config.settings)) {
    Object.assign(config.settings, patch.settings);
  }

  for (const [field, fieldPatch] of Object.entries(patch.fields)) {
    const metadata = config.metadatas?.[field];
    if (!isPlainObject(metadata)) continue;

    const editMetadata = isPlainObject(metadata.edit)
      ? metadata.edit
      : undefined;
    const listMetadata = isPlainObject(metadata.list)
      ? metadata.list
      : undefined;

    if (fieldPatch.label) {
      if (editMetadata) editMetadata.label = fieldPatch.label;
      if (listMetadata) listMetadata.label = fieldPatch.label;
    }

    if (fieldPatch.description && editMetadata) {
      editMetadata.description = fieldPatch.description;
    }

    if (fieldPatch.hidden) {
      if (Array.isArray(config.layouts?.edit)) {
        config.layouts.edit = config.layouts.edit
          .map((row: unknown) =>
            Array.isArray(row)
              ? row.filter(
                  (cell: unknown) => !isPlainObject(cell) || cell.name !== field,
                )
              : row,
          )
          .filter((row: unknown) => !Array.isArray(row) || row.length > 0);
      }

      if (Array.isArray(config.layouts?.list)) {
        config.layouts.list = config.layouts.list.filter(
          (listField: unknown) => listField !== field,
        );
      }
    }
  }

  if (patch.listFields && Array.isArray(config.layouts?.list)) {
    config.layouts.list = patch.listFields;
  }

  if (patch.editLayout && Array.isArray(config.layouts?.edit)) {
    config.layouts.edit = patch.editLayout.map((row) =>
      row.map((cell) => ({ ...cell })),
    );
  }
}

export async function seedAdminViews(strapi: Core.Strapi): Promise<void> {
  const coreStore = strapi.db.query("strapi::core-store");
  const marker = await coreStore.findOne({ where: { key: MARKER_KEY } });
  let currentVersion = 0;

  if (marker) {
    const parsedMarker = safeParseJson(marker.value, () => {
      strapi.log.warn(
        `[admin-view-seed] marker inválido, tratando como versão 0: ${MARKER_KEY}`,
      );
    });

    if (parsedMarker.ok && typeof parsedMarker.value === "number") {
      currentVersion = parsedMarker.value;
    } else if (parsedMarker.ok) {
      strapi.log.warn(
        `[admin-view-seed] marker inválido, tratando como versão 0: ${MARKER_KEY}`,
      );
    }
  }

  if (currentVersion >= SEED_VERSION) return;

  const preparedConfigs: Array<{
    key: string;
    row: { id: number };
    config: Record<string, any>;
  }> = [];
  let validationFailed = false;

  for (const [key, patch] of Object.entries(ALL_PATCHES)) {
    const row = await coreStore.findOne({ where: { key } });

    if (!row) {
      validationFailed = true;
      strapi.log.warn(`[admin-view-seed] config ausente, adiada: ${key}`);
      continue;
    }

    const parsedConfig = safeParseJson(row.value, () => {
      strapi.log.warn(
        `[admin-view-seed] config inválida, adiada: ${key} (JSON malformado)`,
      );
    });

    if (!parsedConfig.ok) {
      validationFailed = true;
      continue;
    }

    if (!isValidConfig(parsedConfig.value)) {
      validationFailed = true;
      strapi.log.warn(
        `[admin-view-seed] config inválida, adiada: ${key} (formato inesperado)`,
      );
      continue;
    }

    if (!isPatchApplicable(parsedConfig.value, patch)) {
      validationFailed = true;
      strapi.log.warn(
        `[admin-view-seed] config inválida, adiada: ${key} (campos esperados ausentes)`,
      );
      continue;
    }

    preparedConfigs.push({ key, row, config: parsedConfig.value });
  }

  if (validationFailed) return;

  const data = {
    key: MARKER_KEY,
    value: JSON.stringify(SEED_VERSION),
    type: "number",
    environment: "",
    tag: "",
  };

  await strapi.db.transaction(async () => {
    for (const { key, row, config } of preparedConfigs) {
      const patchChain = patchesForUpgrade(currentVersion, key);
      if (!patchChain.length) continue;

      for (const patch of patchChain) applyPatch(config, patch);
      await coreStore.update({
        where: { id: row.id },
        data: { value: JSON.stringify(config) },
      });
    }

    if (marker) await coreStore.update({ where: { id: marker.id }, data });
    else await coreStore.create({ data });
  });

  strapi.log.info("[admin-view-seed] views do admin configuradas (pt-BR)");
}
