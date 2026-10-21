import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase/server";
import { readAuthenticatedProfile, AuthFlowError } from "@/server/auth/session";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { databaseError } from "@/server/company/service";
import {
  idInput,
  productInput,
  customerInput,
  productColumns,
  customerColumns,
  productResponse,
  customerResponse,
} from "@/server/catalog/service";
import { financeHandler } from "@/server/finance/handler";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ resource: string; path?: string[] }> };
async function handle(request: Request, context: Context) {
  if (request.method !== "GET" && !isSameOriginMutation(request))
    return NextResponse.json(
      { mensagem: "Origem não permitida." },
      { status: 403, headers },
    );
  try {
    const { resource, path = [] } = await context.params;
    const product = resource === "produtos";
    if (resource === "caixas" || resource === "vendas")
      return financeHandler(request, resource, path);
    if (!product && resource !== "clientes")
      throw new AuthFlowError("Rota não encontrada", 404);
    if (
      path.length > 1 &&
      !(
        resource === "clientes" &&
        request.method === "DELETE" &&
        path[0] === "desativar" &&
        path.length === 2
      )
    )
      throw new AuthFlowError("Rota não encontrada", 404);
    if (
      request.method === "POST" &&
      path.length &&
      !(resource === "clientes" && path[0] === "criar")
    )
      throw new AuthFlowError("Rota não encontrada", 404);
    const client = await createAuthClient();
    const profile = await readAuthenticatedProfile(client);
    if (profile.statusAcesso !== "ATIVO")
      throw new AuthFlowError("PLANO_INATIVO", 403);
    const table = product ? "produto" : "clientes",
      columns = product ? productColumns : customerColumns;
    const format = product ? productResponse : customerResponse;
    const url = new URL(request.url);
    const company = url.searchParams.has("empresaId")
      ? idInput.parse(url.searchParams.get("empresaId"))
      : null;
    const barcode = product && path[0] === "por-codigo-barras";
    const legacyList = !product && path[0] === "listar";
    const legacyCreate = !product && path[0] === "criar";
    const rawId = !product && path[0] === "desativar" ? path[1] : path[0];
    const id =
      rawId && !barcode && !legacyList && !legacyCreate
        ? idInput.parse(rawId)
        : null;
    if (company) {
      const { data, error } = await client
        .from("empresas")
        .select("id,ativa")
        .eq("id", company)
        .single();
      if (error || !data)
        throw new AuthFlowError("Empresa não encontrada", 404);
      if (product && !data.ativa)
        throw new AuthFlowError("Esta empresa está arquivada", 409);
    }
    if (request.method === "GET") {
      let query = client.from(table).select(columns as string);
      if (id) query = query.eq("id", id);
      else if (company) query = query.eq("empresa_id", company);
      if (barcode) {
        const code = z
          .string()
          .trim()
          .min(1)
          .max(60)
          .parse(url.searchParams.get("codigoBarras"));
        if (!company) throw new AuthFlowError("Empresa é obrigatória", 400);
        query = query.eq("codigo_barras", code);
      }
      if (id || barcode) {
        const { data, error } = await query
          .single()
          .overrideTypes<Record<string, any>, { merge: false }>();
        if (error?.code === "PGRST116")
          throw new AuthFlowError("Registro não encontrado", 404);
        if (error) databaseError(error);
        if (product) {
          const { data: enterprise } = await client
            .from("empresas")
            .select("ativa")
            .eq("id", data.empresa_id)
            .single();
          if (!enterprise?.ativa)
            throw new AuthFlowError("Esta empresa está arquivada", 409);
          if (barcode && !data.ativo)
            throw new AuthFlowError(
              "O código pertence a um produto inativo",
              409,
            );
        }
        return NextResponse.json(format(data), { headers });
      }
      if (!product) {
        query = query.eq("ativo", true);
        if (company && url.searchParams.has("tipo"))
          query = query.eq(
            "tipo",
            z
              .enum(["CLIENTE", "FORNECEDOR"])
              .parse(url.searchParams.get("tipo")?.toUpperCase()),
          );
      }
      if (url.searchParams.get("busca"))
        query = query.ilike(
          "nome",
          `%${url.searchParams.get("busca")!.replace(/[%_\\]/g, "\\$&")}%`,
        );
      const page = z.coerce
        .number()
        .int()
        .min(0)
        .parse(url.searchParams.get("page") ?? 0);
      const size = z.coerce
        .number()
        .int()
        .min(1)
        .max(500)
        .parse(url.searchParams.get("size") ?? 500);
      const { data, error } = await query
        .order("id")
        .range(page * size, page * size + size - 1)
        .overrideTypes<Record<string, any>[], { merge: false }>();
      if (error) databaseError(error);
      return NextResponse.json(data.map(format), { headers });
    }
    if (!["POST", "PUT", "DELETE"].includes(request.method))
      throw new AuthFlowError("Método não permitido", 405);
    if (request.method === "DELETE" && !id)
      throw new AuthFlowError("Informe o registro", 400);
    if (request.method === "PUT" && !id)
      throw new AuthFlowError("Informe o registro", 400);
    if (request.method === "POST" && id)
      throw new AuthFlowError("Rota não encontrada", 404);
    const body =
      request.method === "DELETE"
        ? {}
        : (product ? productInput : customerInput).parse(
            await request.json().catch(() => null),
          );
    const { data, error } = await client.rpc(
      product ? "product_write" : "customer_write",
      { p_id: id, p_body: body, p_delete: request.method === "DELETE" },
    );
    if (error) {
      if (error.code === "23505")
        throw new AuthFlowError(
          product
            ? "Código de barras já utilizado nesta empresa."
            : "E-mail já cadastrado para este tipo nesta empresa.",
          409,
        );
      if (["23514", "22001", "22P02"].includes(error.code))
        throw new AuthFlowError("Confira os valores informados.", 400);
      databaseError(error);
    }
    return request.method === "DELETE"
      ? new NextResponse(null, { status: 204, headers })
      : NextResponse.json(format(data), {
          status: request.method === "POST" ? 201 : 200,
          headers,
        });
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
export const PATCH = handle;
