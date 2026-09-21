"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Clock, AlertCircle, ArrowRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { fetchAuth } from "@/lib/api-v2";
import { PLANOS_PAGOS } from "@/lib/billing";

function SucessoInner() {
  const preapprovalId = useSearchParams().get("preapproval_id");
  const [pendente, setPendente] = useState(false);
  const [assinaturaId, setAssinaturaId] = useState("");
  const [planoId, setPlanoId] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    setErro(""); setPlanoId(""); setAssinaturaId(""); setPendente(false);
    async function confirmar() {
      try {
        const query = preapprovalId ? `?preapprovalId=${encodeURIComponent(preapprovalId)}` : "";
        const response = await fetchAuth(`/api/payments/session-info${query}`, { method: "GET", signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? "Não foi possível consultar sua assinatura.");
        if (data?.paid === true && PLANOS_PAGOS.some(item => item.id === data.plano)) {
          setPlanoId(data.plano); setAssinaturaId(data.id ?? ""); setPendente(false); return;
        }
        if (data?.status === "none") throw new Error("Nenhuma assinatura encontrada para sua conta.");
        setPendente(true);
        if (++attempts < 12) timer = setTimeout(confirmar, 5000);
      } catch (error) {
        if (!controller.signal.aborted) setErro(error instanceof Error ? error.message : "Não foi possível confirmar o pagamento.");
      }
    }
    void confirmar();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [preapprovalId]);

  const plano = PLANOS_PAGOS.find((item) => item.id === planoId);
  const carregando = Boolean(!plano && !erro && !pendente);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8f7] px-5 py-12 text-[#303a35]">
      <section className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-7 text-center shadow-[0_24px_70px_rgba(30,60,45,.08)] sm:p-10">
        <Link href="/" className="mx-auto inline-flex items-center"><Image src="/images/gevyro-logo-400.webp" alt="Gevyro" width={400} height={145} priority className="h-auto w-[200px] object-contain" /></Link>
        {carregando && <div className="py-16"><Loader2 size={34} className="mx-auto animate-spin text-[#258c53]" /><h1 className="mt-6 text-2xl font-semibold">Confirmando pagamento</h1><p className="mt-2 text-sm text-[#718078]">Aguarde enquanto validamos sua assinatura com o Mercado Pago.</p></div>}
        {pendente && !erro && !plano && <div className="py-12"><Clock size={36} className="mx-auto text-amber-500" /><h1 className="mt-6 text-2xl font-semibold">Aguardando pagamento</h1><p className="mt-3 text-sm leading-6 text-[#718078]">O Mercado Pago ainda não confirmou uma cobrança aprovada. A autorização da assinatura pode ocorrer antes do pagamento. Seu plano será liberado após a confirmação.</p><Link href="/pagamento/assinatura" className="mt-6 inline-block text-[#258c53] underline">Consultar minha assinatura</Link></div>}
        {erro && <div className="py-12"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500"><AlertCircle size={30} /></span><h1 className="mt-6 text-2xl font-semibold">Não foi possível confirmar</h1><p className="mt-3 text-sm leading-6 text-[#718078]">{erro}</p><Link href="/pagamento" className="mt-7 flex h-[50px] items-center justify-center gap-2 rounded-full bg-[#258c53] text-sm font-bold text-white">Voltar aos planos <ArrowRight size={16} /></Link></div>}
        {plano && <div className="pt-10"><span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#258c53]/10 text-[#258c53]"><CheckCircle2 size={40} /></span><p className="mt-7 text-[10px] font-bold uppercase tracking-[.14em] text-[#258c53]">Assinatura confirmada</p><h1 className="mt-3 text-4xl font-light tracking-[-.04em]">Plano <span className="italic text-[#258c53]">{plano.nome}</span> sincronizado</h1><p className="mt-4 text-sm leading-7 text-[#718078]">A assinatura foi validada diretamente no Mercado Pago e seu acesso já foi atualizado.</p>{assinaturaId && <p className="mt-3 break-all text-xs text-[#718078]">Assinatura: {assinaturaId}</p>}<Link href="/dashboard?payment=success" className="mt-8 flex h-[52px] items-center justify-center gap-2 rounded-full bg-[#258c53] text-sm font-bold text-white hover:bg-[#1d7544]">Ir para o dashboard <ArrowRight size={17} /></Link><p className="mt-5 flex items-center justify-center gap-2 text-xs text-[#8a958f]"><ShieldCheck size={14} /> Transação processada com segurança</p></div>}
        <p className="mt-8 border-t border-zinc-100 pt-5 text-[10px] text-[#9aa49f]">Gevyro · CNPJ 68.259.534/0001-70</p>
      </section>
    </main>
  );
}

export default function PagamentoSucessoPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#f6f8f7]"><Loader2 className="animate-spin text-[#258c53]" /></main>}><SucessoInner /></Suspense>;
}
