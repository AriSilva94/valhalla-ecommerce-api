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

## Opção 0 — Restaurar o backup do Cloudflare R2 (PREFERIDA)

O Dokploy está configurado para **backup diário do Postgres para o Cloudflare R2**.
Se os dados zerarem, **o backup mais recente é a melhor fonte** (dados reais, não só o seed base).

1. Dokploy → serviço do **Postgres** → aba **Backups**.
2. Localize o backup **anterior ao incidente** (o backup roda 1x/dia — confira a data/hora para não restaurar um dump já vazio).
3. **Restore** para o banco do dev.
4. Redeploy do Strapi e valide (`/api/products?...withCount`).

> ⚠️ **O backup só vale se estiver salvando o banco CERTO.** Confirme que:
> - o app (Strapi) grava no **mesmo** Postgres que o Dokploy backupeia
>   (`DATABASE_CLIENT=postgres` + host apontando pra esse banco — ver
>   [persistencia-banco.md](persistencia-banco.md));
> - o dump **não está vazio** (se o app estava em SQLite efêmero, o backup pode
>   estar salvando um Postgres vazio — nesse caso o backup é inútil e é preciso
>   corrigir a persistência primeiro, depois cair na Opção 1/2).

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
