# Deploy & Persistência — Valhalla E-commerce API (Strapi + Dokploy)

> ## ⛔ REGRA DE OURO
> **O banco de dados NUNCA pode ser resetado em um deploy.**
> Um novo deploy é só código novo. Os dados (produtos, categorias, homepage, etc.)
> vivem **fora** do container, em um banco com volume persistente. Se subir um deploy
> e os dados sumirem, a configuração está **errada** — pare e corrija a persistência
> antes de qualquer coisa. Não é normal "arrumar os dados a cada deploy".

## Status: ✅ resolvido em 2026-07-21

O dev **não** estava em Postgres — estava em SQLite dentro do container, por falta da
variável `DATABASE_CLIENT`. Por isso zerava a cada deploy. Hoje roda num **Postgres
gerenciado do Dokploy** (`valhalla-postgres`), validado com teste de redeploy.
Detalhes e armadilhas: [persistencia-banco.md](persistencia-banco.md#31-o-que-foi-aplicado-de-fato--armadilhas-encontradas).

## Contexto

- App: **Strapi 5** (`valhalla-ecommerce-api`), deploy no **Dokploy** pelo branch `develop`.
  Serviço tipo **Application (Dockerfile)** → o `docker-compose.yml` do repo é **ignorado**.
- Local (dev na máquina): banco **SQLite** (`.tmp/data.db`) — efêmero por natureza, tudo bem.
  É a **fonte da verdade** do catálogo.
- Ambiente dev (Dokploy): **PostgreSQL gerenciado**, serviço separado com volume próprio.

## Índice

| Documento | Assunto |
|-----------|---------|
| [persistencia-banco.md](persistencia-banco.md) | Por que zerou, arquitetura correta e passo a passo no Dokploy para o banco **nunca** mais resetar |
| [recuperacao-dados.md](recuperacao-dados.md) | Se algum dia os dados sumirem: como diagnosticar e repopular |

## Resumo de 30 segundos

1. Os dados do dev moram no **Postgres**, não no container do Strapi.
2. O Postgres precisa de **volume persistente** (managed database do Dokploy **ou** volume nomeado no compose).
3. Deploy do Strapi **não toca** no volume do Postgres → dados sobrevivem.
4. Cuidado à parte: **mudança destrutiva de schema** (remover content-type/campo) apaga *aquele* dado específico mesmo com banco persistente — ver [persistencia-banco.md](persistencia-banco.md#atenção-mudanças-de-schema-também-apagam-dados).
5. **Backup diário para o Cloudflare R2** já está ligado no Dokploy — é a rede de segurança. **Mas só vale se apontar pro Postgres que o app usa** (não pode ser SQLite efêmero, senão é backup de nada). Ver [persistencia-banco.md](persistencia-banco.md#51-backup-cloudflare-r2--já-configurado).
6. Antes de todo deploy, rode a [checklist](persistencia-banco.md#checklist-antes-de-todo-deploy).
