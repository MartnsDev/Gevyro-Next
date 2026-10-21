import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = "zevgzuhtemnjrqeolmit";
const commands = {
  status: ["migration", "list", "--linked"],
  check: ["db", "push", "--linked", "--dry-run"],
  migrate: ["db", "push", "--linked"],
};
const command = commands[process.argv[2]];
if (!command) {
  console.error("Use status, check ou migrate.");
  process.exit(1);
}
let linked;
try {
  linked = readFileSync(
    new URL("../supabase/.temp/project-ref", import.meta.url),
    "utf8",
  ).trim();
} catch {
  console.error(
    "Projeto não vinculado. Autentique a CLI e execute npm run supabase:link.",
  );
  process.exit(1);
}
if (linked !== target) {
  console.error(
    `Operação recusada: somente o Supabase do Gevyro Next (${target}) é permitido.`,
  );
  process.exit(1);
}
const result = spawnSync("npx", ["--yes", "supabase@2.121.0", ...command], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) {
  console.error("Não foi possível iniciar a CLI Supabase.");
  process.exit(1);
}
process.exit(result.status ?? 1);
