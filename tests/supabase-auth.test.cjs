const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { createRequire } = require("node:module");
const frontendRequire = createRequire(
  path.join(__dirname, "../FrontEnd/package.json"),
);
function load(file, deps = {}, env = {}) {
  const source = fs.readFileSync(
    path.join(__dirname, "../FrontEnd/", file),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    Request,
    Response,
    Date,
    Intl,
    URL,
    process: { env },
    require(name) {
      return deps[name] ?? frontendRequire(name);
    },
  });
  return exports;
}
const security = load("server/auth/request-security.ts");
const service = load("server/auth/session.ts");
const account = load("server/auth/account.ts", { "./session": service });
const photos = load("server/auth/photos.ts", { "./session": service });
test("produção usa origem configurada atrás de proxy e recusa origem interna", () => {
  const secure = load("server/auth/request-security.ts", {}, {
    NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://next.example.com",
  });
  const request = new Request("http://127.0.0.1:3000/api/auth/login", {
    method: "POST", headers: { origin: "https://next.example.com" },
  });
  assert.equal(secure.applicationOrigin(request), "https://next.example.com");
  assert.equal(secure.isSameOriginMutation(request), true);
  assert.equal(secure.isSameOriginMutation(new Request(request, {
    headers: { origin: "http://127.0.0.1:3000" },
  })), false);
  const missing = load("server/auth/request-security.ts", {}, { NODE_ENV: "production" });
  assert.throws(() => missing.applicationOrigin(request), /APP_ORIGIN_NOT_CONFIGURED/);
});
const now = new Date("2026-10-21T12:00:00Z");
function fixture({
  missingUser = false,
  missingProfile = false,
  loginError = null,
  profile = {},
} = {}) {
  let signouts = 0,
    signins = 0,
    queries = 0;
  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: missingUser
            ? null
            : {
                id: "verified-uuid",
                email: "test@example.invalid",
                email_confirmed_at: "2026-10-20T12:00:00Z",
                user_metadata: { tipo_plano: "PREMIUM" },
              },
        },
        error: null,
      }),
      signOut: async () => {
        signouts++;
        return { error: null };
      },
      signInWithPassword: async () => {
        signins++;
        return { error: loginError };
      },
    },
    from(table) {
      assert.equal(table, "usuarios");
      queries++;
      return {
        select() {
          return this;
        },
        eq(key, id) {
          assert.equal(key, "auth_user_id");
          assert.equal(id, "verified-uuid");
          return this;
        },
        single: async () => ({
          error: missingProfile ? {} : null,
          data: missingProfile
            ? null
            : {
                id: 7,
                nome: "Pessoa",
                tipo_plano: "EXPERIMENTAL",
                status_acesso: "ATIVO",
                data_primeiro_login: "2026-10-20T12:00:00Z",
                ...profile,
              },
        }),
      };
    },
  };
  return { client, stats: () => ({ signouts, signins, queries }) };
}
function routes(context) {
  class NextResponse extends Response {
    static json(value, init) {
      return new NextResponse(JSON.stringify(value), init);
    }
  }
  return load("app/api/auth/[operation]/route.ts", {
    "next/server": { NextResponse },
    "@/lib/supabase/server": { createAuthClient: async () => context.client },
    "@/server/auth/session": service,
    "@/server/auth/request-security": security,
    "@/server/auth/account": account,
  });
}
function request(
  origin = "http://localhost:3000",
  body = { email: "test@example.invalid", senha: "password" },
) {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = (operation) => ({ params: Promise.resolve({ operation }) });

test("mutações recusam ausência de Origin, subdomínio e origem externa", async () => {
  const context = fixture();
  const route = routes(context);
  for (const origin of [
    "",
    "https://attacker.invalid",
    "http://sub.localhost:3000",
  ]) {
    assert.equal(
      (await route.POST(request(origin), params("login"))).status,
      403,
    );
  }
  assert.equal(context.stats().signins, 0);
});
test("sessão precisa de identidade verificada; plano vem do perfil, nunca metadata", async () => {
  const context = fixture();
  const profile = await service.readAuthenticatedProfile(context.client, now);
  assert.equal(profile.tipoPlano, "EXPERIMENTAL");
  assert.equal(profile.id, 7);
  assert.equal(profile.statusAcesso, "ATIVO");
  const absent = fixture({ missingUser: true });
  await assert.rejects(
    service.readAuthenticatedProfile(absent.client, now),
    (e) => e.status === 401,
  );
  assert.equal(absent.stats().queries, 0);
});
test("trial expira após 30 dias; plano pago sem vencimento não libera acesso", async () => {
  const expired = fixture({
    profile: { data_primeiro_login: "2026-09-01T00:00:00Z" },
  });
  assert.equal(
    (await service.readAuthenticatedProfile(expired.client, now)).statusAcesso,
    "INATIVO",
  );
  const paid = fixture({ profile: { tipo_plano: "PRO" } });
  assert.equal(
    (await service.readAuthenticatedProfile(paid.client, now)).statusAcesso,
    "INATIVO",
  );
});
test("logout sem sessão não usa CSRF ou API Java; resposta não pode ser cacheada", async () => {
  const context = fixture();
  const result = await routes(context).POST(request(), params("logout"));
  assert.equal(result.status, 204);
  assert.match(result.headers.get("cache-control"), /no-store/);
  assert.equal(context.stats().queries, 0);
});
test("login não aceita identidade/plano no corpo e invalida sessão anterior antes de autenticar", async () => {
  const context = fixture({
    loginError: { code: "invalid_credentials", status: 400 },
  });
  const route = routes(context);
  assert.equal(
    (
      await route.POST(
        request(undefined, {
          email: "test@example.invalid",
          senha: "password",
          tipoPlano: "PREMIUM",
        }),
        params("login"),
      )
    ).status,
    400,
  );
  const result = await route.POST(request(), params("login"));
  assert.equal(result.status, 401);
  assert.equal(context.stats().signouts, 1);
  assert.equal(context.stats().signins, 1);
});
test("perfil ausente falha explicitamente e encerra sessão recém-criada", async () => {
  const context = fixture({ missingProfile: true });
  const result = await routes(context).POST(request(), params("login"));
  assert.equal(result.status, 503);
  assert.match((await result.json()).mensagem, /preparar sua conta/);
  assert.equal(context.stats().signouts, 2);
});

test("login retorna o contrato de usuário existente sem credenciais de sessão", async () => {
  const context = fixture();
  const result = await routes(context).POST(request(), params("login"));
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.id, 7);
  assert.equal(body.email, "test@example.invalid");
  assert.equal(body.tipoPlano, "EXPERIMENTAL");
  assert.ok(!("access_token" in body) && !("refresh_token" in body));
});

