// lib/api-v2.ts

"use client";

import { savePendingPhoto, uploadPendingPhoto } from "./pending-profile-photo";
import { fetchIdempotentSale } from "./sale-idempotency";

export const API_BASE_URL = "";


export interface Usuario {
  id: number;
  nome: string;
  email: string;
  foto?: string;         // foto do Google (URL completa)
  fotoUpload?: string;   // foto de upload (path relativo: /uploads/fotos/uuid.jpg)
  tipoPlano: string;
  statusAcesso?: "ATIVO" | "INATIVO";
  expiracaoPlano?: string;
}

export interface LoginResponse {
  nome: string;
  email: string;
  tipoPlano: string;
  foto?: string;
  fotoUpload?: string;
  statusAcesso?: "ATIVO" | "INATIVO";
  expiracaoPlano?: string;
}

interface ErrorResponse {
  erro?: string;
  mensagem?: string;
}

const ROTULOS_CAMPOS: Record<string, string> = {
  nome: "Nome",
  email: "E-mail",
  senha: "Senha",
  telefone: "Telefone",
  cpf: "CPF",
  cnpj: "CNPJ",
  empresaId: "Empresa",
  preco: "Preço",
  quantidadeEstoque: "Quantidade em estoque",
  estoqueMinimo: "Estoque mínimo",
};

function detalheErro(valor: unknown): string | null {
  if (typeof valor === "string" && valor.trim()) {
    const [campo, ...mensagem] = valor.split(":");
    if (mensagem.length > 0) {
      const rotulo = ROTULOS_CAMPOS[campo.trim()] ?? campo.trim();
      return `${rotulo}: ${mensagem.join(":").trim()}`;
    }
    return valor.trim();
  }
  if (valor && typeof valor === "object") {
    const item = valor as Record<string, unknown>;
    const campo = typeof item.field === "string" ? item.field : typeof item.campo === "string" ? item.campo : "";
    const mensagem = item.message ?? item.mensagem ?? item.defaultMessage;
    if (typeof mensagem === "string" && mensagem.trim()) {
      return campo ? `${ROTULOS_CAMPOS[campo] ?? campo}: ${mensagem.trim()}` : mensagem.trim();
    }
  }
  return null;
}

export function mensagemErroApi(payload: unknown, status: number): string {
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const detalhesBrutos = data.erros ?? data.detalhes ?? data.fieldErrors ?? data.violations;
  const detalhes = Array.isArray(detalhesBrutos)
    ? detalhesBrutos.map(detalheErro).filter((item): item is string => Boolean(item))
    : [];
  const principal = [data.mensagem, data.erro, data.error, data.message, data.detail]
    .find((item): item is string => typeof item === "string" && item.trim().length > 0)
    ?.trim();

  if (detalhes.length > 0) return detalhes.join(" • ");
  if (principal && !["Bad Request", "Erro de validação"].includes(principal)) return principal;

  if (status === 400 || status === 422) return "Verifique os dados informados e preencha corretamente os campos obrigatórios.";
  if (status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (status === 403) return "Você não tem permissão para realizar esta ação.";
  if (status === 404) return "O registro solicitado não foi encontrado.";
  if (status === 409) return "Esta ação entra em conflito com um registro existente.";
  if (status >= 500) return "O servidor não conseguiu concluir a operação. Tente novamente em instantes.";
  return `Não foi possível concluir a operação (erro ${status}).`;
}

// O JWT é mantido exclusivamente pelo backend em cookie HttpOnly. Estes
// aliases permanecem temporariamente para componentes legados compilarem sem
// voltar a expor a credencial ao JavaScript.
export function salvarTokenCookie(_token: string) {}
export function removerTokenCookie() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("jwt_token");
  localStorage.removeItem("token");
  localStorage.removeItem("access_token");
}
export function lerTokenCookie(): null { return null; }
export function getToken(): null { return null; }
export function hasToken(): boolean { return false; }

export const AUTH_EVENT_KEY = "gevyro-auth-event";

