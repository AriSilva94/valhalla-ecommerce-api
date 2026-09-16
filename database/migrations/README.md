# Migrations do Strapi

Arquivos nesta pasta são descobertos pelo executor de migrations do Strapi. Cada migration deve exportar funções `up` e `down` compatíveis com o Umzug usado pelo Strapi 5.

Scripts manuais de manutenção de dados devem ficar em `scripts/`, com um comando explícito no `package.json`. Não coloque scripts standalone nesta pasta: eles podem derrubar o bootstrap do Strapi com `fn is not a function`.
