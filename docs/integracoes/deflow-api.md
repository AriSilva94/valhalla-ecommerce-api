# Referência Deflow e decisões de integração

Fonte: https://deflow.exchange/pt/docs

Markdown oficial: https://api.deflow.exchange/v1/docs.md

Resumo da consulta de 2026-09-15; não é cópia integral. Em 2026-09-16, a reconsulta pela ferramenta web falhou. Revalidar os contratos antes do adapter.

## Contrato consultado

Base: https://api.deflow.exchange/v1. Autenticação: Bearer key ID, X-DF-Secret e passphrase quando exigida. Segredos ficam no servidor.

Cobrança avulsa: POST /deposit/create, com amountInCents, payerTaxNumber e UUID v4 em X-DF-Idempotency-Key. A idempotência externa dura 24 horas. A resposta fornece identificador, status e QR Pix. A liquidação ocorre em DePix na Liquid.

Payment links são reutilizáveis; não equivalem automaticamente a uma cobrança exclusiva por pedido. /links/pay e /qr/:slug/pay foram removidos.

Webhooks: validar DF-Signature com HMAC-SHA256 sobre timestamp e corpo bruto, verificar idade e deduplicar pelo identificador estável do evento. deposit.approved indica confirmação Pix; deposit.completed indica envio de DePix.

Sandbox: POST /sandbox/deposit/:id/mark-paid.

## Implicações para Valhalla (análise do projeto)

A especificação inicial pressupunha uma URL de checkout hospedado e uma operação de cadastro de cliente comum a todos os gateways. Esses requisitos não estão demonstrados para a cobrança avulsa Deflow. Não criar endpoints fictícios para satisfazer a interface.

Antes da entrega 6, confirmar com o usuário o recebimento em DePix, a exibição do QR no site e o estado que libera o pedido. Essa decisão está pendente; a proposta é aguardar liquidação e usar uma ação de pagamento discriminada por tipo, como redirect ou pix.

Pedidos devem guardar provedor, identificador externo e valor bruto esperado. Eventos assinados também precisam corresponder ao pedido e ao valor. A reserva interna de idempotência é persistente e não deve expirar só porque a proteção externa expirou.

O resumo anterior tratava o uso de deposit/create como decisão aprovada. Isso era apenas uma proposta técnica; não autoriza mudança automática da experiência nem da forma de liquidação.
