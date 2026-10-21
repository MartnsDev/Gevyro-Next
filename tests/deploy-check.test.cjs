const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const script = path.resolve(__dirname, "../scripts/deploy-check.mjs");
const environment = {
  NEXT_PUBLIC_APP_URL: "https://next.example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://zevgzuhtemnjrqeolmit.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_check",
};
function run(changes = {}) {
  return spawnSync(process.execPath, [script], {
    env: { ...environment, ...changes }, encoding: "utf8",
  });
}
test("deploy aceita somente origem e Supabase independentes, sem segredos públicos", () => {
  assert.equal(run().status, 0);
  for (const changes of [
    { NEXT_PUBLIC_APP_URL: "" },
    { NEXT_PUBLIC_APP_URL: "http://next.example.com" },
    { NEXT_PUBLIC_APP_URL: "https://www.gevyro.com.br" },
    { NEXT_PUBLIC_APP_URL: "https://next.example.com/path" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_hidden" },
    { NEXT_PUBLIC_SERVICE_ROLE_KEY: "hidden-secret" },
    { NEXT_PUBLIC_API_URL: "http://localhost:8080" },
  ]) {
    const result = run(changes);
    assert.equal(result.status, 1);
    assert.ok(!result.stderr.includes("hidden-secret"));
    assert.ok(!result.stderr.includes("sb_secret_hidden"));
  }
});
