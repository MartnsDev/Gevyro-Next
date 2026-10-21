import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AuthFlowError } from "./session";

export const emailInput = z.string().trim().toLowerCase().email().max(254);
export const passwordInput = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Za-z]/)
  .regex(/\d/);
export const accountSchemas = {
  signup: z
    .object({
      nome: z.string().trim().min(1).max(255),
      email: emailInput,
      senha: passwordInput,
    })
    .strict(),
  resend: z.object({ email: emailInput }).strict(),
  recover: z.object({ email: emailInput }).strict(),
  reset: z
    .object({
      email: emailInput,
      codigo: z.string().regex(/^\d{6}$/),
      novaSenha: passwordInput,
    })
    .strict(),
};
function providerFailure(
  error: { status?: number; code?: string } | null,
  fallback: string,
): void {
  if (!error) return;
  if (error.status === 429)
    throw new AuthFlowError(
      "Muitas tentativas. Aguarde antes de tentar novamente.",
      429,
    );
  throw new AuthFlowError(fallback, 400);
}
export async function createAccount(
  client: SupabaseClient,
  input: z.infer<typeof accountSchemas.signup>,
  origin: string,
) {
  const { error: signoutError } = await client.auth.signOut({ scope: "local" });
  if (signoutError && signoutError.name !== "AuthSessionMissingError")
    throw new AuthFlowError(
      "Não foi possível preparar uma nova conta com segurança.",
      503,
    );
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.senha,
    options: {
      data: { nome: input.nome },
      emailRedirectTo: `${origin}/api/auth/confirm`,
    },
  });
  providerFailure(
    error,
    "Não foi possível cadastrar a conta. Confira os dados e tente novamente.",
  );
  // O cadastro sempre termina na confirmação de e-mail, sem sessão automática.
  if (data.session) await client.auth.signOut({ scope: "local" });
}
export async function resendConfirmation(
  client: SupabaseClient,
  email: string,
  origin: string,
) {
  const { error } = await client.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${origin}/api/auth/confirm` },
  });
  if (error?.status === 429)
    providerFailure(error, "Aguarde para solicitar outro e-mail.");
  if (error && (!error.status || error.status >= 500))
    throw new AuthFlowError("O envio de e-mail está indisponível. Tente novamente em instantes.",503);
  // Não confirma existência nem estado de outra conta.
  return "Se houver uma conta pendente, enviaremos um novo link.";
}
export async function sendRecovery(
  client: SupabaseClient,
  email: string,
  origin: string,
) {
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/esqueceu-senha`,
  });
  if (error?.status === 429)
    providerFailure(error, "Aguarde para solicitar outro código.");
  if (error && (!error.status || error.status >= 500))
    throw new AuthFlowError("O envio de e-mail está indisponível. Tente novamente em instantes.",503);
}
export async function resetPassword(
  client: SupabaseClient,
  input: z.infer<typeof accountSchemas.reset>,
) {
  const { error: verified } = await client.auth.verifyOtp({
    email: input.email,
    token: input.codigo,
    type: "recovery",
  });
  providerFailure(verified, "Código inválido ou expirado.");
  try {
    const { error } = await client.auth.updateUser({
      password: input.novaSenha,
    });
    providerFailure(error, "Não foi possível atualizar a senha.");
  } finally {
    // O token de recuperação nunca deve manter uma sessão normal aberta.
    await client.auth.signOut({ scope: "global" });
  }
}
