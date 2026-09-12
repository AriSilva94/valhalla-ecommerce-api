# Autenticação de clientes e integração Asaas

## Objetivo e escopo

Esta especificação define a autenticação de clientes e a evolução segura da integração de pagamentos da Valhalla: frontend Next.js, backend Strapi 5 e PostgreSQL, publicados por Dokploy.

Não há implementação nesta etapa. Também não autoriza ainda cobrança, Pix, QR Code ou webhook. Cada fase será implementada e homologada separadamente.

## Decisões aprovadas

| Tema | Decisão |
| --- | --- |
| Arquitetura | Next.js como BFF (Backend for Frontend) |
| Identidade e sessões | plugin `users-permissions` do Strapi |
| Acesso | e-mail/senha, confirmação de e-mail, recuperação de senha e Google OAuth |
| Papéis | clientes autenticados; equipe somente no Strapi Admin |
| Pagamento futuro | Checkout hospedado pelo Asaas |
| Primeiro ambiente | Asaas Sandbox |
| Confirmação financeira | webhook do Asaas, não retorno do navegador |

O padrão de referência é o projeto local `fluent-too-project`: o Next.js guarda tokens em cookies HTTP-only e chama o Strapi somente pelo servidor. A Valhalla deve adaptar esse padrão, sem copiar seus segredos, URLs ou dados de domínio.

## Arquitetura

```text
Navegador
    | rotas internas /api/auth/* e /api/checkout/*
    v
Next.js (BFF) ---- chamadas servidor-servidor ----> Strapi ----> PostgreSQL
    |                                                    |
    | cookies HttpOnly                                   | access_token somente no servidor
    v                                                    v
sessão do cliente                                      Asaas Sandbox/Produção
```

O navegador não acessa a API de autenticação do Strapi diretamente e não recebe access token ou refresh token. O BFF estabiliza os contratos usados por páginas e componentes, mesmo que o formato interno do Strapi mude.

| Componente | Responsabilidades |
| --- | --- |
| Next.js/BFF | formulários, validação inicial, rate limit, origem, cookies, redirecionamentos seguros, proteção de rotas e chamadas internas ao Strapi |
| Strapi | usuários, hash de senha, papéis, tokens, confirmação/reset, Google OAuth, pedidos e Asaas |
| PostgreSQL | usuários, sessões, pedidos, pagamentos e idempotência |
| Asaas | checkout hospedado e futuros eventos financeiros |
| Dokploy | variáveis, rede e HTTPS |

## Fase 1 — autenticação

### Fluxos

1. **Cadastro:** BFF valida e-mail/senha e chama `POST /api/auth/local/register` no Strapi. A conta inicia não confirmada e recebe e-mail.
2. **Confirmação:** o link chega ao frontend; o BFF encaminha a confirmação ao Strapi sem expor o token.
3. **Login:** BFF chama `POST /api/auth/local`, recebe tokens e cria cookies HTTP-only. A resposta JSON só contém perfil seguro.
4. **Sessão/refresh:** BFF consulta `/api/users/me`; ao expirar access token, chama `/api/auth/refresh`, substitui cookies e tenta uma vez.
5. **Logout:** BFF revoga sessão no Strapi quando possível e sempre expira os cookies.
6. **Esqueci/reset:** respostas públicas não revelam se o e-mail existe; reset exige token válido e confirmação de senha.
7. **Google:** BFF inicia; Strapi fala com Google; callback volta ao BFF, que valida nonce/state, cria os cookies e redireciona com segurança.

### Cookies e sessão

| Item | Política inicial |
| --- | --- |
| access token | 10 minutos |
| refresh por inatividade | 14 dias |
| refresh máximo | 30 dias |
| cookies de sessão | `HttpOnly`, `Path=/`, `SameSite=Lax`, `Secure` em produção |
| nonce OAuth | `HttpOnly`, `SameSite=Lax`, 10 min; removido no callback |

Em desenvolvimento HTTP, `Secure=false` é permitido somente localmente. Em Dokploy, HTTPS exige `Secure=true`.

### Contrato de rotas BFF

Rotas mutáveis aceitam somente `POST`, JSON limitado e `Origin` igual ao site público.

