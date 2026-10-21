import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase/server";
import { readAuthenticatedProfile, AuthFlowError } from "@/server/auth/session";
import { isSameOriginMutation, applicationOrigin } from "@/server/auth/request-security";
import {
  sendRecovery,
  resetPassword,
  passwordInput,
} from "@/server/auth/account";
import { imageType } from "@/server/auth/photos";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const headers = { "Cache-Control": "private, no-store" };
const preferences = z
  .object({
    emailVendas: z.boolean(),
    emailRelatorios: z.boolean(),
    alertaEstoqueZerado: z.boolean(),
    alertaVencimentoPlano: z.boolean(),
  })
  .strict();
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
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) throw new AuthFlowError("NAO_AUTENTICADO", 401);
    const operation = (await context.params).path.join("/");
    const query = () =>
      client
        .from("usuarios")
        .select(
          "email_vendas,email_relatorios,alerta_estoque_zerado,alerta_vencimento_plano",
        )
        .eq("auth_user_id", user.id)
        .single();
    if (request.method === "GET" && operation === "perfil") {
      const days = profile.expiracaoPlano
        ? Math.max(
            0,
            Math.ceil(
              (Date.parse(profile.expiracaoPlano) - Date.now()) / 86400000,
            ),
          )
        : 0;
      return NextResponse.json(
        {
          ...profile,
          fotoUrl: profile.fotoUpload ?? profile.foto ?? "",
          diasRestantes: days,
          emailConfirmado: Boolean(user.email_confirmed_at),
        },
        { headers },
      );
    }
    if (request.method === "GET" && operation === "notificacoes") {
      const { data, error } = await query();
      if (error || !data) throw new Error("PROFILE_READ_FAILED");
      return NextResponse.json(
        {
          emailVendas: data.email_vendas,
          emailRelatorios: data.email_relatorios,
          alertaEstoqueZerado: data.alerta_estoque_zerado,
          alertaVencimentoPlano: data.alerta_vencimento_plano,
        },
        { headers },
      );
    }
    if (request.method === "POST" && operation === "perfil/foto") {
      if (Number(request.headers.get("content-length") ?? 0) > 6 * 1024 * 1024)
        throw new AuthFlowError("A foto deve ter no máximo 5 MB.", 413);
      const form = await request.formData();
      const file = form.get("foto");
      if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024)
        throw new AuthFlowError("Envie uma foto de até 5 MB.", 400);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = imageType(bytes);
      const { data: previous } = await client
        .from("usuarios")
        .select("foto_upload")
        .eq("auth_user_id", user.id)
        .single();
      const path = `${user.id}/${crypto.randomUUID()}.${type.extension}`;
      const { error } = await client.storage
        .from("profile-photos")
        .upload(path, bytes, { contentType: type.mime, upsert: false });
      if (error)
        throw new AuthFlowError(
          "Não foi possível salvar sua foto agora. Tente novamente em instantes.",
          503,
        );
      const { error: updateError } = await client
        .from("usuarios")
        .update({ foto_upload: path })
        .eq("auth_user_id", user.id);
      if (updateError) {
        await client.storage.from("profile-photos").remove([path]);
        throw new Error("PROFILE_UPDATE_FAILED");
      }
      if (previous?.foto_upload?.startsWith(`${user.id}/`))
        await client.storage
          .from("profile-photos")
          .remove([previous.foto_upload]);
      return NextResponse.json(
        {
          fotoUrl: `/api/auth/photo?v=${encodeURIComponent(path.split("/")[1]!)}`,
        },
        { headers },
      );
    }
    if (request.method === "DELETE" && operation === "perfil/foto") {
      const { data } = await client
        .from("usuarios")
        .select("foto_upload")
        .eq("auth_user_id", user.id)
        .single();
      const { error } = await client
        .from("usuarios")
        .update({ foto_upload: null })
        .eq("auth_user_id", user.id);
      if (error) throw error;
      if (data?.foto_upload?.startsWith(`${user.id}/`))
        await client.storage.from("profile-photos").remove([data.foto_upload]);
      return NextResponse.json({ fotoUrl: profile.foto ?? "" }, { headers });
    }
    if (request.method === "POST" && operation === "senha/solicitar-codigo") {
      await sendRecovery(client, user.email!, applicationOrigin(request));
      return NextResponse.json(
        { mensagem: "Se houver uma conta elegível, enviaremos um código." },
        { headers },
      );
    }
    const body = await request.json().catch(() => null);
    if (request.method === "POST" && operation === "senha/trocar") {
      const resetInput = z
        .object({
          codigo: z.string().regex(/^\d{6}$/),
          novaSenha: passwordInput,
          confirmarSenha: passwordInput,
        })
        .strict()
        .refine(
          (value) => value.novaSenha === value.confirmarSenha,
          "As senhas não coincidem",
        )
        .parse(body);
      await resetPassword(client, {
        email: user.email!,
        codigo: resetInput.codigo,
        novaSenha: resetInput.novaSenha,
      });
      return NextResponse.json(
        { mensagem: "Senha atualizada. Entre novamente." },
        { headers },
      );
    }
    let changes: Record<string, unknown>;
    if (request.method === "PUT" && operation === "perfil/nome")
      changes = z
        .object({ nome: z.string().trim().min(1).max(255) })
        .strict()
        .parse(body);
    else if (request.method === "PUT" && operation === "notificacoes") {
      const p = preferences.parse(body);
      changes = {
        email_vendas: p.emailVendas,
        email_relatorios: p.emailRelatorios,
        alerta_estoque_zerado: p.alertaEstoqueZerado,
        alerta_vencimento_plano: p.alertaVencimentoPlano,
      };
    } else
      return NextResponse.json(
        { mensagem: "Rota não encontrada" },
        { status: 404, headers },
      );
    const { error } = await client
      .from("usuarios")
      .update(changes)
      .eq("auth_user_id", user.id);
    if (error) throw error;
    return NextResponse.json(
      operation === "perfil/nome" ? { nome: changes.nome } : {},
      { headers },
    );
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
