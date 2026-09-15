# Migrações manuais

Antes de implantar a versão que exige `orders.idempotency_key`, execute no ambiente de destino:

```bash
npm run db:migrate:order-idempotency
```

O script preenche pedidos existentes com chaves `legacy-<id>`, cria a restrição única e só então torna a coluna obrigatória. Execute-o antes de iniciar a nova imagem do Strapi.
