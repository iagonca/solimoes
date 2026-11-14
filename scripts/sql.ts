// Roda consultas SQL avulsas e mostra o resultado como tabela.
// Uso: npm run sql -- "select ..." ["select ..."]
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local", quiet: true });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
  await client.connect();
  for (const q of process.argv.slice(2)) {
    const { rows } = await client.query(q);
    console.table(rows);
  }
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