| Método e rota | Finalidade |
| --- | --- |
| `POST /api/auth/register` | criar conta |
| `POST /api/auth/login` | iniciar sessão |
| `GET /api/auth/session` | obter usuário e renovar sessão se preciso |
| `POST /api/auth/logout` | encerrar sessão |
| `POST /api/auth/forgot-password` | solicitar reset, com resposta neutra |
| `POST /api/auth/reset-password` | concluir reset |
| `POST /api/auth/resend-confirmation` | reenviar confirmação, com resposta neutra |
| `GET /api/auth/google` | iniciar OAuth |
| `GET /api/auth/google/callback` | concluir OAuth |

Telas necessárias: login, cadastro, confirmação pendente/concluída, esqueci/redefini senha e conta. Páginas protegidas validam sessão no servidor, não só no cliente.

### Segurança obrigatória

- Não usar tokens em `localStorage`, `sessionStorage`, URL, logs ou props renderizadas.
- Limitar por IP, no mínimo: login 10/5 min; cadastro 5/h; reset/reenvio 5/h. Em produção usar Redis ou store compartilhado.
- Restringir CORS do Strapi ao BFF e validar `Origin` em mutações.
- Limitar tamanho do corpo e validar formato antes da chamada ao Strapi.
- Usar state/nonce OAuth, callback permitido e `returnTo` somente como caminho local; bloquear open redirect.
- Usar mensagens neutras para login, reset e reenvio, evitando enumeração de e-mail.
- Configurar SMTP, remetente e templates antes de habilitar produção.

### Strapi

O projeto já usa `@strapi/plugin-users-permissions` com refresh tokens. A implementação deverá complementar essa configuração:

- registro habilitado, e-mail único e confirmação habilitada;
- papel padrão de cliente autenticado;
- URLs de confirmação e reset no frontend público;
- Google habilitado somente com `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`;
- callback permitido somente em `${FRONTEND_PUBLIC_URL}/api/auth/google/callback`;
- `users/me` reduzido a campos seguros, sem hash, tokens, administração ou campos privados.

Nome, CPF, telefone e endereço devem ser modelados explicitamente numa etapa posterior, com revisão LGPD; não são obrigatórios para a Fase 1.

## Fase 2 — teste Strapi → Asaas

Após a autenticação estar pronta, criar a camada externa:

```text
src/services/external/asaas.service.ts
src/api/asaas/controllers/asaas.ts
src/api/asaas/routes/asaas.ts
```

O controller será fino e delegará ao service. O projeto usa Node 20+; `fetch` nativo é suficiente, sem instalar HTTP client.

### Variáveis do backend

```dotenv
ASAAS_API_URL=https://api-sandbox.asaas.com/v3
ASAAS_API_KEY=
ASAAS_TIMEOUT_MS=10000
ASAAS_USER_AGENT=Valhalla-Ecommerce/1.0 (Strapi; sandbox)
ASAAS_TEST_TOKEN=
```

`ASAAS_API_KEY` é exclusiva do backend: não usar `NEXT_PUBLIC_`, não inserir valor real em repositório, resposta JSON ou logs. Sandbox e produção usam URLs e chaves próprias.

Em toda chamada, o service envia:

```http
access_token: <ASAAS_API_KEY>
Content-Type: application/json
User-Agent: <ASAAS_USER_AGENT>
```

O teste inicial é somente leitura, por exemplo `GET /customers?limit=1`. A rota temporária interna do Strapi exige o header `x-internal-test-token` igual a `ASAAS_TEST_TOKEN`; ela não pode ser pública, nem reutilizar a chave Asaas como credencial de acesso.

| Situação | Resposta sanitizada |
| --- | --- |
| sucesso | `200 { ok: true }` |
| chave inválida/ausente | `502 ASAAS_AUTH_FAILED` |
| acesso negado | `502 ASAAS_FORBIDDEN` |
| timeout | `504 ASAAS_TIMEOUT` |
| rede indisponível | `503 ASAAS_UNAVAILABLE` |

Logs só devem registrar código, status HTTP, rota e correlation ID — nunca headers completos, chave ou dados pessoais.

## Fase 3 — checkout hospedado