test("e-mail não confirmado não consulta perfil nem libera sessão de domínio", async () => {
  const context = fixture();
  context.client.auth.getUser = async () => ({
    data: { user: { id: "verified-uuid", email: "test@example.invalid" } },
    error: null,
  });
  await assert.rejects(
    service.readAuthenticatedProfile(context.client, now),
    (e) => e.status === 403,
  );
  assert.equal(context.stats().queries, 0);
});

test("cadastro valida senha no servidor e nunca aceita plano, identidade ou privilégios do navegador", async () => {
  for (const senha of ["short1", "abcdefgh", "12345678"])
    assert.equal(
      account.accountSchemas.signup.safeParse({
        nome: "Pessoa",
        email: "test@example.invalid",
        senha,
      }).success,
      false,
    );
  assert.equal(
    account.accountSchemas.signup.safeParse({
      nome: "Pessoa",
      email: "test@example.invalid",
      senha: "Password1",
      tipoPlano: "PREMIUM",
    }).success,
    false,
  );
  const calls = [];
  const client = {
    auth: {
      signOut: async () => ({ error: null }),
      signUp: async (data) => {
        calls.push(data);
        return { data: { session: null }, error: null };
      },
    },
  };
  await account.createAccount(
    client,
    { nome: "Pessoa", email: "test@example.invalid", senha: "Password1" },
    "http://localhost:3000",
  );
  assert.equal(calls[0].options.data.nome, "Pessoa");
  assert.deepEqual(Object.keys(calls[0].options.data), ["nome"]);
  assert.equal(
    calls[0].options.emailRedirectTo,
    "http://localhost:3000/api/auth/confirm",
  );
});

test("recuperação verifica OTP antes de alterar senha e encerra a sessão de recuperação", async () => {
  const calls = [];
  const client = {
    auth: {
      verifyOtp: async () => {
        calls.push("verify");
        return { error: null };
      },
      updateUser: async () => {
        calls.push("update");
        return { error: null };
      },
      signOut: async () => {
        calls.push("logout");
        return { error: null };
      },
    },
  };
  await account.resetPassword(client, {
    email: "test@example.invalid",
    codigo: "123456",
    novaSenha: "Password1",
  });
  assert.deepEqual(calls, ["verify", "update", "logout"]);
  calls.length = 0;
  client.auth.verifyOtp = async () => ({ error: { status: 400 } });
  await assert.rejects(
    account.resetPassword(client, {
      email: "test@example.invalid",
      codigo: "000000",
      novaSenha: "Password1",
    }),
  );
  assert.deepEqual(calls, []);
});

test("resend não revela se uma conta existe e respeita rate limiting do provedor", async () => {
  const client = {
    auth: {
      resend: async () => ({ error: { status: 400, code: "user_not_found" } }),
    },
  };
  assert.match(
    await account.resendConfirmation(
      client,
      "missing@example.invalid",
      "http://localhost:3000",
    ),
    /Se houver/,
  );
  client.auth.resend = async () => ({ error: { status: 429 } });
  await assert.rejects(
    account.resendConfirmation(
      client,
      "missing@example.invalid",
      "http://localhost:3000",
    ),
    (e) => e.status === 429,
  );
});

test("foto rejeita HTML/SVG independentemente da extensão enviada", () => {
  assert.throws(() =>
    photos.imageType(new TextEncoder().encode('<svg onload="alert(1)"></svg>')),
  );
  assert.equal(
    photos.imageType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])).mime,
    "image/png",
  );
});
