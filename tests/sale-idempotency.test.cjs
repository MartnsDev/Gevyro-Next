const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ts = require("typescript");
const { webcrypto } = require("node:crypto");
function setup(transport) {
  const source = fs.readFileSync(
    path.join(__dirname, "../FrontEnd/lib/sale-idempotency.ts"),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  const storage = new Map();
  vm.runInNewContext(code, {
    exports,
    crypto: webcrypto,
    TextEncoder,
    Headers,
    Response,
    fetch: transport,
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
  });
  return exports.fetchIdempotentSale;
}
const options = {
  method: "POST",
  body: JSON.stringify({
    idCaixa: 1,
    itens: [{ idProduto: 1, quantidade: 1 }],
  }),
};
test("falha de rede conserva chave; confirmação gera nova chave para a próxima venda legítima", async () => {
  const keys = [];
  let first = true;
  const send = setup(async (_url, init) => {
    keys.push(init.headers.get("Idempotency-Key"));
    if (first) {
      first = false;
      throw new TypeError("Offline");
    }
    return Response.json({ id: 1 });
  });
  await assert.rejects(send("/api/v1/vendas/registrar", options));
  await send("/api/v1/vendas/registrar", options);
  await send("/api/v1/vendas/registrar", options);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});
test("requisições duplicadas em andamento compartilham um envio e retornam respostas legíveis", async () => {
  let calls = 0;
  let release;
  const send = setup(async () => {
    calls++;
    await new Promise((resolve) => {
      release = resolve;
    });
    return Response.json({ id: 1 });
  });
  const one = send("/api/v1/vendas/registrar", options);
  const two = send("/api/v1/vendas/registrar", options);
  for (let i = 0; i < 100 && !release; i++)
    await new Promise((resolve) => setTimeout(resolve, 2));
  assert.ok(release);
  await new Promise((resolve) => setTimeout(resolve, 10));
  release();
  const responses = await Promise.all([one, two]);
  assert.equal(calls, 1);
  assert.equal((await responses[0].json()).id, 1);
  assert.equal((await responses[1].json()).id, 1);
});
test("duas vendas offline distintas podem fornecer chaves diferentes mesmo com carrinhos idênticos", async () => {
  const keys = [];
  const send = setup(async (_url, init) => {
    keys.push(init.headers.get("Idempotency-Key"));
    return Response.json({ id: 1 });
  });
  const a = webcrypto.randomUUID(),
    b = webcrypto.randomUUID();
  await Promise.all([
    send("/api/v1/vendas/registrar", {
      ...options,
      headers: { "Idempotency-Key": a },
    }),
    send("/api/v1/vendas/registrar", {
      ...options,
      headers: { "Idempotency-Key": b },
    }),
  ]);
  assert.equal(keys.length, 2);
  assert.ok(keys.includes(a) && keys.includes(b));
});
