# DeFlow API — Referência de integração

Fonte oficial: <https://deflow.exchange/pt/docs>

Base URL documentada: `https://api.deflow.exchange/v1`

Esta página registra somente o contrato necessário para o checkout da Valhalla. A documentação oficial é a fonte de verdade para alterações de versão, limites e endpoints adicionais.

## Autenticação

As chamadas autenticadas usam:

```text
Authorization: Bearer <keyId>
X-DF-Secret: <secret>
X-DF-Passphrase: <passphrase>  # somente quando configurada na API key
```

As chaves de sandbox usam o prefixo `dfk_test_`; as chaves de produção usam `dfk_live_`.

Para a aplicação, todos os segredos permanecem exclusivamente no backend. O frontend e o BFF não recebem essas credenciais.

## Cobrança programática para checkout

O endpoint recomendado pela documentação atual para uma cobrança única é:

```text
POST /v1/deposit/create
```

Aliases documentados: `/v1/deposit` e `/v1/depix/buycard`.

O valor do campo `amountInCents` é exatamente o valor que o pagador verá no PIX. O CPF/CNPJ do pagador é obrigatório em cobranças de terceiro.

Headers adicionais obrigatórios:

```text
X-DF-Idempotency-Key: <uuid-v4>
Content-Type: application/json
```

Exemplo mínimo de body:

```json
{
  "amountInCents": 5000,
  "payerTaxNumber": "12345678909"
}
```

O sucesso retorna um envelope `{ data, meta }`. A cobrança em `data` inclui, entre outros campos:

- `id` — identificador externo da transação;
- `status` — estado atual;
- `qrCopyPaste` — código PIX copia e cola;
- `qrImageUrl` — imagem ou data URI do QR, quando disponível;
- `expiresAt` — expiração do QR;
- `paidAt` — momento em que o PIX foi detectado.

Como o checkout atual usa uma página hospedada, o adapter deverá confirmar com a Deflow o mecanismo de URL pública adequado. A API documenta payment links em `POST /v1/pix/links`, mas informa que o pagamento via API de links foi removido; não implementar `/links/pay` ou `/qr/:slug/pay`.

## Idempotência

O mesmo UUID v4 repetido com o mesmo body retorna a resposta original. O mesmo UUID com body diferente retorna `409 IDEMPOTENCY_CONFLICT`. As chaves expiram em 24 horas.

Além da idempotência da Deflow, a aplicação deve persistir a chave no PostgreSQL associada ao usuário e ao pedido. A garantia externa não substitui a garantia interna.

## Status relevantes

Estados de depósito documentados:

```text
pending          não terminal
pending_pix2fa   não terminal
under_review     não terminal
approved         não terminal
delayed          não terminal
will_refund      não terminal
depix_sent       terminal / concluído
expired          terminal / expirado
canceled         terminal / cancelado
refunded         terminal / estornado
error            terminal / falha
```

O adapter deverá mapear esses estados para os estados internos do pedido, sem expor os nomes da Deflow ao frontend.

## Sandbox

Para simular o pagamento de um depósito sandbox:

```text
POST /v1/sandbox/deposit/:id/mark-paid
```

Esse endpoint exige uma API key `dfk_test_` e usa o identificador retornado pela criação do depósito. A simulação é uma capacidade do adapter de sandbox, não uma regra do domínio de pedidos.

## Webhooks

A Deflow envia eventos para uma URL HTTPS configurada por API key. Eventos relevantes para depósitos:

```text
deposit.approved
deposit.completed
deposit.expired
```

O envelope contém `id`, `event`, `createdAt`, `attempt` e `data`. Headers relevantes:

```text
DF-Event-Id
DF-Delivery-Id
DF-Signature
```

`DF-Signature` usa o formato `t=<timestamp>, v1=<hmac>`. O HMAC-SHA256 é calculado sobre `{timestamp}.{corpo-bruto}` usando o segredo da inscrição. A verificação deve:

1. preservar o corpo bruto recebido;
2. rejeitar timestamp fora da tolerância configurada;
3. comparar o HMAC com função constante no tempo;
4. deduplicar pelo `DF-Event-Id` antes de alterar o pedido;
5. responder rapidamente e processar com segurança.

## Rate limiting

`POST /v1/deposit/create` está documentado com limite de 15 requisições por minuto e burst de 5. Em caso de `503`, o adapter poderá repetir conforme a política de retry da aplicação, sempre preservando a mesma chave de idempotência.

## Decisões para o adapter

- O adapter Deflow deve usar `/deposit/create`, não payment link reutilizável, para preservar o valor específico de cada pedido.
- O CPF/CNPJ do perfil será enviado como `payerTaxNumber`.
- O `id` da Deflow será persistido como `providerPaymentId`.
- `qrCopyPaste`, `qrImageUrl` e `expiresAt` poderão ser persistidos se a experiência deixar de usar checkout hospedado.
- O adapter não deve retornar payloads Deflow ao controller.
- Códigos como `IDEMPOTENCY_CONFLICT`, `MISSING_SCOPE` e `SANDBOX_ONLY` devem ser convertidos para erros internos.
