import { readFileSync } from "node:fs";

const failures = [];
const env = process.env;
function check(condition, message) { if (!condition) failures.push(message); }
let app;
try {
  app = new URL(env.NEXT_PUBLIC_APP_URL);
  check(app.protocol === "https:" && !app.username && !app.password && app.pathname === "/" && !app.search && !app.hash,
    "NEXT_PUBLIC_APP_URL deve ser uma origem HTTPS sem caminho ou credenciais.");
  check(!["localhost", "127.0.0.1", "gevyro.com.br", "www.gevyro.com.br"].includes(app.hostname),
    "Use o domínio independente do Gevyro Next.");
} catch { failures.push("NEXT_PUBLIC_APP_URL ausente ou inválida."); }
check(env.NEXT_PUBLIC_SUPABASE_URL === "https://zevgzuhtemnjrqeolmit.supabase.co", "Supabase deve apontar ao projeto Gevyro Next.");
check(/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""), "Configure a chave publicável Supabase.");
check(!env.NEXT_PUBLIC_API_URL, "Remova NEXT_PUBLIC_API_URL: API Java não faz parte deste deploy.");
for (const [name, value] of Object.entries(env)) {
  if (name.startsWith("NEXT_PUBLIC_") && /SECRET|PASSWORD|PRIVATE|SERVICE_ROLE|ACCESS_TOKEN/.test(name) && value) {
    failures.push(`Segredo proibido no ambiente público: ${name}`);
  }
}
const config = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");
check(config.includes('output: "standalone"'), "Build standalone necessário.");
if (failures.length) {
  console.error(failures.map(message => `ERRO: ${message}`).join("\n"));
  process.exit(1);
}
console.log("Ambiente de deploy válido; nenhum valor secreto foi exibido.");
