# Autenticação BFF e teste Asaas — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa por tarefa. Os passos usam checkboxes.

**Objetivo:** Implementar login de clientes pelo BFF do Next.js e, somente após ele estar validado, uma chamada segura de homologação Strapi → Asaas Sandbox.

**Arquitetura:** O Next.js será o único serviço acessado pelo navegador para autenticação e guardará os tokens emitidos pelo Strapi em cookies HTTP-only. O Strapi será a fonte de identidade e encapsulará o Asaas em um service de servidor; checkout, Pix e webhook não entram neste plano.

**Stack:** Next.js 16.3.2, React 19, TypeScript 5, Strapi 5.50.2, PostgreSQL, Node 20+, Vitest, fetch nativo, Dokploy.

---

## Limites do plano

Incluído: cadastro, confirmação por e-mail, login, sessão/refresh, logout, reset de senha, Google OAuth, rate limit, CORS/origin e teste protegido de conectividade Asaas.

Excluído: pedido, carrinho, preço, checkout Asaas, cliente Asaas, cobrança, Pix, QR Code, webhook, filas e dados adicionais de cliente.

## Estrutura alvo

| Repositório | Arquivo | Responsabilidade |
| --- | --- | --- |
| backend | `config/plugins.ts` | refresh token, SMTP e configuração do plugin |
| backend | `config/middlewares.ts` | CORS restrito ao frontend |
| backend | `src/auth/config.ts` | funções puras da configuração do usuário/Google/e-mail |
| backend | `src/index.ts` | persistir configuração reprodutível no bootstrap |
| backend | `src/extensions/users-permissions/strapi-server.ts` | resposta segura de `users/me` |
| backend | `src/services/external/asaas.service.ts` | chamada Asaas e mapeamento sanitizado de erro |
| backend | `src/api/asaas/{controllers,routes}/asaas.ts` | teste interno protegido |
| frontend | `lib/auth/*` | contratos, cookies, cliente Strapi, validação, sessão e OAuth |
| frontend | `app/api/auth/**/route.ts` | BFF público de autenticação |
| frontend | `app/[locale]/{login,register,forgot-password,auth}/` | telas e formulários |
| frontend | `app/api/asaas/test/route.ts` | opcionalmente proxy administrativo; não expor a público |
| ambos | testes co-localizados | comportamento e segurança |

O frontend está em `C:\\Users\\ariov\\Desktop\\projetos\\valhalla-project\\valhalla-ecommerce`; todos os caminhos de frontend abaixo são relativos a esse repositório. Os demais são relativos ao backend atual.

### Task 1: Configurar autenticação reproduzível no Strapi

**Arquivos:**

- Criar: `src/auth/config.ts`
- Criar: `src/auth/config.test.ts`
- Modificar: `config/plugins.ts`
- Modificar: `src/index.ts`
- Modificar: `.env.example`

- [ ] **Passo 1: Escrever os testes de configuração**

Criar testes para `buildAdvancedSettings` e `buildGoogleProvider`:

```ts
expect(buildAdvancedSettings({}, 'https://loja.example.com')).toMatchObject({
  unique_email: true,
  allow_register: true,
  email_confirmation: true,
  email_reset_password: 'https://loja.example.com/auth/reset-password',
  email_confirmation_redirection: 'https://loja.example.com/auth/email-confirmed',
});
expect(buildGoogleProvider({}, 'https://api.example.com')).toMatchObject({ enabled: false });
```

- [ ] **Passo 2: Confirmar que os testes falham**

Executar: `npm test -- src/auth/config.test.ts`

Esperado: falha porque o módulo não existe.

- [ ] **Passo 3: Implementar as funções puras**

Criar `buildAdvancedSettings` com e-mail único, confirmação e URLs do frontend. Criar `buildGoogleProvider` que só ativa quando as duas credenciais existem e usa `<STRAPI_PUBLIC_URL>/api/connect/google/callback`. Criar `buildEmailTemplates` com URLs de confirmação/reset sem segredos.

