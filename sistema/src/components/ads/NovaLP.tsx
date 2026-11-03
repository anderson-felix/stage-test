"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import type { Servico } from "@/lib/ads";
import type { FinalidadeLP } from "@/lib/lp";
import { FINALIDADE_LP_OPCOES, SERVICO_LABEL, SERVICOS_ORDEM } from "./labels";

export function NovaLP({ campanhas }: { campanhas: { slug: string; titulo: string; servico: Servico }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [servico, setServico] = useState<Servico>("technology");
  const [finalidade, setFinalidade] = useState<FinalidadeLP>("campanha");
  const [campanha, setCampanha] = useState("");
  const [briefing, setBriefing] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  function escolherCampanha(slug: string) {
    setCampanha(slug);
    const c = campanhas.find((x) => x.slug === slug);
    if (c) {
      setServico(c.servico);
      if (!titulo) setTitulo(c.titulo);
    }
  }

  async function criar() {
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch("/api/lp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, servico, finalidade, campanha: finalidade === "campanha" ? campanha || null : null, briefing }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro ao criar a LP");
      router.push(`/site/lp/${json.slug}?gerar=1`);
    } catch (err) {
      setErro((err as Error).message);
      setEnviando(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:border-brand/50"
      >
        <Plus size={15} /> Nova LP
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10" onClick={() => !enviando && setOpen(false)}>
          <div className="w-full max-w-xl rounded-xl border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-semibold">Nova Landing Page</h2>
              <button onClick={() => !enviando && setOpen(false)} className="text-muted hover:text-text" aria-label="Fechar">
                <X size={18} />
              </button>
            </header>
            <div className="space-y-4 px-5 py-5">
              <div>
                <span className="text-xs font-medium text-muted">Esta página vai para uma campanha de tráfego pago?</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {FINALIDADE_LP_OPCOES.map((f) => (
                    <button
                      key={f.valor}
                      type="button"
                      onClick={() => setFinalidade(f.valor)}
                      aria-pressed={finalidade === f.valor}
                      className={`rounded-lg border px-3 py-2 text-left ${finalidade === f.valor ? "border-brand bg-brand/10" : "border-border hover:border-brand/50"}`}
                    >
                      <span className="block text-sm font-medium">{f.valor === "campanha" ? "Sim, " : "Não, "}{f.label.toLowerCase()}</span>
                      <span className="mt-0.5 block text-xs text-muted">{f.descricao}</span>
                    </button>
                  ))}
                </div>
              </div>
              {finalidade === "campanha" && (
                <label className="block">
                  <span className="text-xs font-medium text-muted">Qual Campanha? (opcional)</span>
                  <select value={campanha} onChange={(e) => escolherCampanha(e.target.value)} className={input}>
                    <option value="">{campanhas.length ? "Nenhuma por enquanto" : "Nenhuma Campanha criada ainda"}</option>
                    {campanhas.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.titulo}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-muted">Com Campanha, a LP repete a promessa e os termos dos anúncios. Dá para atrelar depois, na tela da LP.</span>
                </label>
              )}
              <label className="block">
                <span className="text-xs font-medium text-muted">Nome da LP *</span>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Consultoria de IA para empresas" className={input} />
                <span className="mt-1 block text-xs text-muted">Vira o endereço da página (ex.: /consultoria-de-ia-para-empresas).</span>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted">Serviço da Stage *</span>
                <select value={servico} onChange={(e) => setServico(e.target.value as Servico)} className={input}>
                  {SERVICOS_ORDEM.map((s) => (
                    <option key={s} value={s}>
                      {SERVICO_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted">Briefing (opcional)</span>
                <textarea
                  value={briefing}
                  onChange={(e) => setBriefing(e.target.value)}
                  rows={3}
                  placeholder={
                    finalidade === "site"
                      ? "Assunto da matéria, pontos que precisa cobrir, público. Se ficar vazio, o Claude usa a memória e a estratégia."
                      : "Público, oferta, o que destacar. Se ficar vazio, o Claude usa a memória, a estratégia e a Campanha."
                  }
                  className={`${input} resize-none`}
                />
              </label>
              {erro && <p className="text-sm text-danger">{erro}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setOpen(false)} disabled={enviando} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text">
                  Cancelar
                </button>
                <button
                  onClick={criar}
                  disabled={!titulo.trim() || enviando}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  {enviando && <Loader2 size={15} className="animate-spin" />} {finalidade === "site" ? "Criar e gerar página" : "Criar e gerar LP"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
