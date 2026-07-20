# Recuperação de dados (se o dev zerar)

> Enquanto a [persistência](persistencia-banco.md) não estiver garantida, um deploy
> pode zerar o dev. Este documento é o **plano de recuperação**. A correção
> definitiva é a persistência — isto aqui é só o paliativo.

## Fontes da verdade

1. **Local (SQLite `.tmp/data.db`)** — o ambiente local do dev tem o catálogo
   completo e é a referência de "como deve estar".
2. **`scripts/seed.js`** — seed idempotente com o catálogo base (categorias,
   marcas, produtos + variantes, homepage, FAQs, políticas). Roda **in-process**
   (dentro do Strapi), gravando no banco do `env` atual.

## Diagnóstico rápido (o dev está vazio?)

```bash
curl -s "https://api-valhallatecnologia-dev.arisilva.tech/api/products?pagination[withCount]=true" \
  | grep -o '"total":[0-9]*'
# total:0  -> vazio, precisa recuperar
```

## Opção 1 — Re-seed in-process (dentro do container do dev)

Melhor caminho: roda o `seed.js` com o mesmo `env` do dev (conecta no Postgres do dev).

No **terminal do container do Strapi** (Dokploy → serviço → Terminal):
```bash
node ./scripts/seed.js
```
- É **idempotente**: se já houver dados, ele detecta (`initHasRun`) e não duplica.
- Recria produtos com variantes (componente `ecommerce.variant`), publicados.

## Opção 2 — Sincronizar do local para o dev via API REST

Quando o **local** é a verdade e você quer espelhar no dev (ou vice-versa), use a
API REST com um **API Token full access** de cada ambiente.

### Pré-requisitos
- Token do **dev**: `STRAPI_SEED_API_TOKEN` no `.env` (7 dias, full access).
- Token do **local**: gerar em `http://localhost:1337/admin` →
  **Settings → API Tokens → Create** (Full access). O token do dev **não** vale no
  local (cada banco tem os seus).

### Pontos de atenção aprendidos (importante)
- **Produto é Draft & Publish.** Para publicar já na criação via REST, use
  `POST /api/products?status=published`. Sem isso o produto fica em rascunho e o
  front (role público) **não enxerga**.
- **Variantes são componente obrigatório (`min: 1`).** Criar produto sem variante
  dá `400 ValidationError`. Todo produto precisa de pelo menos 1 variante.
- **`populate=*` NÃO retorna o componente `variants`** de forma confiável. Para ler
  variantes use populate explícito:
  `?populate[variants]=true&populate[specs]=true&populate[brand]=true&populate[category]=true&populate[tags]=true`.
- **Relações por `documentId`.** Ao criar produto, `brand`/`category`/`tags` são os
  `documentId` das entidades já criadas no ambiente de destino (mapear por `slug`).
- **Single types** (`homepage`, `site-setting`): use `PUT /api/homepage` /
  `PUT /api/site-setting` com o `data` (deep populate na leitura para pegar
  componentes aninhados, ex. `populate[hero][populate]=*`).
- **Ordem de criação:** categorias → marcas → tags → produtos → faqs → políticas →
  singles. (Produtos dependem de category/brand/tag.)

### Esqueleto do fluxo
1. Ler do ambiente-fonte (com populate explícito) categorias, marcas, tags,
   produtos, faqs, políticas, homepage, site-setting.
2. No destino: limpar (DELETE) e recriar na ordem acima, mapeando relações por slug.
3. Publicar produtos com `?status=published`.
4. Validar com um **diff normalizado** (ignorando `id`/`documentId`/timestamps e
   ordenando chaves) até dar "idêntico".

> Scripts ad-hoc desse fluxo foram usados na recuperação de 2026-07-20. Se virar
> rotina, versione um `scripts/sync-envs.js` reutilizável em vez de refazer à mão.

## Depois de recuperar

- **Corrija a persistência** ([persistencia-banco.md](persistencia-banco.md)) para
  não precisar repetir isto.
- Confirme com um redeploy de teste que os dados **sobrevivem**.
