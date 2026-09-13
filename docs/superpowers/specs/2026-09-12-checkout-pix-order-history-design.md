# Checkout Pix (Asaas) + Histórico de Pedidos — Design

**Data:** 2026-09-12
**Repositórios afetados:** `valhalla-ecommerce-api` (backend) e `valhalla-ecommerce` (frontend)

## Objetivo

Permitir que um cliente autenticado finalize a compra do carrinho pagando via
Pix (Asaas Sandbox), e consulte o histórico de pedidos pelo menu de conta.
Método de pagamento único por hora: **Pix**. Sem controle de estoque, sem
cálculo de frete.

## Fora de escopo

Cartão de crédito/boleto, frete, controle de estoque, cupom de desconto,
edição/cancelamento de pedido pelo cliente, nota fiscal, múltiplos endereços
por cliente (apenas um endereço salvo, sobrescrito a cada edição).

## Arquitetura

Mesmo padrão BFF já usado na autenticação: navegador fala só com o Next.js
(`app/api/**`), que fala com Strapi via rede interna Docker
(`STRAPI_INTERNAL_URL`) usando o JWT do cliente (cookie `valhalla_access`).
Strapi encapsula a Asaas — a chave `ASAAS_API_KEY` nunca sai do backend.

```
Browser → Next.js BFF → Strapi (JWT do usuário) → Asaas Sandbox
                              ↑
Asaas ─── webhook (token) ────┘
```

## Content-Types novos (Strapi)

### `customer-profile` (1:1 com `plugin::users-permissions.user`)

Guarda dados que a Asaas exige para criar um cliente (`customer`) e o
endereço de entrega. Separado do schema nativo do plugin de usuários para
não sobrescrever com futuras migrações do Strapi.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `user` | relation oneToOne → `plugin::users-permissions.user` | dono do perfil |
| `cpfCnpj` | string | somente dígitos, validado no BFF antes de salvar |
| `phone` | string | opcional, usado na Asaas |
| `addressLine` | string | rua |
| `addressNumber` | string | número |
| `addressComplement` | string | opcional |
| `neighborhood` | string | bairro |
| `city` | string | |
| `state` | string | UF, 2 letras |
| `postalCode` | string | CEP, somente dígitos |
| `asaasCustomerId` | string | preenchido na 1ª compra, reusado depois |

Perfil incompleto (CPF ou endereço faltando) bloqueia o checkout — o BFF
retorna erro dedicado e o frontend redireciona para o formulário de perfil.

### `order`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `user` | relation manyToOne → `plugin::users-permissions.user` | dono do pedido |
| `items` | JSON | snapshot imutável: `[{ productSlug, productName, variantSku, colorName, configLabel, unitPrice, qty }]` |
| `totalAmount` | decimal | soma calculada no servidor a partir de `items`, nunca confiada do cliente |
| `status` | enumeration | `pending`, `paid`, `expired`, `cancelled`, `failed` |
| `asaasPaymentId` | string | id da cobrança na Asaas |
| `asaasInvoiceUrl` | string | link da fatura Asaas (fallback caso o QR falhe) |
| `pixQrCodeImage` | text | base64 do PNG do QR code |
| `pixCopyPaste` | text | código copia-e-cola |
| `pixExpiration` | datetime | validade da cobrança Pix |

Sem `draftAndPublish`. `items` é gravado uma vez na criação e nunca mais
editado (preço não muda se o produto mudar depois).

## Relação com "Minha lista" (`/lista`)

`/lista` hoje é uma lista de interesse: monta uma mensagem e abre o
WhatsApp, com o aviso explícito "Nenhum pagamento é feito neste site"
(`ListaClient.tsx`, step `"cart"`). Esse fluxo é mantido como está — não é
removido nem reescrito. O checkout Pix é uma **segunda opção**, adicionada
lado a lado com o botão existente "Revisar solicitação →" no mesmo step
`"cart"`: um novo botão **"Pagar com Pix"** ao lado dele, usando o mesmo
carrinho local (`app/lib/cart-store.ts`, mesmo `CartLine[]`). O aviso
"Nenhum pagamento é feito neste site" é removido/ajustado só no contexto da
review do WhatsApp (`step === "review"`), já que agora existe um caminho
real de pagamento — mas o step `"review"`/WhatsApp em si não muda de
comportamento.

