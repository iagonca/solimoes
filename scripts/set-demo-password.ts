// Troca a senha das contas demo: entra com a senha atual (DEMO_PASSWORD) e
// chama change-password no Neon Auth. Uso: npm run demo:password -- <nova> [email]
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";

config({ path: ".env.local", quiet: true });

const BASE = process.env.NEON_AUTH_BASE_URL!;
const ORIGIN = "http://localhost:3000";
const ACCOUNTS = ["marina@example.org", "pedro@example.org", "coordenacao@example.org", "raimunda@example.org",
  "joao@example.org", "francisca@example.org", "lima@example.org"];

async function change(email: string, current: string, next: string) {
  const login = await fetch(`${BASE}/sign-in/email`, {
    method: "POST", headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: current }),
  });
  if (!login.ok) return `login falhou (${login.status}) ${await login.text()}`;
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const res = await fetch(`${BASE}/change-password`, {
    method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({ currentPassword: current, newPassword: next, revokeOtherSessions: false }),
  });
  return res.ok ? "ok" : `troca falhou (${res.status}) ${await res.text()}`;
}

async function main() {
  const [next, only] = process.argv.slice(2);
  if (!next) throw new Error("informe a nova senha");
  const current = process.env.DEMO_PASSWORD!;
  const targets = only ? [only] : ACCOUNTS;
  let allOk = true;
  for (const email of targets) {
    const r = await change(email, current, next);
    if (r !== "ok") allOk = false;
    console.log(`${email}: ${r}`);
  }
  if (allOk && !only) {
    const env = readFileSync(".env.local", "utf8").replace(/^DEMO_PASSWORD=.*$/m, `DEMO_PASSWORD=${next}`);
    writeFileSync(".env.local", env);
    console.log("DEMO_PASSWORD atualizada em .env.local");
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
