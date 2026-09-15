# Migrações manuais

Antes de implantar a versão que exige `orders.idempotency_key`, execute no ambiente de destino:

```bash
npm run db:migrate:order-idempotency
```

O script preenche pedidos existentes com chaves `legacy-<id>`, cria a restrição única e só então torna a coluna obrigatória. Execute-o antes de iniciar a nova imagem do Strapi.

Antes de implantar a recuperação de checkout Asaas, execute também:

```bash
npm run db:migrate:checkout-recovery
```

Quando a persistência local de um checkout recém-criado falha e o cancelamento Asaas também falha, o pedido recebe `checkout_recovery_status = cancel_pending`. Repetições com a mesma chave não criam outro checkout até que o cancelamento seja confirmado. Se banco e Redis estiverem indisponíveis simultaneamente, o checkout órfão não pode ser marcado: a resposta exige reconciliação e um operador deve localizar e cancelar o checkout na Asaas antes de liberar uma nova tentativa.
