const fs = require('node:fs');
const path = require('node:path');

const migrationsDirectory = path.join(process.cwd(), 'database', 'migrations');
if (!fs.existsSync(migrationsDirectory)) process.exit(0);

const migrationFiles = fs.readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith('.js') || file.endsWith('.cjs'));

for (const file of migrationFiles) {
  const migrationPath = path.join(migrationsDirectory, file);
  let migration;
  try {
    migration = require(migrationPath);
  } catch (error) {
    throw new Error(`Não foi possível carregar a migration ${file}: ${error.message}`);
  }
  if (typeof migration.up !== 'function' || typeof migration.down !== 'function') {
    throw new Error(`Migration inválida: ${file}. Exporte funções up e down; scripts standalone devem ficar em scripts/.`);
  }
}

console.log(`Migrations válidas: ${migrationFiles.length}`);