```text
Cliente autenticado
  → Next.js BFF /api/checkout
  → Strapi valida catálogo, preço e estoque; cria pedido pendente
  → Strapi cria checkout no Asaas com externalReference do pedido
  ← URL do checkout hospedado
Cliente é redirecionado ao Asaas
```

O frontend nunca escolhe preço final nem chama o Asaas. O Strapi calcula o total de um snapshot de produtos/variações, frete e descontos validados no servidor. `externalReference` é um identificador único interno, sem dados pessoais.

A URL de sucesso/cancelamento só melhora a navegação. Ela não confirma pagamento.

| Entidade futura | Campos mínimos |
| --- | --- |
| Pedido | cliente, status, moeda, total, itens-snapshot, referência externa, timestamps |
| Pagamento | pedido, provedor `asaas`, id remoto, status remoto, URL do checkout, valor, dados auditáveis mínimos |
| Evento webhook | provedor, id remoto, payload protegido, recebido/processado em, resultado, idempotência |

Status internos devem ser enums próprios, mapeados dos status Asaas em um único service.

## Fase 4 — webhook e conciliação

Iniciar somente após checkout Sandbox estável.

- Endpoint HTTPS público exclusivo.
- Token de autenticação de webhook verificado antes do processamento.
- Persistir evento e chave de idempotência antes de alterar pedido/pagamento; eventos podem repetir ou chegar fora de ordem.
- Responder rapidamente depois de persistir; processamento longo vai para fila/retry.
- Confirmar pagamento somente por evento válido ou consulta servidor-servidor, nunca por browser.
- Manter auditoria sem vazar informação sensível.

## Dokploy e variáveis

### Backend Strapi

| Variável | Uso |
| --- | --- |
| `FRONTEND_PUBLIC_URL` | links de e-mail e callback permitido |
| `STRAPI_PUBLIC_URL` | callback Google do Strapi |
| `CORS_ORIGINS` | origem exata do frontend |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM` | e-mails |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth Google |
| `ASAAS_API_URL`, `ASAAS_API_KEY`, `ASAAS_TIMEOUT_MS`, `ASAAS_USER_AGENT`, `ASAAS_TEST_TOKEN` | Asaas e rota interna de homologação |

### Frontend Next.js

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | origem pública; não é segredo |
| `STRAPI_INTERNAL_URL` | URL do Strapi acessível pelo BFF; nunca `NEXT_PUBLIC_` |
| `AUTH_COOKIE_SECURE` | `true` em produção; `false` somente HTTP local |
| configuração Redis | rate limit compartilhado, se adotado |

Cadastrar cada variável no serviço correto no Dokploy e fazer redeploy após mudança. Segredos entram no painel, nunca em commit, Docker image ou log de build. URLs públicas precisam ser HTTPS e corresponder exatamente às cadastradas no Google e no Strapi.

## Entregas, aceite e testes

| Fase | Critério de aceite |
| --- | --- |
| Autenticação | cadastro, confirmação, login, sessão, refresh, logout, reset e Google funcionam; tokens não aparecem no cliente |
| Asaas Sandbox | rota interna protegida testa conexão sem criar recurso financeiro nem vazar segredo |
| Checkout Sandbox | pedido é calculado no servidor e checkout redireciona corretamente |
| Webhook Sandbox | evento autenticado muda status uma vez mesmo com reenvio |
| Produção | URLs, SMTP, Google, CORS, cookies e segredos revisados; Sandbox homologado |

Testes mínimos:

- unitários no Next.js para validação, cookies, redirect seguro, erros e refresh;
- unitários no Strapi para configuração, políticas e service Asaas;
- integração das rotas BFF com Strapi simulado;
- fluxo manual Sandbox;
- negativos: origem inválida, payload grande, senha inválida, token expirado, OAuth state ausente, chave Asaas inválida, timeout e webhook duplicado.

## Referências

- [Strapi 5 Documentation](https://docs.strapi.io/)
- [Asaas — Authentication](https://docs.asaas.com/docs/authentication)
- [Asaas — Sandbox](https://docs.asaas.com/docs/sandbox-1)
- [Asaas — Checkout hospedado](https://docs.asaas.com/docs/asaas-checkout)
- [Asaas — criação de Webhook](https://docs.asaas.com/reference/create-new-webhook)
