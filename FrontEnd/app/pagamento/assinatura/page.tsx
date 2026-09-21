"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { alterarRenovacao, cancelarAssinatura, consultarAssinatura, PLANOS_PAGOS, type AssinaturaStatus } from "@/lib/billing";

const STATUS: Record<string, string> = { none: "Sem assinatura", processing: "Verificando a contratação anterior", pending: "Aguardando autorização ou pagamento", authorized: "Renovação autorizada", paused: "Renovação pausada", canceled: "Renovação cancelada", cancelled: "Renovação cancelada" };

const PAYMENT_STATUS: Record<string, string> = { none: "Sem cobrança confirmada", approved: "Pagamento aprovado", pending: "Pagamento pendente", in_process: "Pagamento em análise", in_mediation: "Pagamento em mediação", rejected: "Pagamento recusado", cancelled: "Pagamento cancelado", refunded: "Pagamento reembolsado", charged_back: "Pagamento contestado", authorized: "Pagamento autorizado, aguardando confirmação" };

export default function AssinaturaPage() {
  const [assinatura, setAssinatura] = useState<AssinaturaStatus | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  async function atualizar() {
    setOcupado(true); setErro("");
    try { setAssinatura(await consultarAssinatura()); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível consultar a assinatura."); }
    finally { setOcupado(false); }
  }
  useEffect(() => { void atualizar(); }, []);
  async function cancelar() {
    setOcupado(true); setErro("");
    try { setAssinatura(await cancelarAssinatura()); setConfirmar(false); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível cancelar a renovação."); }
    finally { setOcupado(false); }
  }
  async function alterar(action: "pause" | "reactivate") {
    if (!assinatura?.id || ocupado) return;
    setOcupado(true); setErro("");
    try { setAssinatura(await alterarRenovacao(assinatura.id, action)); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível alterar a renovação."); }
    finally { setOcupado(false); }
  }
  const plano = PLANOS_PAGOS.find(p => p.id === assinatura?.plano);
  const podeCancelar = assinatura && ["pending", "authorized", "paused"].includes(assinatura.status);
  return <main className="min-h-screen bg-[#f6f8f7] px-5 py-16 text-[#303a35]">
    <section className="mx-auto max-w-lg rounded-3xl border border-zinc-200 bg-white p-8">
      <Link href="/dashboard" className="text-sm text-[#258c53]">← Dashboard</Link>
      <h1 className="mt-6 text-3xl font-semibold">Minha assinatura</h1>
      <p className="mt-3 text-sm text-zinc-500">Cobrança mensal pelo Mercado Pago.</p>
      {erro && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{erro}</p>}
      {ocupado && <p role="status" className="mt-5 flex gap-2 text-sm"><Loader2 className="animate-spin" size={18} /> Processando...</p>}
      {assinatura && <div className="mt-6 space-y-4 text-sm">
        {plano && <p className="text-xl font-semibold">{plano.nome} · R$ {plano.preco}/mês</p>}
        {assinatura.id && <p className="break-all text-xs text-zinc-500">Assinatura: {assinatura.id}</p>}
        <p>{STATUS[assinatura.status] ?? "Status em atualização"}</p>
        {assinatura.paymentStatus && <p>{PAYMENT_STATUS[assinatura.paymentStatus] ?? "Cobrança em atualização"}</p>}
        <p>{assinatura.paid ? `Acesso pago até ${assinatura.paidUntil?.split("-").reverse().join("/")}.` : "Não há um período pago vigente confirmado para esta assinatura."}</p>
        {assinatura.status === "processing" && <p>Estamos verificando a tentativa anterior com o Mercado Pago. Aguarde e atualize o status. Se a situação persistir, entre em contato com o suporte antes de tentar contratar novamente.</p>}
        {assinatura.status === "pending" && <Link href={`/pagamento?plano=${assinatura.plano}`} className="block w-full rounded-full bg-[#258c53] p-3 text-center font-semibold text-white">Continuar no Mercado Pago</Link>}
        {assinatura.id && assinatura.status === "authorized" && <button disabled={ocupado} onClick={() => alterar("pause")} className="w-full rounded-full border border-zinc-300 p-3 disabled:opacity-50">Pausar renovação</button>}
        {assinatura.id && assinatura.status === "paused" && <button disabled={ocupado} onClick={() => alterar("reactivate")} className="w-full rounded-full border border-zinc-300 p-3 disabled:opacity-50">Reativar renovação</button>}
        {podeCancelar && !confirmar && <button disabled={ocupado} onClick={() => setConfirmar(true)} className="w-full rounded-full border border-zinc-300 p-3 disabled:opacity-50">Cancelar renovação</button>}
        {confirmar && <div className="rounded-xl bg-amber-50 p-4"><p>Ao cancelar, as próximas renovações serão interrompidas. O acesso já pago permanece até o vencimento. Esta ação não solicita reembolso.</p><div className="mt-4 flex gap-4"><button disabled={ocupado} onClick={cancelar} className="font-semibold text-red-700 disabled:opacity-50">Confirmar cancelamento</button><button disabled={ocupado} onClick={() => setConfirmar(false)}>Voltar</button></div></div>}
        {assinatura.status === "cancelled" && assinatura.paid && <p>Para trocar de plano, aguarde o vencimento do período pago e escolha o novo plano.</p>}
        {(assinatura.status === "none" || (assinatura.status === "cancelled" && !assinatura.paid)) && <Link href="/pagamento" className="block rounded-full bg-[#258c53] p-3 text-center font-semibold text-white">Escolher plano</Link>}
      </div>}
      <button onClick={atualizar} disabled={ocupado} className="mt-6 text-sm text-[#258c53] underline disabled:opacity-50">Atualizar status</button>
    </section>
  </main>;
}
