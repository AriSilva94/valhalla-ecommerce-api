# Idempotência do checkout

## Contrato

`POST /api/orders` exige `Idempotency-Key` em UUID v4. A chave é normalizada para minúsculas e tem escopo por usuário autenticado. O corpo aceito contém `items`; um fingerprint SHA-256 do corpo canônico identifica a solicitação, independentemente da ordem das propriedades JSON.

A reserva única `checkoutIdempotencyScope` no banco determina quem executa a chamada externa. Não há coordenação por memória local. O preço e os itens persistidos na primeira solicitação não são recalculados em um replay.

| Situação | Resposta |
| --- | --- |
| Primeira criação concluída, com URL | 201 |
| Repetição concluída | 200, mesmo pedido |
| Mesma chave com corpo diferente | 409 `IDEMPOTENCY_KEY_REUSED` |
| Tentativa em processamento | 409 `CHECKOUT_IN_PROGRESS` |
| Resultado incerto ou incompleto | 409 `CHECKOUT_RECONCILIATION_REQUIRED` |
| Falha registrada antes de iniciar o checkout externo | 502, sem reexecução |

O prazo de processamento não autoriza outra instância a assumir a operação. Depois de um reinício ou timeout, uma cobrança pode existir no provedor mesmo sem resposta local. Não há garantia documentada de idempotência externa do Asaas sendo utilizada.

## Reconciliação manual

Esta entrega não implementa um reconciliador automático ou endpoint administrativo de recuperação.

1. Localizar o pedido pelo usuário e referência interna, sem alterar a reserva de idempotência.
2. Investigar no provedor a cobrança associada à referência e ao horário da tentativa. Ausência em uma consulta isolada não comprova que a cobrança não foi criada.
3. Se houver cobrança, verificar seu estado e identificadores antes de qualquer correção local. Preservar um pagamento já confirmado; não rebaixar `paid` para `pending`.
4. Uma recuperação deve vincular o resultado confirmado ao pedido original. Não apagar a chave nem gerar nova tentativa para contornar uma resposta de reconciliação.

Como a feature ainda está em desenvolvimento, qualquer limpeza de dados de teste deve ter escopo e autorização próprios. A aplicação não limpa registros automaticamente.

## Validação

Os testes de controller cobrem replay, concorrência, isolamento entre usuários, fingerprint, reinício e respostas externas incertas. O teste `tests/payment-idempotency.postgres.test.ts` verifica a restrição única com conexões concorrentes em um schema isolado de PostgreSQL, exigindo `PAYMENT_TEST_DATABASE_URL` explícita.

Esse teste usa uma tabela mínima: não substitui um teste ponta a ponta do schema gerado e do controller Strapi.