export function limparDadosSessaoCliente(): void {
  if (typeof window === "undefined") return;

  removerTokenCookie();
  sessionStorage.removeItem("checkout_email");
  sessionStorage.removeItem("gevyro-request-cookie-consent-after-login");
  sessionStorage.removeItem("gevyro-require-legal-ack-after-login");
  localStorage.removeItem("gevyro-account-consents");
  localStorage.removeItem("gevyro-google-legal-ack");

  const chavesPorConta = [
    "gp_empresa_",
    "gp_caixa_",
    "empresa_ativa_uid_",
    "caixa_ativo_uid_",
  ];
  const chavesLegadas = new Set([
    "empresa_ativa",
    "caixa_ativo",
    "empresaAtiva",
    "caixaAtivo",
  ]);

  Object.keys(localStorage).forEach((key) => {
    if (chavesLegadas.has(key) || chavesPorConta.some((prefixo) => key.startsWith(prefixo))) {
      localStorage.removeItem(key);
    }
  });

  // O service worker atual é network-only, mas remove caches criados por
  // versões antigas para impedir que dados de outra conta reapareçam.
  if ("caches" in window) {
    void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
  }
}

function publicarLogout(): void {
  localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify({ type: "logout", at: Date.now() }));
}

/** @deprecated As rotas Next.js validam Origin; não há token CSRF do Spring. */
export async function obterCsrfToken(): Promise<string> { return ""; }


/**
 * Fetch autenticado por cookie HttpOnly, com proteção CSRF em mutações.
 * Retorna Response - use para quando precisar verificar status manualmente.
 */
export async function fetchAuth(path: string, options: RequestInit = {}): Promise<Response> {
  const isFormData=typeof FormData!=="undefined"&&options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(!isFormData?{"Content-Type":"application/json"}:{}),
    ...(options.headers as Record<string, string> ?? {}),
  };

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}${cleanPath}`;

  const transport = cleanPath === "/api/v1/vendas/registrar" && options.method?.toUpperCase() === "POST" ? fetchIdempotentSale : fetch;
  const response = await transport(url, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  return response;
}

/**
 * Fetch autenticado que já parseia o JSON e lança erro se não for ok.
 * Use esta função nas páginas para simplificar o código.
 */
export async function fetchAuthJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchAuth(path, options);
  
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(mensagemErroApi(err, response.status));
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}


/**
 * Login com e-mail e senha. A credencial permanece apenas no cookie HttpOnly.
 */
async function authRequest<T>(operation: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/auth/${operation}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.mensagem ?? "Não foi possível autenticar sua sessão.");
  return data as T;
}

export async function login(email: string, senha: string): Promise<Usuario> {
  const user = await authRequest<Usuario>("login", { method: "POST", body: JSON.stringify({ email, senha }) });
  await uploadPendingPhoto(user.email);
  return user;
}

/**
 * Cadastro de novo usuário (multipart/form-data).
 */
export async function cadastrar(
  nome: string,
  email: string,
  senha: string,
  foto?: File,
): Promise<void> {
  await savePendingPhoto(email, foto);
  await authRequest<void>("signup", { method: "POST", body: JSON.stringify({ nome, email, senha }) });
}

/**
 * Solicita um novo link sem revelar se o e-mail está cadastrado.
 */
export async function reenviarConfirmacao(email: string): Promise<string> {
  const data = await authRequest<{ mensagem: string }>("resend", {
    method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  return data.mensagem;
}

/**
 * Logout — remove cookie local e invalida sessão no backend.
 */
export async function logout(): Promise<void> {
  await authRequest<void>("logout", { method: "POST" });
  limparDadosSessaoCliente();
  publicarLogout();
}

/**
 * Obtém dados do usuário autenticado.
 * O navegador envia somente o cookie HttpOnly definido pelo backend.
 */
export async function getUsuario(): Promise<Usuario> {
  return authRequest<Usuario>("session");
}

/**
 * Login com Google — redireciona para o backend iniciar o fluxo OAuth2.
 */
export function loginComGoogle() {
  globalThis.window.location.href = "/api/auth/google";
}
