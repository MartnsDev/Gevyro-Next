import type { SupabaseClient } from "@supabase/supabase-js";

export class AuthFlowError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** Autenticação verificada + dados de domínio sob RLS. Não usa plano de user_metadata. */
export async function readAuthenticatedProfile(
  client: SupabaseClient,
  now = new Date(),
) {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new AuthFlowError("NAO_AUTENTICADO", 401);
  if (!user.email || !user.email_confirmed_at)
    throw new AuthFlowError("Confirme seu e-mail antes de entrar.", 403);
  const { data: profile, error: profileError } = await client
    .from("usuarios")
    .select(
      "id,nome,foto_google,foto_upload,tipo_plano,status_acesso,data_primeiro_login,data_vencimento",
    )
    .eq("auth_user_id", user.id)
    .single();
  if (profileError || !profile) {
    console.error("profile_read_failed", {
      code: profileError?.code ?? "EMPTY_PROFILE",
    });
    throw new AuthFlowError(
      "Não foi possível preparar sua conta agora. Tente novamente em instantes.",
      503,
    );
  }
  const id = Number(profile.id);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new AuthFlowError("Identificador de perfil inválido.", 503);
  const plans = ["EXPERIMENTAL", "BASICO", "PRO", "PREMIUM"];
  if (!plans.includes(profile.tipo_plano))
    throw new AuthFlowError("Plano de conta inválido.", 503);
  const trialStart = Date.parse(profile.data_primeiro_login ?? "");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const trialExpiry = trialStart + 30 * 24 * 60 * 60 * 1000;
  const expired =
    profile.tipo_plano === "EXPERIMENTAL"
      ? !Number.isFinite(trialStart) || now.getTime() > trialExpiry
      : !profile.data_vencimento || profile.data_vencimento < today;
  return {
    id,
    nome: profile.nome,
    email: user.email ?? "",
    foto: profile.foto_google ?? undefined,
    fotoUpload: profile.foto_upload
      ? `/api/auth/photo?v=${encodeURIComponent(profile.foto_upload.split("/").pop() ?? "")}`
      : undefined,
    tipoPlano: profile.tipo_plano,
    statusAcesso:
      profile.status_acesso === "ATIVO" && !expired ? "ATIVO" : "INATIVO",
    expiracaoPlano:
      profile.tipo_plano === "EXPERIMENTAL"
        ? Number.isFinite(trialStart)
          ? new Date(trialExpiry).toISOString()
          : undefined
        : (profile.data_vencimento ?? undefined),
  };
}
