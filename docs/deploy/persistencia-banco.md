# Persistência do banco de dados no dev (Dokploy)

> **Objetivo:** garantir que o banco do ambiente **dev** (Postgres, no Dokploy)
> **nunca** seja resetado por um deploy. Deploy = código novo, dados intactos.

> ## ✅ RESOLVIDO em 2026-07-21
> A causa descrita abaixo foi **confirmada** e corrigida. O dev agora usa um
> **Postgres gerenciado do Dokploy** (serviço `valhalla-postgres`, host interno
> `valhalla-tecnologia-valhallapostgres-x8qdw9`, database `db-valhalla-ecommerce-dev`).
> **Validado:** conta de admin criada, redeploy feito, conta sobreviveu.
> Ver [seção 3.1](#31-o-que-foi-aplicado-de-fato--armadilhas-encontradas) para as
> armadilhas encontradas no caminho.

---

## 1. O que aconteceu (o incidente)

Num deploy, o Strapi subiu com o **banco vazio** e o front quebrou. Dados que
existiam (produtos, categorias, homepage) sumiram. Causa: **a persistência do
banco não estava garantida** na configuração do Dokploy.

### Por que o banco zerou

O serviço no Dokploy estava configurado como **Application (Dockerfile)**. Nesse modo:

- O Dokploy **builda e roda só o `Dockerfile`** — o `docker-compose.yml` do repositório é **ignorado**.
- Logo, **nenhum Postgres sobe junto** e **nenhum volume** é montado.
- O Strapi cai no banco **default = SQLite** (`config/database.ts` → `DATABASE_CLIENT` default `sqlite`), gravando em `.tmp/data.db` **dentro do container**.
- Todo rebuild cria um container novo → **SQLite novo e vazio**. Os dados anteriores vão embora.

```
config/database.ts:
  const client = env('DATABASE_CLIENT', 'sqlite');  // <- sem env, vira SQLite efêmero
```

**Resumo da causa:** container é descartável; se o banco mora dentro do container
(SQLite) ou aponta pra um Postgres sem volume, cada deploy começa do zero.

---

## 2. Arquitetura correta

O banco tem que viver **fora** do ciclo de vida do container do Strapi, num
**Postgres com volume persistente**. Deploy do Strapi troca só o container da
aplicação; o Postgres e seu volume continuam intactos.

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│  Container Strapi        │  rede  │  Postgres (managed/serviço)  │
│  (recriado a cada deploy)│───────▶│  volume persistente          │
│  SEM dados dentro        │        │  ← DADOS VIVEM AQUI          │
└─────────────────────────┘        └──────────────────────────────┘
        descartável                       NUNCA recriado no deploy
```

Existem **duas formas** de conseguir isso no Dokploy. Escolha **uma**.

---

## 3. Opção A — Postgres gerenciado do Dokploy (recomendado p/ o setup atual)

Mantém o app como **Application (Dockerfile)** e usa um **banco gerenciado** do
Dokploy (que já nasce com volume persistente e suporte a backup).

### Passos

1. **Criar o Postgres no Dokploy**
   - No projeto, **Create Service → Database → PostgreSQL** (versão 16).
   - Anote: `Database Name`, `User`, `Password`, e o **host interno** (Dokploy dá um hostname de rede, ex. `valhalla-postgres`).
   - Ative **Backups** (agendados) nas configurações do banco.

2. **Apontar o Strapi para esse Postgres** (aba **Environment** do serviço da API):
   ```env
   DATABASE_CLIENT=postgres
   DATABASE_HOST=<host-interno-do-postgres-no-dokploy>
   DATABASE_PORT=5432
   DATABASE_NAME=<database-name>
   DATABASE_USERNAME=<user>
   DATABASE_PASSWORD=<password>
   DATABASE_SSL=false
   ```
   > **`DATABASE_CLIENT=postgres` é obrigatório.** Sem ele, o Strapi usa SQLite efêmero (a causa do incidente).

3. **(Uploads)** Se for usar upload de imagens no admin, monte um volume persistente
   para `/opt/app/public/uploads` (Advanced → Volumes/Mounts), senão as imagens
   somem no rebuild. Hoje o catálogo usa cores/hex (sem mídia), então é opcional —
   mas configure antes de começar a subir imagens.

4. **Deploy.** O Postgres gerenciado **não é recriado** quando você faz redeploy da
   API. Dados persistem.

### Vantagens
- Menos mudança no que já existe (segue Application/Dockerfile).
- Backup gerenciado pelo Dokploy.
- Banco isolado do ciclo de deploy da aplicação.

---

## 3.1. O que foi aplicado de fato + armadilhas encontradas

Foi seguida a **Opção A**. Cinco erros apareceram no caminho — todos com sintomas
enganosos. Registrados aqui para não custarem tempo de novo.

### 1. `DATABASE_CLIENT` ausente (a causa raiz)
O `.env.dokploy` tinha `DATABASE_NAME`, `DATABASE_USERNAME` e `DATABASE_PASSWORD`,
mas **não tinha `DATABASE_CLIENT` nem `DATABASE_HOST`**. Sem `DATABASE_CLIENT`, o
Strapi ignora as outras três e usa SQLite. É como ter a chave sem o carro.
Aquelas 3 variáveis só funcionam via `docker-compose.yml` — que o modo
Application **ignora**.

### 2. Campo Docker Image com `16` em vez de `postgres:16-alpine`
```
Error response from daemon: pull access denied for 16, repository does not exist
```
O Dokploy pede a **imagem completa**, não só a versão. O banco nunca subiu.

### 3. `ENOTFOUND` no host do Postgres
```
error: getaddrinfo ENOTFOUND valhalla-tecnologia-valhallapostgres-x8qdw9
```
Sintoma de rede, causa era o erro 2 — o container do banco não existia, logo não
havia hostname para resolver. **Antes de investigar rede, confirme que o serviço
do banco está `running`.**

### 4. `NODE_ENV=development` no Environment
Quebra o boot. O `Dockerfile` roda `npm ci` com `NODE_ENV=production`, então
`typescript` (devDependency) **não está na imagem**; em modo development o Strapi
tenta compilar TS e morre. Bônus: modo development libera o Content-Type Builder,
que grava schema em runtime — mais um vetor de perda de dados.
**Não declare `NODE_ENV` no Dokploy.** O `Dockerfile` já resolve.

### 5. Nome do banco sem o sufixo do Dokploy
```
error: database "db-valhalla-ecommerce" does not exist
```
O Dokploy criou como `db-valhalla-ecommerce-dev`. **Sempre copie o Database Name
da tela de credenciais do serviço**, não presuma.

> Esse erro é bom sinal: significa que host, porta, usuário e senha **já estão
> corretos** — o Postgres respondeu e autenticou.

### Também necessário: `IS_PROXIED=true`
`config/server.ts` lê `proxy: env.bool('IS_PROXIED', false)`. O Dokploy/Traefik
termina o TLS, então sem essa flag o login do admin tem problema de cookie/redirect.

### Ordem de leitura do log quando dá Bad Gateway
502 = container caiu. O log de runtime (aba **Logs**, não Deployments) diz o motivo:

| Log | Causa |
|---|---|
| `Cannot find module 'typescript'` | `NODE_ENV=development` |
| `getaddrinfo ENOTFOUND` | banco não está rodando, ou host errado |
| `ECONNREFUSED` | porta errada / banco não pronto |
| `password authentication failed` | senha diverge |
| `database "..." does not exist` | nome do banco diverge (resto está certo) |

---

## 4. Opção B — Deploy via Compose (usa o `docker-compose.yml` do repo)

O repositório **já tem** um `docker-compose.yml` pronto com Strapi + Postgres +
volumes nomeados persistentes. Basta o Dokploy rodar em modo **Compose**.

### Passos

1. No Dokploy, o serviço deve ser do tipo **Compose** (Compose Type), apontando
   para o repo/branch `develop` e usando o `docker-compose.yml` do projeto.
2. Preencher as variáveis na aba **Environment** (o compose usa interpolação `${VAR}`):
   ```env
   PUBLIC_URL=https://api-valhallatecnologia-dev.arisilva.tech
   DATABASE_NAME=db-valhalla-ecommerce
   DATABASE_USERNAME=strapi
   DATABASE_PASSWORD=<senha-forte>
   APP_KEYS=...
   API_TOKEN_SALT=...
   ADMIN_JWT_SECRET=...
   TRANSFER_TOKEN_SALT=...
   JWT_SECRET=...
   ENCRYPTION_KEY=...
   ```
3. Deploy. Os volumes `postgres-data` e `strapi-uploads` (declarados no compose)
   **persistem** entre deploys.

Trecho relevante do `docker-compose.yml` (já versionado):
```yaml
  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres-data:/var/lib/postgresql/data   # <- persistência
volumes:
  postgres-data:
  strapi-uploads:
```

> **Importante:** volume nomeado persiste enquanto o **stack/volume não for
> removido**. "Redeploy" não apaga volume; "Delete/recriar o serviço" ou
> `docker compose down -v` **apaga**. Nunca use `down -v` nesse projeto.

---

## 5. ⚠️ Atenção: mudanças de schema também apagam dados

Persistência de volume resolve o reset **de infraestrutura**. Mas o Strapi, ao
subir, **sincroniza o schema** com o banco. Uma **mudança destrutiva de
content-type** apaga *aquele* dado mesmo com Postgres persistente:

- **Remover um content-type** → o Strapi **dropa a tabela** dele no boot.
- **Trocar tipo de campo / relação por componente** → o dado antigo daquele campo
  **não migra** e é perdido (foi o que aconteceu com `product-variant` → componente
  `ecommerce.variant`: as variantes antigas sumiram).

**Regra:** antes de subir deploy com mudança de schema (mexeu em
`src/api/**/content-types/**/schema.json` ou `src/components/**`):
1. Faça **backup do Postgres** (Dokploy → backup manual do banco).
2. Se removeu/renomeou content-type ou campo, planeje a **migração de dados**
   (script em `database/migrations/` ou re-seed).

---

## 5.1. Backup (Cloudflare R2) — já configurado

O Dokploy está configurado para **backup diário do Postgres para o Cloudflare R2**.
Isso é ótimo — mas **backup e persistência são coisas diferentes** e ambos precisam
estar certos:

- **Persistência (volume)** evita perder dados **no dia a dia / a cada deploy**.
- **Backup (R2)** é a **rede de segurança** para restaurar após um acidente
  (schema destrutivo, exclusão errada, corrupção).

### ⚠️ Um backup só vale se salvar o banco CERTO
O backup diário precisa apontar para o **mesmo Postgres em que o Strapi grava**.
Se o app estiver caindo em **SQLite efêmero** (causa do incidente), o Dokploy pode
estar **backupeando um Postgres vazio/separado** — ou seja, **backup de nada**.

**Confirme:**
1. `DATABASE_CLIENT=postgres` no Environment do Strapi, apontando para o Postgres gerenciado.
2. Esse **mesmo** Postgres é o que tem o backup diário para o R2 ligado.
3. O último dump **não está vazio** (baixe/inspecione tamanho; um dump de KB ≈ vazio).

### Frequência
- 1x/dia cobre a maioria dos casos, mas você **perde até ~24h** de alterações.
- Antes de deploy com **mudança de schema**, faça um **backup manual** (não espere o diário).

## 6. Como verificar que a persistência está OK

Depois de configurar, confirme:

1. **Qual banco o Strapi está usando** (tem que ser postgres):
   - Faça um deploy, cadastre/edite um dado de teste no admin.
   - **Faça outro deploy** (redeploy simples).
   - O dado de teste **continua lá?** ✅ persistência OK. Sumiu? ❌ ainda está errado.

2. **Checar via API** (público) que há dados:
   ```bash
   curl -s "https://api-valhallatecnologia-dev.arisilva.tech/api/products?pagination[withCount]=true" \
     | grep -o '"total":[0-9]*'
   ```

---

## 7. Checklist antes de todo deploy

- [ ] `DATABASE_CLIENT=postgres` está setado no Environment do Dokploy (ou é Compose com Postgres).
- [ ] O Postgres é gerenciado/volume persistente (não é SQLite, não é Postgres sem volume).
- [ ] Se o deploy mexe em **schema** (content-types/components): **backup manual feito** (não confie só no backup diário do R2 — você perderia até ~24h).
- [ ] O **backup diário do R2** aponta para o **mesmo** Postgres do app e o último dump **não está vazio**.
- [ ] `package-lock.json` gerado com **npm 10** (o `node:20-alpine` usa npm 10; lock de npm 11+ quebra `npm ci`). Ver histórico do projeto.
- [ ] Após deploy: dado de teste anterior **continua presente** (validação da persistência).

---

## 8. Referências no código

- `config/database.ts` — default `sqlite`; postgres quando `DATABASE_CLIENT=postgres`.
- `docker-compose.yml` — Strapi + Postgres + volumes `postgres-data`/`strapi-uploads`.
- `Dockerfile` — build/runtime; roda `npm run start`.
- `.env.dokploy` — modelo das variáveis para o painel do Dokploy (não commitar valores reais).