- [ ] **Passo 4: Configurar o plugin**

Em `config/plugins.ts`, manter upload existente e configurar:

```ts
'users-permissions': {
  config: {
    jwtManagement: 'refresh',
    jwtSecret: env('JWT_SECRET'),
    accessTokenLifespan: 600,
    maxRefreshTokenLifespan: 2592000,
    idleRefreshTokenLifespan: 1209600,
    maxSessionLifespan: 2592000,
    idleSessionLifespan: 1209600,
    sessions: { httpOnly: false },
  },
},
```

Adicionar configuração Nodemailer condicionada a `SMTP_USER` e `SMTP_PASS`.

- [ ] **Passo 5: Persistir a configuração no bootstrap**

Em `src/index.ts`, obter os stores `advanced`, `grant` e `email` do plugin users-permissions, mesclar o estado atual, chamar as funções de `src/auth/config.ts` e gravar somente se o JSON mudou.

- [ ] **Passo 6: Declarar variáveis de exemplo**

Adicionar, sem valores reais: `FRONTEND_PUBLIC_URL`, `STRAPI_PUBLIC_URL`, `CORS_ORIGINS`, SMTP, `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.

- [ ] **Passo 7: Validar e commitar**

Executar: `npm test -- src/auth/config.test.ts`

Esperado: PASS.

Commit: `git add config/plugins.ts src/index.ts src/auth .env.example && git commit -m "feat: configure customer authentication"`.

### Task 2: Restringir backend e retornar perfil seguro

**Arquivos:**

- Criar: `src/extensions/users-permissions/strapi-server.ts`
- Criar: `src/extensions/users-permissions/strapi-server.test.ts`
- Modificar: `config/middlewares.ts`

- [ ] **Passo 1: Testar o serializador de usuário**

Cobrir que o resultado contém somente `id`, `username`, `email`, `confirmed`, `blocked` e papel, e não contém `password`, `resetPasswordToken` nem `confirmationToken`.

- [ ] **Passo 2: Implementar extensão `me`**

Sobrescrever apenas `plugin.controllers.user.me`; negar requisição sem `ctx.state.user.id`, consultar usuário e papel e retornar a lista explícita de campos seguros.

- [ ] **Passo 3: Configurar CORS**

Em `config/middlewares.ts`, restringir origem à lista CSV de `CORS_ORIGINS`, métodos a `GET, POST, OPTIONS`, headers a `Content-Type, Authorization, Origin` e `credentials: true`. Não alterar as políticas de mídia existentes.

- [ ] **Passo 4: Validar e commitar**

Executar: `npm test -- src/extensions/users-permissions/strapi-server.test.ts`

Esperado: PASS.

Commit: `git add config/middlewares.ts src/extensions && git commit -m "feat: secure customer profile endpoint"`.

### Task 3: Criar o núcleo de autenticação BFF no Next.js

**Arquivos:**

- Criar: `lib/auth/contracts.ts`, `cookies.ts`, `strapi-client.ts`, `validation.ts`, `request.ts`, `redirect.ts`, `session.ts`, `handlers.ts`
- Criar: testes em `lib/auth/*.test.ts`

- [ ] **Passo 1: Escrever testes de cookies e redirect**

Testar que os tokens viram cookies `HttpOnly`, `SameSite=Lax`, `Secure` em HTTPS, e que `safeRedirect('//evil.example', '/dashboard')` retorna `/dashboard`.

- [ ] **Passo 2: Implementar tipos e cookies**

Definir `AuthTokens`, `AuthUser` e respostas discriminadas `{ ok: true, data }` / `{ ok: false, error, status }`. Criar dois cookies HTTP-only, um cookie nonce OAuth e instruções para limpá-los.

- [ ] **Passo 3: Implementar cliente Strapi**

Usar `STRAPI_INTERNAL_URL` e `fetch` com `AbortSignal.timeout(10000)`. Implementar `login`, `register`, `me`, `refresh`, `logout`, `forgotPassword`, `resetPassword`, `resendConfirmation`, `changePassword` e `googleCallback`. Nunca retornar tokens ao chamador de página.

- [ ] **Passo 4: Implementar validação, origem e sessão**

Limitar JSON a 16 KiB; validar e-mail e senha; comparar `Origin` à URL pública; resolver sessão com uma única tentativa de refresh; mapear 401/403 e falha de rede a erros públicos constantes.

- [ ] **Passo 5: Validar e commitar**

Executar: `npm test -- lib/auth`

Esperado: PASS.

Commit: `git add lib/auth && git commit -m "feat: add BFF authentication core"`.

### Task 4: Expor rotas BFF de e-mail/senha

**Arquivos:**

- Criar: `app/api/auth/_shared.ts`
- Criar: `app/api/auth/{register,login,session,logout,forgot-password,reset-password,resend-confirmation}/route.ts`
- Criar: testes de rota e handlers

- [ ] **Passo 1: Escrever testes de rate limit e origem**

Cobrir `429` após o limite, `403 INVALID_ORIGIN` para origem externa e que login bem-sucedido devolve usuário sem token e envia dois `Set-Cookie` HTTP-only.

- [ ] **Passo 2: Implementar compartilhados**

Criar `getClientIp` que trata `x-forwarded-for`, `enforceRateLimit`, leitura dos cookies e `jsonWithCookies`. Provisionar Redis no Dokploy antes do deploy de produção e usar esse store; não usar limite distribuído em memória.

- [ ] **Passo 3: Implementar rotas**

Cada rota constrói cliente Strapi, valida origem e payload e chama handler. Aplicar os limites aprovados: login 10/5 min; cadastro 5/h; recuperação/reenvio 5/h; reset 10/h. Recuperação e reenvio sempre retornam `{ ok: true }`.

- [ ] **Passo 4: Validar e commitar**

Executar: `npm test -- app/api/auth`

Esperado: PASS.

Commit: `git add app/api/auth && git commit -m "feat: expose BFF auth routes"`.

### Task 5: Integrar Google OAuth e telas de conta

**Arquivos:**

- Criar: `app/api/auth/google/route.ts`
- Criar: `app/api/auth/google/callback/route.ts`
- Criar/modificar: `app/[locale]/login/*`, `register/*`, `forgot-password/*`, `auth/reset-password/*`, `auth/email-confirmed/*`
- Criar: testes OAuth e formulários

- [ ] **Passo 1: Escrever testes OAuth**

Cobrir criação do cookie nonce, ausência dele no callback, erro retornado pelo Google, troca válida pelo BFF e bloqueio de `returnTo` externo.

- [ ] **Passo 2: Implementar início e callback**

No início, gerar `randomBytes(16)`, salvar nonce e redirecionar ao endpoint Google do Strapi com callback BFF. No callback, exigir nonce, trocar `access_token` no Strapi, gravar cookies e limpar nonce antes de redirecionar.

- [ ] **Passo 3: Implementar telas**

Os formulários chamam apenas `/api/auth/*`, exibem erro público por campo e não conhecem URL/tokens Strapi. O botão Google aponta para `/api/auth/google` com caminho local de retorno.

- [ ] **Passo 4: Validar e commitar**

Executar: `npm test && npm run lint && npm run build`

Esperado: todos PASS.

Commit: `git add app lib && git commit -m "feat: add customer login and Google OAuth"`.

### Task 6: Implementar teste interno Asaas no Strapi

**Arquivos:**

- Criar: `src/services/external/asaas.service.ts`
- Criar: `src/services/external/asaas.service.test.ts`
- Criar: `src/api/asaas/controllers/asaas.ts`
- Criar: `src/api/asaas/routes/asaas.ts`
- Criar: `src/policies/internal-test-token.ts`
- Criar: testes de controller/policy
- Modificar: `.env.example`

- [ ] **Passo 1: Escrever os testes do service**

Mockar `fetch` e testar: sucesso em `GET /customers?limit=1`; 401; 403; `TimeoutError`; erro de rede. Testar que o resultado público não contém a API key.

- [ ] **Passo 2: Implementar o service**

Usar `ASAAS_API_URL`, `ASAAS_API_KEY`, `ASAAS_TIMEOUT_MS` e `ASAAS_USER_AGENT`. Falhar sem chave configurada. Enviar exatamente o header `access_token`, mais `Content-Type` e `User-Agent`. Usar timeout e retornar códigos internos `ASAAS_AUTH_FAILED`, `ASAAS_FORBIDDEN`, `ASAAS_TIMEOUT` e `ASAAS_UNAVAILABLE`.

- [ ] **Passo 3: Proteger a rota**

Adicionar `ASAAS_TEST_TOKEN` sem valor ao `.env.example`. Criar `global::internal-test-token` que compara em tempo constante o header `x-internal-test-token` com `ASAAS_TEST_TOKEN`, recusa token ausente ou inválido com `403` (mapeamento padrão do Strapi de `PolicyError` para `ForbiddenError`) e não registra o valor. A rota `GET /api/asaas/test` usa essa política; `auth: false` combinado com essa política é a configuração correta e necessária, já que nenhuma role recebe essa permissão no bootstrap — sem `auth: false`, a autenticação padrão retornaria 403 para toda requisição independentemente da validade do token.

- [ ] **Passo 4: Mapear a resposta**

Controller responde `200 { ok: true }` no sucesso; 502 para autenticação/forbidden, 504 para timeout e 503 para indisponibilidade. Logs registram somente rota, status e correlation ID.

- [ ] **Passo 5: Validar e commitar**

Executar: `npm test -- src/services/external/asaas.service.test.ts`

Esperado: PASS.

Commit: `git add src/services src/api/asaas src/policies .env.example && git commit -m "feat: add protected Asaas Sandbox health check"`.

### Task 7: Configurar homologação e verificar ponta a ponta

**Arquivos:**

- Modificar: `.env.dokploy.dev` e configuração Dokploy, sem inserir segredos no Git
- Modificar: documentação operacional somente se alguma variável ou URL divergir da especificação

- [ ] **Passo 1: Configurar Dokploy**

No frontend, definir `NEXT_PUBLIC_SITE_URL`, `STRAPI_INTERNAL_URL`, `AUTH_COOKIE_SECURE=true` e Redis. No backend, definir URLs públicas, CORS, SMTP, Google e Asaas Sandbox. Inserir `ASAAS_API_KEY` apenas no painel do backend.

- [ ] **Passo 2: Registrar callbacks**

No Google, registrar o callback público do Strapi. No Strapi, permitir somente o callback BFF. Confirmar que as três URLs usam HTTPS e são idênticas às variáveis.

- [ ] **Passo 3: Homologar**

Validar cadastro, confirmação, login, refresh após expiração, logout, reset, Google, bloqueio de origem inválida e rate limit. Como administrador autorizado, chamar `GET /api/asaas/test` e esperar `200 { ok: true }`.

- [ ] **Passo 4: Rodar a suíte final**

Backend: `npm test && npm run build`

Frontend: `npm test && npm run lint && npm run build`

Esperado: todos os comandos terminam com código 0.

- [ ] **Passo 5: Registrar evidência e commitar**

Registrar no PR/issue somente status dos testes e ambiente, sem respostas que contenham dados pessoais ou chaves. Commitar somente arquivos de código/documentação autorizados.

## Verificação do plano

Cobertura da especificação: autenticação (Tasks 1–5), proteção e teste Asaas (Task 6), Dokploy e homologação (Task 7). Checkout, Pix, QR Code e webhook permanecem explicitamente fora do escopo.
