# Migração do ambiente local para PostgreSQL

## Objetivo

Executar a API Strapi localmente no Docker Desktop com PostgreSQL persistente e
migrar integralmente os dados existentes do SQLite `.tmp/data.db` sem apagar a
origem.

## Arquitetura

O `docker-compose.yml` será a forma padrão de executar o ambiente local. O
serviço `strapi` se conecta ao serviço `postgres` pela rede interna do Compose.
O volume nomeado `postgres-data` preserva o banco entre reinicializações dos
containers; `strapi-uploads` preserva uploads locais. A porta 1337 será
publicada para acesso pela máquina anfitriã em `http://localhost:1337`.

O projeto passará a declarar PostgreSQL como banco local padrão. SQLite continua
suportado no código somente para possibilitar a exportação de segurança e não
será removido durante esta mudança.

## Migração dos dados

1. Copiar `.tmp/data.db` para um backup datado fora do caminho usado pelo
   Strapi.
2. Com a configuração SQLite ainda ativa, executar a exportação do Strapi para
   um arquivo local sem criptografia e com arquivos incluídos.
3. Alterar a configuração local para PostgreSQL e iniciar o stack Docker.
4. Importar o arquivo no container Strapi, que gravará o conteúdo no Postgres e
   os uploads no volume persistente.
5. Comparar as contagens de tabelas/entidades do SQLite e Postgres e abrir a
   API/admin em `http://localhost:1337` para uma validação de funcionamento.

Em qualquer falha antes da validação, o SQLite e a exportação permanecem
disponíveis para recomeçar sem perda de dados.

## Configuração e documentação

- Atualizar `.env` local e `.env.example` para `DATABASE_CLIENT=postgres`.
- Ajustar o default de `config/database.ts` para postgres, impedindo uma queda
  silenciosa para SQLite quando a variável for esquecida.
- Publicar a porta HTTP no Compose e documentar os comandos de subir, parar,
  acompanhar logs e restaurar a exportação.
- Não usar `docker compose down -v`, pois remove o volume do banco.

## Erros e validação

O Compose aguardará o healthcheck do PostgreSQL antes de iniciar o Strapi. A
importação só ocorrerá com o banco novo e vazio. A conclusão exige: containers
em execução, endpoint HTTP disponível, banco relatado como PostgreSQL e dados
importados com contagens compatíveis com a origem.
