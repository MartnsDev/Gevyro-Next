"use client";

import { fetchAuthJson } from "./api-v2";

export const PLANOS_PAGOS = [
  {
    id: "BASICO",
    nome: "Básico",
    descricao: "Para organizar a primeira loja",
    preco: "79,90",
    destaque: false,
    recursos: ["1 empresa e 1 caixa", "Até 500 produtos", "Relatórios completos", "Suporte por e-mail"],
  },
  {
    id: "PRO",
    nome: "Pro",
    descricao: "Para operações em crescimento",
    preco: "149,90",
    destaque: true,
    recursos: ["Até 5 empresas e 5 caixas", "Produtos ilimitados", "Exportação PDF/CSV", "Suporte prioritário"],
  },
  {
    id: "PREMIUM",
    nome: "Premium",
    descricao: "Para redes e franquias",
    preco: "299,90",
    destaque: false,
    recursos: ["Empresas e caixas ilimitados", "Histórico ilimitado", "Integrações com marketplaces", "Suporte dedicado"],
  },
] as const;

export type PlanoPagoId = (typeof PLANOS_PAGOS)[number]["id"];

export async function criarCheckout(plano: PlanoPagoId): Promise<string> {
  // O backend identifica o cliente pelo cookie HttpOnly. O navegador informa
  // apenas o plano, impedindo a assinatura em nome de outro e-mail.
  const data = await fetchAuthJson<{ url?: string }>("/api/payments/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ plano }),
  });
  if (!data.url) throw new Error("O backend não retornou a página de pagamento.");
  const checkoutUrl = new URL(data.url);
  const providerCheckout = checkoutUrl.origin === "https://www.mercadopago.com.br";
  const internalReturn = checkoutUrl.origin === window.location.origin && checkoutUrl.pathname === "/payment/sucesso";
  if (checkoutUrl.username || checkoutUrl.password || !((providerCheckout && checkoutUrl.protocol === "https:") || internalReturn)) {
    throw new Error("A página de pagamento retornada não é segura.");
  }
  return checkoutUrl.toString();
}

export type AssinaturaStatus = {
  id?: string;
  plano?: PlanoPagoId;
  status: "none" | "processing" | "pending" | "authorized" | "paused" | "cancelled";
  paymentStatus?: "none" | "approved" | "pending" | "in_process" | "in_mediation" | "rejected" | "cancelled" | "refunded" | "charged_back" | "authorized";
  paid: boolean;
  paidUntil?: string;
};

export async function consultarAssinatura(): Promise<AssinaturaStatus> {
  return fetchAuthJson<AssinaturaStatus>("/api/payments/subscription", { method: "GET" });
}

export async function cancelarAssinatura(): Promise<AssinaturaStatus> {
  return fetchAuthJson<AssinaturaStatus>("/api/payments/cancel", { method: "POST" });
}

export async function alterarRenovacao(id: string, action: "pause" | "reactivate"): Promise<AssinaturaStatus> {
  return fetchAuthJson<AssinaturaStatus>(`/api/subscriptions/${encodeURIComponent(id)}/lifecycle?action=${action}`, { method: "POST" });
}
