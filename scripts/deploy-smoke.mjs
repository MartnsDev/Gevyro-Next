import http from "node:http";
import https from "node:https";
const origin = new URL(process.argv[2] ?? "http://localhost:3000");
let failures = 0;
for (const [path, status] of [["/api/health", 200], ["/api/auth/session", 401], ["/api/v1/empresas", 401]]) {
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  if (response.status !== status || !response.headers.get("cache-control")?.includes("no-store")) {
    console.error(`FALHOU ${path}: status/cache`); failures++;
  } else console.log(`OK ${path}: ${status}, sem cache`);
}
const denied = await fetch(new URL("/api/auth/logout", origin), { method: "POST", headers: { origin: "https://untrusted.invalid" } });
if (denied.status !== 403) { console.error("FALHOU bloqueio de origem"); failures++; }
else console.log("OK origem externa bloqueada");
// Node fetch can normalize Host; send a raw HTTP request for this assertion.
const wrongHost = await new Promise((resolve, reject) => {
  const transport = origin.protocol === "https:" ? https : http;
  const request = transport.get(new URL("/api/health", origin), {
    headers: { host: "untrusted.invalid" }, timeout: 10000,
  }, response => { response.resume(); resolve(response.statusCode); });
  request.on("error", reject);
  request.on("timeout", () => request.destroy(new Error("Timeout")));
});
if (wrongHost !== 421) { console.error("FALHOU bloqueio de Host"); failures++; }
else console.log("OK Host externo bloqueado");
const page = await fetch(new URL("/auth/login", origin));
const csp = page.headers.get("content-security-policy") ?? "";
const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
const html = await page.text();
if (!nonce || !html.includes(`nonce="${nonce}"`) || /script-src[^;]*'unsafe-inline'/.test(csp)) {
  console.error("FALHOU CSP/nonce do HTML"); failures++;
} else console.log("OK CSP com nonce correspondente ao HTML");
if (page.headers.get("x-powered-by")) { console.error("FALHOU X-Powered-By"); failures++; }
process.exitCode = failures ? 1 : 0;
