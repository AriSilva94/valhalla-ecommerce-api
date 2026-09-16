# Referência Deflow e decisões de integração

Fonte: https://deflow.exchange/pt/docs

Markdown oficial: https://api.deflow.exchange/v1/docs.md

Resumo da consulta de 2026-09-16; não é cópia integral. A fonte oficial deve ser consultada novamente se a API mudar.

## Contrato consultado

Base: https://api.deflow.exchange/v1. Autenticação: Bearer key ID, X-DF-Secret e passphrase quando exigida. Segredos ficam no servidor.

Cobrança avulsa: POST /deposit/create, com amountInCents, payerTaxNumber e UUID v4 em X-DF-Idempotency-Key. A idempotência externa dura 24 horas. A resposta fornece identificador, status e QR Pix. A liquidação ocorre em DePix na Liquid.

Payment links são reutilizáveis; não equivalem automaticamente a uma cobrança exclusiva por pedido. /links/pay e /qr/:slug/pay foram removidos.

Webhooks: validar DF-Signature com HMAC-SHA256 sobre timestamp e corpo bruto, verificar idade e deduplicar pelo identificador estável do evento. deposit.approved indica confirmação Pix; deposit.completed indica envio de DePix.

Sandbox: POST /sandbox/deposit/:id/mark-paid.

## Implicações para Valhalla (análise do projeto)

A especificação inicial pressupunha uma URL de checkout hospedado e uma operação de cadastro de cliente comum a todos os gateways. A cobrança avulsa Deflow usa QR Pix; o adapter não cria cliente externo fictício e retorna um identificador técnico de conta.

A decisão foi aprovada: exibir QR/copia e cola no site, receber em DePix e liberar o pedido somente em deposit.completed/depix_sent.

Pedidos devem guardar provedor, identificador externo e valor bruto esperado. Eventos assinados também precisam corresponder ao pedido e ao valor. A reserva interna de idempotência é persistente e não deve expirar só porque a proteção externa expirou.


## Configuração implementada

- `PAYMENT_PROVIDER=deflow` seleciona o adapter Deflow; qualquer outro valor mantém Asaas.
- `DFLOW_API_URL` usa `https://api.deflow.exchange/v1` por padrão.
- `DFLOW_KEY_ID`, `DFLOW_SECRET` e opcionalmente `DFLOW_PASSPHRASE` são server-side.
- `DFLOW_WEBHOOK_SECRET` valida `DF-Signature` sobre o corpo bruto, com tolerância de cinco minutos.
- `DFLOW_TIMEOUT_MS` controla o timeout HTTP.

O adapter usa `POST /deposit/create` com a mesma chave UUID persistida internamente, retornando `qrCopyPaste` e `qrImageUrl`. O endpoint sandbox `POST /sandbox/deposit/:id/mark-paid` é usado apenas pela ação de simulação.
