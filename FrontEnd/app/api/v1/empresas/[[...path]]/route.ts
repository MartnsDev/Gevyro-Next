import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase/server";
import { readAuthenticatedProfile, AuthFlowError } from "@/server/auth/session";
import { isSameOriginMutation } from "@/server/auth/request-security";
import {
  companyResponse,
  saveCompany,
  deleteCompany,
  databaseError,
} from "@/server/company/service";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ path?: string[] }> };
const columns =
  "id,nome_fantasia,cnpj,razao_social,cep,logradouro,numero,bairro,cidade,uf,telefone,ativa";
async function handle(request: Request, context: Context) {
  if (request.method !== "GET" && !isSameOriginMutation(request))
    return NextResponse.json(
      { mensagem: "Origem não permitida." },
      { status: 403, headers },
    );
  try {
    const client = await createAuthClient();
    const profile = await readAuthenticatedProfile(client);
    if (profile.statusAcesso !== "ATIVO")
      throw new AuthFlowError("PLANO_INATIVO", 403);
    const paths = (await context.params).path ?? [];
    const id =
      paths[0] === undefined
        ? null
        : z.coerce
            .number()
            .int()
            .positive()
            .max(Number.MAX_SAFE_INTEGER)
            .parse(paths[0]);
    if (request.method === "GET" && paths.length <= 1) {
      if (id) {
        const { data, error } = await client
          .from("empresas")
          .select(columns)
          .eq("id", id)
          .single();
        if (error?.code === "PGRST116")
          throw new AuthFlowError("Empresa não encontrada", 404);
        if (error) databaseError(error);
        return NextResponse.json(companyResponse(data, profile.tipoPlano), {
          headers,
        });
      }
      // Limite máximo do plano é 99999; paginação mantida por range com parâmetros explícitos.
      const url = new URL(request.url);
      const page = z.coerce
        .number()
        .int()
        .min(0)
        .parse(url.searchParams.get("page") ?? 0);
      const size = z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .parse(url.searchParams.get("size") ?? 1000);
      const { data, error } = await client
        .from("empresas")
        .select(columns)
        .order("id")
        .range(page * size, page * size + size - 1);
      if (error) databaseError(error);
      return NextResponse.json(
        data.map((row) => companyResponse(row, profile.tipoPlano)),
        { headers },
      );
    }
    const body = await request.json().catch(() => null);
    if (
      (request.method === "POST" && !id) ||
      (request.method === "PUT" && id && paths.length === 1)
    ) {
      if (profile.statusAcesso !== "ATIVO")
        throw new AuthFlowError("PLANO_INATIVO", 403);
      const row = await saveCompany(client, id, body);
      return NextResponse.json(companyResponse(row, profile.tipoPlano), {
        status: id ? 200 : 201,
        headers,
      });
    }
    if (
      request.method === "DELETE" &&
      id &&
      paths.length === 2 &&
      ["confirmar-exclusao", "exclusao-permanente"].includes(paths[1]!)
    ) {
      const { senha } = z
        .object({ senha: z.string().min(1).max(128) })
        .strict()
        .parse(body);
      await deleteCompany(
        client,
        id,
        senha,
        paths[1] === "exclusao-permanente",
      );
      return new NextResponse(null, { status: 204, headers });
    }
    throw new AuthFlowError("Rota não encontrada", 404);
  } catch (error) {
    const status =
      error instanceof AuthFlowError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 503;
    return NextResponse.json(
      {
        mensagem:
          error instanceof AuthFlowError
            ? error.message
            : status === 400
              ? "Confira os campos informados."
              : "Não foi possível concluir a operação.",
      },
      { status, headers },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
