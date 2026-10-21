import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AuthFlowError } from "@/server/auth/session";
export const companyInput = z
  .object({
    nomeFantasia: z.string().trim().min(2).max(120),
    cnpj: z.string().max(18).nullable().optional(),
    ativo: z.boolean().optional(),
  })
  .strict();
export function normalizeDocument(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  const d = value.replace(/\D/g, "");
  if (![11, 14].includes(d.length) || /^(\d)\1+$/.test(d))
    throw new AuthFlowError("CPF/CNPJ inválido", 400);
  for (let stage = 0; stage < 2; stage++) {
    let sum = 0;
    let digit: number;
    if (d.length === 11) {
      for (let i = 0; i < 9 + stage; i++)
        sum += Number(d[i]) * (10 + stage - i);
      digit = (sum * 10) % 11;
      if (digit === 10) digit = 0;
      if (digit !== Number(d[9 + stage]))
        throw new AuthFlowError("CPF inválido", 400);
    } else {
      let weight = 5 + stage;
      for (let i = 0; i < 12 + stage; i++) {
        sum += Number(d[i]) * weight;
        weight--;
        if (weight === 1) weight = 9;
      }
      digit = sum % 11;
      digit = digit < 2 ? 0 : 11 - digit;
      if (digit !== Number(d[12 + stage]))
        throw new AuthFlowError("CNPJ inválido", 400);
    }
  }
  return d;
}
export function databaseError(error: {
  code?: string;
  message: string;
}): never {
  if (error.code?.startsWith("PT"))
    throw new AuthFlowError(error.message, Number(error.code.slice(2)));
  if (error.code === "23505")
    throw new AuthFlowError(
      "Este CPF/CNPJ já está vinculado a outra empresa.",
      409,
    );
  if (error.code === "23503")
    throw new AuthFlowError(
      "Há registros vinculados que impedem esta exclusão.",
      409,
    );
  if (["23514", "22001", "22P02", "22003"].includes(error.code ?? ""))
    throw new AuthFlowError("Confira os valores informados.", 400);
  console.error("database_operation_failed", { code: error.code ?? "UNKNOWN" });
  throw new AuthFlowError(
    "O serviço de dados está indisponível. Tente novamente em instantes.",
    503,
  );
}
export function companyResponse(row: Record<string, any>, plan: string) {
  return {
    id: row.id,
    nomeFantasia: row.nome_fantasia,
    cnpj: row.cnpj?.length === 14 ? row.cnpj : null,
    cpf: row.cnpj?.length === 11 ? row.cnpj : null,
    razaoSocial: row.razao_social,
    cep: row.cep,
    logradouro: row.logradouro,
    numero: row.numero,
    bairro: row.bairro,
    cidade: row.cidade,
    uf: row.uf,
    telefone: row.telefone,
    planoNome: plan,
    limiteCaixas: plan === "PRO" ? 5 : plan === "PREMIUM" ? 99999 : 1,
    ativo: row.ativa,
  };
}
async function registrationData(
  document: string | null | undefined,
): Promise<Record<string, unknown>> {
  const digits = document?.replace(/\D/g, "");
  if (!digits || digits.length !== 14) return {};
  const sources = [
    `https://receitaws.com.br/v1/cnpj/${digits}`,
    `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
    `https://publica.cnpj.ws/cnpj/${digits}`,
    `https://api.opencnpj.org/${digits}`,
    `https://api.cnpja.com/office/${digits}?strategy=CACHE`,
  ];
  for (const url of sources)
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (data.status === "ERROR") continue;
      if (data.estabelecimento) {
        const e = data.estabelecimento;
        return {
          razao_social: data.razao_social,
          cep: e.cep,
          logradouro: e.logradouro,
          numero: e.numero,
          bairro: e.bairro,
          cidade: e.cidade?.nome,
          uf: e.estado?.sigla,
          telefone: String(e.telefones?.[0]?.numero ?? "").replace(/\D/g, ""),
        };
      }
      if (data.address) {
        const a = data.address;
        const phone = data.phones?.[0];
        return {
          razao_social: data.company?.name,
          cep: a.zip,
          logradouro: a.street,
          numero: a.number,
          bairro: a.district,
          cidade: a.city?.name,
          uf: a.state,
          telefone: phone
            ? `${phone.area ?? ""}${phone.number ?? ""}`.replace(/\D/g, "")
            : "",
        };
      }
      return {
        razao_social: data.razao_social ?? data.nome,
        cep: data.cep,
        logradouro: data.logradouro,
        numero: data.numero,
        bairro: data.bairro,
        cidade: data.municipio ?? data.cidade,
        uf: data.uf,
        telefone: String(data.ddd_telefone_1 ?? data.telefone ?? "").replace(
          /\D/g,
          "",
        ),
      };
    } catch {
      /* Cadastro mantém funcionamento sem o enriquecimento externo. */
    }
  return {};
}
export async function saveCompany(
  client: SupabaseClient,
  id: number | null,
  body: unknown,
) {
  const input = companyInput.parse(body);
  normalizeDocument(input.cnpj);
  let changed = true;
  if (id) {
    const { data, error } = await client
      .from("empresas")
      .select("cnpj")
      .eq("id", id)
      .single();
    if (error) databaseError(error);
    changed = (input.cnpj?.replace(/\D/g, "") || null) !== data?.cnpj;
  }
  const enrichment = changed ? await registrationData(input.cnpj) : {};
  const { data, error } = await client.rpc("company_write", {
    p_id: id,
    p_nome: input.nomeFantasia,
    p_documento: input.cnpj ?? null,
    p_ativo: input.ativo ?? null,
    p_dados: enrichment,
  });
  if (error) databaseError(error);
  return data;
}
export async function deleteCompany(
  client: SupabaseClient,
  id: number,
  password: string,
  permanent: boolean,
) {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user?.email) throw new AuthFlowError("NAO_AUTENTICADO", 401);
  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  try {
    const { data, error: loginError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (loginError || data.user?.id !== user.id)
      throw new AuthFlowError("Senha incorreta.", 401);
    const { error: deleteError } = await verifier.rpc("company_delete", {
      p_id: id,
      p_permanente: permanent,
    });
    if (deleteError) databaseError(deleteError);
  } finally {
    await verifier.auth.signOut({ scope: "local" });
  }
}
