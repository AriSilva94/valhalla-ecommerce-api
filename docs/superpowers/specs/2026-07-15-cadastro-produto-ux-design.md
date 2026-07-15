# Spec — Simplificação do cadastro de produto (admin Strapi)

**Data:** 2026-07-15
**Projetos afetados:** `valhalla-ecommerce-api` (Strapi 5.50.1) e `valhalla-ecommerce` (Next.js)
**Status:** aprovado para plano de implementação

## Problema

Usuários leigos cadastram produtos pelo admin padrão do Strapi e sofrem com:

1. Variantes em collection separada (`product-variant`): cadastrar 1 produto com N variações exige N+1 telas e vínculos manuais.
2. Campos técnicos expostos: SKU (único, inventado à mão), cor em hex digitada, slug editável, componente SEO vazio/mal preenchido.
3. Vínculos (marca, categoria, tags) sem orientação, labels em inglês, sem textos de ajuda.

O frontend consome variantes **exclusivamente** via `populate` do produto (carrinho usa apenas o `sku` string) — a collection separada não traz benefício ao front.

Dados atuais são de teste (v1): **sem migração**; recadastro manual após deploy.

## Solução

### 1. Variante vira componente repetível

Novo componente `ecommerce.variant`:

| Campo | Tipo | Regras |
|---|---|---|
| `sku` | string | opcional no form; auto-gerado se vazio (lifecycle) |
| `colorName` | string | manual ("Preto") — front agrupa por nome |
| `colorHex` | customField `plugin::color-picker.color` | seletor visual |
| `configLabel` | string | opcional |
| `price` | decimal | obrigatório |
| `compareAtPrice` | decimal | opcional (preço "De") |
| `available` | boolean | default `true` |
| `stockQuantity` | integer | opcional |
| `image` | media (single, images) | opcional |

- `Product.variants`: relação oneToMany → componente repetível `ecommerce.variant`.
- Collection type `product-variant` removida por completo (`src/api/product-variant`), inclusive entrada em `PUBLIC_READ` no `src/index.ts`.
- Componente `ecommerce.color` removido (substituído por `colorName`/`colorHex` inline).

### 2. Color picker

- Instalar `@strapi/plugin-color-picker` (plugin oficial; baixo risco de quebra em upgrade).

### 3. Automação via lifecycles do Product

Arquivo `src/api/product/content-types/product/lifecycles.ts`, hooks `beforeCreate`/`beforeUpdate`:

- **SKU**: para cada variante sem `sku`, gerar `SLUG-COR-N` (slug do produto + colorName normalizado sem acento/maiúsculo + índice). Garantir unicidade dentro do produto; colisão global resolvida com sufixo incremental consultando produtos existentes.
- **SEO**: se `seo` ausente ou `metaTitle`/`metaDescription` vazios, preencher: `metaTitle` = nome do produto (+ marca se couber em 60 chars); `metaDescription` = descrição sem markdown truncada em 155 chars.
- Usuário pode sobrescrever ambos manualmente; lifecycle só preenche vazio.

### 4. Admin 100% PT-BR

- `src/admin/app.tsx`: `config.locales = ['pt-BR']` — traduz chrome do Strapi (menus, botões, Content Manager).
- Schemas: `displayName` e `description` em PT-BR — Produto, Marca, Categoria, Etiqueta, FAQ, Política, Página Inicial, Configurações do Site; componentes (Variação, Especificação, SEO etc.).
- **Configuração de views seedada no bootstrap** (`src/index.ts`), gravando a configuração do content-manager (core store, chave `plugin_content_manager_configuration_content_types::api::product.product` e componentes):
  - labels e descrições de ajuda por campo em PT-BR (ex.: "Preço 'De' — deixe vazio se não houver desconto");
  - `slug` oculto na edit view;
  - ordem dos campos: essenciais primeiro (nome, preço base, imagens, variações), relações agrupadas, SEO por último;
  - list view do Produto: imagem, nome, preço base, categoria, estado (publicado/rascunho); ordenação padrão por `updatedAt` desc.
  - Seed **idempotente e não-destrutivo**: aplica somente se configuração ainda não existir no banco (deploy novo no dokploy sobe configurado; ajustes manuais posteriores não são sobrescritos).

### 5. Frontend (`valhalla-ecommerce`)

- `app/lib/strapi.ts`:
  - `ProductVariant`: remove `documentId`; tipo TS **mantém** `color: {name, hex}` — `mapVariant` monta a partir de `colorName`/`colorHex`. Zero mudança nos componentes React.
  - `PRODUCT_POPULATE`: variantes como componente (`populate[variants][populate]=image`), sem populate de `color`.
- `ProductDetailClient`/carrinho: sem mudança se o shape TS for preservado.

### 6. Fora de escopo (v2 se dor persistir)

- Wizard custom de cadastro, importação de planilha, duplicação de produto, gestão de estoque avançada.

## Critérios de sucesso

1. Produto completo com 3 variações cadastrado em **uma única tela**, sem digitar SKU, hex, slug ou SEO.
2. Admin inteiro em PT-BR, com texto de ajuda em cada campo não-óbvio.
3. Deploy limpo (banco novo) já sobe com views configuradas e permissões públicas corretas.
4. Site Next.js renderiza produto/variações/carrinho identicamente ao comportamento atual.

## Riscos

- Seed de configuração do content-manager usa estrutura interna do core store — validar formato na versão 5.50.1 e cobrir com verificação manual pós-boot.
- Perda do `unique: true` de SKU no banco — mitigado pela validação no lifecycle.
