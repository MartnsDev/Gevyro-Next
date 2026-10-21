import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase/server";
import { AuthFlowError, readAuthenticatedProfile } from "@/server/auth/session";
import { isSameOriginMutation, applicationOrigin } from "@/server/auth/request-security";
import {
  accountSchemas,
  createAccount,
  resendConfirmation,
  sendRecovery,
  resetPassword,
} from "@/server/auth/account";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Origin",
};
const credentials = z
  .object({
    email: z.string().trim().email().max(254),
    senha: z.string().min(1).max(1024),
  })
  .strict();
type Context = { params: Promise<{ operation: string }> };
function failure(error: unknown) {
  if (error instanceof AuthFlowError)
    return NextResponse.json(
      { mensagem: error.message },
      { status: error.status, headers },
    );
  return NextResponse.json(
    {
      mensagem: "O serviço de autenticação está indisponível. Tente novamente.",
    },
    { status: 503, headers },
  );
}

export async function GET(_request: Request, context: Context) {
  const { operation } = await context.params;
  if (operation !== "session")
    return NextResponse.json(
      { mensagem: "Rota não encontrada" },
      { status: 404, headers },
    );
  try {
    return NextResponse.json(
      await readAuthenticatedProfile(await createAuthClient()),
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginMutation(request))
    return NextResponse.json(
      { mensagem: "Origem da requisição não permitida." },
      { status: 403, headers },
    );
  const { operation } = await context.params;
  if (
    !["login", "logout", "signup", "resend", "recover", "reset"].includes(
      operation,
    )
  )
    return NextResponse.json(
      { mensagem: "Rota não encontrada" },
      { status: 404, headers },
    );
  try {
    const client = await createAuthClient();
    if (operation === "logout") {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error && error.name !== "AuthSessionMissingError") throw error;
      return new NextResponse(null, { status: 204, headers });
    }
    if (Number(request.headers.get("content-length") ?? 0) > 8192) {
      return NextResponse.json(
        { mensagem: "Requisição muito grande." },
        { status: 413, headers },
      );
    }
    const body = await request.json().catch(() => null);
    const origin = applicationOrigin(request);
    if (operation in accountSchemas) {
      const schema = accountSchemas[operation as keyof typeof accountSchemas];
      const parsed = schema.safeParse(body);
      if (!parsed.success)
        return NextResponse.json(
          {
            mensagem:
              "Confira os campos informados. A senha precisa ter 8 a 128 caracteres, letras e números.",
          },
          { status: 400, headers },
        );
      if (operation === "signup") {
        await createAccount(client, accountSchemas.signup.parse(body), origin);
        return NextResponse.json(
          { mensagem: "Confira seu e-mail para confirmar a conta." },
          { status: 201, headers },
        );
      }
      if (operation === "resend")
        return NextResponse.json(
          {
            mensagem: await resendConfirmation(
              client,
              accountSchemas.resend.parse(body).email,
              origin,
            ),
          },
          { headers },
        );
      if (operation === "recover")
        await sendRecovery(
          client,
          accountSchemas.recover.parse(body).email,
          origin,
        );
      if (operation === "reset")
        await resetPassword(client, accountSchemas.reset.parse(body));
      return NextResponse.json(
        { mensagem: "Solicitação processada." },
        { headers },
      );
    }
    const parsed = credentials.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { mensagem: "Informe e-mail e senha válidos." },
        { status: 400, headers },
      );
    // Falha de nova autenticação nunca deve deixar a conta anterior ativa.
    const { error: previousSessionError } = await client.auth.signOut({
      scope: "local",
    });
    if (
      previousSessionError &&
      previousSessionError.name !== "AuthSessionMissingError"
    )
      throw previousSessionError;
    const { error } = await client.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.senha,
    });
    if (error) {
      const message =
        error.code === "email_not_confirmed"
          ? "Confirme seu e-mail antes de entrar."
          : error.status === 429
            ? "Muitas tentativas. Aguarde antes de tentar novamente."
            : "E-mail ou senha inválidos.";
      return NextResponse.json(
        { mensagem: message },
        { status: error.status === 429 ? 429 : 401, headers },
      );
    }
    try {
      return NextResponse.json(await readAuthenticatedProfile(client), {
        headers,
      });
    } catch (error) {
      await client.auth.signOut({ scope: "local" });
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
}