## Fluxo de checkout

1. Cliente logado, carrinho não vazio, clica **"Pagar com Pix"** no step
   `"cart"` de `/lista` → navega para `/checkout`. Sem sessão, redireciona
   para `/entrar?returnTo=/checkout`.
2. `/checkout` chama `GET /api/account/profile` (BFF). Perfil incompleto →
   mostra formulário (CPF, telefone, endereço) antes de prosseguir; ao
   salvar, chama `PUT /api/account/profile`.
3. Perfil completo → mostra resumo do carrinho (itens vindos do
   `localStorage`, iguais aos de `/lista`) e botão **"Pagar com Pix"**.
4. Cliente confirma → frontend envia `POST /api/checkout` com os itens do
   carrinho local (BFF nunca lê preço de lugar nenhum além do que o Strapi
   validar contra o catálogo — ver Validação de preço abaixo).
5. Strapi:
   a. Revalida cada item contra o catálogo atual (produto/variante existe,
      preço bate dentro de uma tolerância — ver seção Validação); itens
      inválidos abortam o pedido com erro claro.
   b. Cria `order` com `status: pending` e `items`/`totalAmount` do
      snapshot revalidado.
   c. Cria (ou reusa `asaasCustomerId` salvo) cliente na Asaas usando dados
      do `customer-profile`.
   d. Cria cobrança Pix na Asaas (`POST /payments`, `billingType: PIX`,
      `value: totalAmount`, `dueDate`: hoje) e busca o QR code
      (`GET /payments/{id}/pixQrCode`).
   e. Grava `asaasPaymentId`, `pixQrCodeImage`, `pixCopyPaste`,
      `pixExpiration`, `asaasInvoiceUrl` no order.
   f. Falha em qualquer chamada Asaas → marca `order.status = failed` e
      retorna erro genérico ao BFF (nunca vaza corpo de erro da Asaas).
6. BFF devolve ao frontend: `{ orderId, pixQrCodeImage, pixCopyPaste,
   pixExpiration, totalAmount }` (nunca token/JWT extra, nunca dados de
   outro pedido).
7. Frontend mostra QR code + copia-e-cola + contagem regressiva até
   `pixExpiration`. Enquanto `pending`, faz `GET /api/orders/{id}` a cada 5s
   (poll da nossa própria API, não da Asaas) para saber se já foi pago.
8. Asaas confirma o Pix → dispara webhook `PAYMENT_RECEIVED` ou
   `PAYMENT_CONFIRMED` → Strapi atualiza `order.status = paid`.
9. Próximo poll do frontend detecta `paid` → limpa carrinho local
   (`updateCart(() => [])`) → redireciona para `/pedidos/{id}`.
10. Se `pixExpiration` passar sem pagamento, o próximo poll (ou o webhook
    `PAYMENT_OVERDUE`) marca `order.status = expired`; a tela de checkout
    mostra "Pix expirado" com botão para voltar ao carrinho e recomeçar
    (não gera novo Pix para o mesmo pedido — cria um pedido novo do zero,
    carrinho local já está intacto).

### Validação de preço

O frontend nunca é fonte de verdade de preço. O BFF envia ao Strapi apenas
`{ productSlug, variantSku, qty }` por linha (sem `unitPrice`); o Strapi
busca o preço atual do produto/variante no catálogo e monta o `items`
snapshot com esse preço. Isso elimina qualquer possibilidade de o cliente
forjar um preço menor no carrinho local antes de finalizar a compra.

## Webhook Asaas

`POST /api/asaas/webhook` (Strapi, rota pública, sem JWT de usuário).

- Valida header `asaas-access-token` contra `ASAAS_WEBHOOK_TOKEN` (novo env,
  comparação em tempo constante, mesmo padrão de `internal-test-token`).
