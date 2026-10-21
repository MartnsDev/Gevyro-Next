import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase/server";
import { readAuthenticatedProfile, AuthFlowError } from "@/server/auth/session";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { databaseError } from "@/server/company/service";
import { idInput } from "@/server/catalog/service";
const headers = { "Cache-Control": "private, no-store" };
const methods = [
  "DINHEIRO",
  "PIX",
  "CARTAO_DEBITO",
  "CARTAO_CREDITO",
  "BOLETO",
  "TRANSFERENCIA",
  "OUTRO",
] as const;
const amount = z
  .union([z.string(), z.number().finite()])
  .transform(String)
  .refine((v) => /^\d{1,14}(?:\.\d{1,2})?$/.test(v));
const cashAmount = z
  .union([z.string(), z.number().finite()])
  .transform(String)
  .refine((v) => /^-?\d{1,14}(?:\.\d{1,4})?$/.test(v));
const saleInput = z
  .object({
    idCaixa: idInput,
    idCliente: idInput.nullish(),
    itens: z
      .array(
        z
          .object({
            idProduto: idInput,
            quantidade: z.number().int().min(1).max(2147483647),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
    formaPagamento: z.enum(methods),
    formaPagamento2: z.enum(methods).nullish(),
    valorPagamento2: amount.nullish(),
    valorRecebido: amount.nullish(),
    desconto: amount.nullish(),
    observacao: z.string().max(500).nullish(),
  })
  .strict();
const cashColumns =
  "id,empresa_id,usuario_id,valor_inicial,valor_final,total_vendas,data_abertura,data_fechamento,status,aberto";
function cashResponse(c: Record<string, any>) {
  return {
    id: c.id,
    empresaId: c.empresa_id,
    usuarioId: c.usuario_id,
    valorInicial: c.valor_inicial,
    valorFinal: c.valor_final,
    totalVendas: c.total_vendas,
    dataAbertura: c.data_abertura,
    dataFechamento: c.data_fechamento,
    status: c.status,
    aberto: c.aberto,
  };
}
export async function financeHandler(
  request: Request,
  resource: string,
  path: string[],
) {
  if (request.method !== "GET" && !isSameOriginMutation(request))
    return NextResponse.json(
      { mensagem: "Origem não permitida." },
      { status: 403, headers },
    );
  try {
    const client = await createAuthClient();
    const user = await readAuthenticatedProfile(client);
    if (user.statusAcesso !== "ATIVO")
      throw new AuthFlowError("PLANO_INATIVO", 403);
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
      .parse(url.searchParams.get("size") ?? 500);
    if (resource === "caixas") {
      if (request.method === "GET") {
        const open = path.length === 1 && path[0] === "aberto";
        const history = path.length === 2 && path[0] === "empresa";
        const summary = path.length === 2 && path[1] === "resumo";
        if (!open && !history && !summary)
          throw new AuthFlowError("Rota não encontrada", 404);
        let query = client.from("caixas").select(cashColumns);
        if (open || history) {
          const company = idInput.parse(
            open ? url.searchParams.get("empresaId") : path[1],
          );
          const { data: enterprise } = await client
            .from("empresas")
            .select("id")
            .eq("id", company)
            .single();
          if (!enterprise)
            throw new AuthFlowError("Empresa não encontrada", 404);
          query = query.eq("empresa_id", company);
        } else query = query.eq("id", idInput.parse(path[0]));
        if (open) query = query.eq("aberto", true);
        if (history) {
          const { data, error } = await query
            .order("id", { ascending: false })
            .range(page * size, page * size + size - 1);
          if (error) databaseError(error);
          return NextResponse.json(data.map(cashResponse), { headers });
        }
        const { data, error } = await query.maybeSingle();
        if (error) databaseError(error);
        if (!data && !open)
          throw new AuthFlowError("Caixa não encontrado", 404);
        return NextResponse.json(data ? cashResponse(data) : null, { headers });
      }
      if (
        request.method === "POST" &&
        path.length === 1 &&
        ["abrir", "fechar"].includes(path[0]!)
      ) {
        const body = await request.json().catch(() => null);
        let input;
        let id = null;
        if (path[0] === "abrir")
          input = z
            .object({
              empresaId: idInput,
              saldoInicial: cashAmount.refine((v) => !v.startsWith("-")),
              terminalId: z.string().max(255).nullish(),
            })
            .strict()
            .parse(body);
        else {
          const closed = z
            .object({
              caixaId: idInput,
              saldoFinal: cashAmount,
              observacao: z.string().max(500).nullish(),
            })
            .strict()
            .parse(body);
          id = closed.caixaId;
          input = closed;
        }
        const { data, error } = await client.rpc("cash_write", {
          p_id: id,
          p_body: input,
        });
        if (error) databaseError(error);
        return NextResponse.json(cashResponse(data), {
          status: id ? 200 : 201,
          headers,
        });
      }
    } else if (resource === "vendas") {
      if (request.method === "GET") {
        if (path.length === 2 && path[0] === "caixa") {
          const { data, error } = await client.rpc("sale_list", {
            p_caixa: idInput.parse(path[1]),
            p_offset: page * size,
            p_limit: size,
          });
          if (error) databaseError(error);
          return NextResponse.json(data, { headers });
        }
        if (path.length === 1) {
          const { data, error } = await client.rpc("sale_read", {
            p_id: idInput.parse(path[0]),
          });
          if (error) databaseError(error);
          return NextResponse.json(data, { headers });
        }
      }
      if (
        request.method === "POST" &&
        path.length === 1 &&
        path[0] === "registrar"
      ) {
        const body = saleInput.parse(await request.json().catch(() => null));
        const key = z
          .string()
          .uuid()
          .parse(request.headers.get("Idempotency-Key"));
        const { data, error } = await client.rpc("sale_register", {
          p_body: body,
          p_key: key,
        });
        if (error) databaseError(error);
        return NextResponse.json(data, { status: 201, headers });
      }
      if (
        path.length === 2 &&
        ((request.method === "POST" && path[1] === "cancelar") ||
          (request.method === "PATCH" && path[1] === "observacao"))
      ) {
        const body = await request.json().catch(() => ({}));
        const cancel = path[1] === "cancelar";
        const text = cancel
          ? (z
              .object({ motivo: z.string().max(5000).optional() })
              .strict()
              .parse(body).motivo ?? "")
          : (z
              .object({ observacao: z.string().max(500).optional() })
              .strict()
              .parse(body).observacao ?? "");
        const { data, error } = await client.rpc("sale_change", {
          p_id: idInput.parse(path[0]),
          p_cancel: cancel,
          p_text: text,
        });
        if (error) databaseError(error);
        return NextResponse.json(data, { headers });
      }
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
              ? "Confira os campos informados e a chave de idempotência."
              : "Não foi possível concluir a operação financeira.",
      },
      { status, headers },
    );
  }
}