- Token inválido/ausente → `403`, não processa nem loga o payload.
- Evento reconhecido (`PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`,
  `PAYMENT_OVERDUE`, `PAYMENT_DELETED`) → busca `order` por
  `asaasPaymentId`, atualiza `status` (`paid`, `paid`, `expired`,
  `cancelled` respectivamente). Pedido não encontrado ou evento
  desconhecido → `200` (Asaas não deve reter/re-tentar por nosso erro) e
  log interno apenas.
- Sempre responde `200` rápido (Asaas trata timeout/erro como falha e
  reenvia); todo processamento pesado é síncrono e simples (uma consulta +
  um update), sem fila.

## Rotas BFF novas (Next.js)

| Rota | Método | Descrição |
| --- | --- | --- |
| `/api/account/profile` | GET | retorna perfil (sem `asaasCustomerId`) ou `null` |
| `/api/account/profile` | PUT | valida CPF/CEP/UF e persiste no Strapi |
| `/api/checkout` | POST | cria pedido + cobrança Pix, ver fluxo acima |
| `/api/orders` | GET | lista pedidos do usuário logado (paginado, mais recente primeiro) |
| `/api/orders/[id]` | GET | detalhe/status de um pedido; 404 se não for do usuário logado |

Todas exigem sessão válida (mesmo `resolveSession()` já usado nas rotas
existentes); erro de origem/rate limit segue os padrões de
`app/api/auth/_shared.ts`.

## Rotas novas (Strapi)

| Rota | Auth | Descrição |
| --- | --- | --- |
| `POST /api/orders` | JWT do usuário | cria pedido + integra Asaas (fluxo passo 5) |
| `GET /api/orders` | JWT do usuário | lista só os pedidos do usuário autenticado (filtro por `user.id`, nunca aceita filtro de outro usuário) |
| `GET /api/orders/:id` | JWT do usuário | 403/404 se o pedido não pertencer ao usuário |
| `GET/PUT /api/customer-profiles/me` | JWT do usuário | rota custom (não a REST genérica) que sempre opera sobre o perfil do usuário autenticado, nunca aceita `id` arbitrário |
| `POST /api/asaas/webhook` | token de webhook | ver seção acima |

`asaas.service.ts` (já existe) ganha os métodos `createCustomer`,
`createPixCharge`, `getPixQrCode` — mesmo padrão de erro sanitizado já
usado por `testConnection`.

## Frontend — telas e componentes

- `app/checkout/page.tsx` — orquestra perfil incompleto → formulário →
  resumo → pagamento, reaproveitando `AuthTextField` e padrões visuais dos
  formulários de auth.
- `app/checkout/CheckoutForm.tsx`, `PixPayment.tsx` (QR + copia-e-cola +
  countdown + poll).
- `app/pedidos/page.tsx` — lista de pedidos (data, total, status com cor —
  reusa padrão de badges do design system).
- `app/pedidos/[id]/page.tsx` — detalhe do pedido (itens, total, status,
  QR/copia-e-cola se ainda `pending`).
- `AccountMenu.tsx` — novo item **"Meus pedidos"** (ícone `Receipt`) entre
  "Minha lista" e "Sair", sem badge (badge é só do carrinho).

## Segurança

- CPF/CEP validados no BFF (formato) antes de persistir; nunca logados.
- `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` só existem no ambiente do Strapi.
- Preço sempre recalculado no servidor (ver Validação de preço).
- `GET /api/orders/:id` e `customer-profiles/me` nunca aceitam id de outro
  usuário — sempre derivam o dono de `ctx.state.user`.
- Webhook exige token, timing-safe compare, não loga payload bruto (pode
  conter dados pessoais do pagador).

## Testes

Mesmo padrão dos módulos de auth: testes unitários das funções puras
(validação de CPF/CEP, cálculo de total, mapeamento de status de webhook),
testes de rota com `fetch` mockado (Strapi ↔ Asaas), testes de policy do
webhook (token ausente/inválido/válido). Sem teste E2E real contra a Asaas
(Sandbox real fica para verificação manual, como no health-check).

## Verificação do plano

Cobertura: perfil do cliente, criação de pedido + cobrança Pix, webhook de
confirmação, histórico de pedidos, item de menu. Frete, estoque, outros
meios de pagamento e cancelamento pelo cliente ficam fora, conforme
combinado.
