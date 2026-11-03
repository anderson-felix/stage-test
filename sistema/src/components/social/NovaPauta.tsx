"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { lerStreamClaude } from "@/lib/stream-client";
import type { SugestaoPauta } from "@/app/api/social/pautas/sugestoes/route";
import { ProgressoIA, gravou, lendo, useProgressoIA } from "../ProgressoIA";
import { CANAL_LABEL, FORMATO_LABEL, SERIE_LABEL } from "./labels";

const ETAPAS_PAUTA = {
  etapas: [
    { rotulo: "Lendo a estratégia, o tom de voz e as Séries", quando: lendo },
    { rotulo: "Definindo a Pauta", quando: gravou(/pauta\.md$/) },
    { rotulo: "Escrevendo Roteiro e Legenda de cada Post", quando: gravou(/(post|legenda)\.md$/) },
  ],
  estimativaSeg: 100,
};

// Espelha FORMATOS_POR_CANAL de lib/social.ts (que é só de servidor).
const OPCOES = {
  instagram: ["carrossel", "post-unico", "story"],
  linkedin: ["carrossel", "post-unico"],
} as const;
type Canal = keyof typeof OPCOES;

type Fase = { kind: "form" } | { kind: "gerando" } | { kind: "erro"; msg: string };

export function NovaPauta() {
  const router = useRouter();
  const progresso = useProgressoIA(ETAPAS_PAUTA);
  const [open, setOpen] = useState(false);
  const [tema, setTema] = useState("");
  const [angulo, setAngulo] = useState("");
  const [data, setData] = useState("");
  const [canais, setCanais] = useState<Record<Canal, string | null>>({ instagram: "carrossel", linkedin: null });
  const [fase, setFase] = useState<Fase>({ kind: "form" });
  const [sugestoes, setSugestoes] = useState<SugestaoPauta[] | null>(null);
  const [sugerindo, setSugerindo] = useState(false);
  const [erroSugestao, setErroSugestao] = useState("");

  const posts = (Object.keys(canais) as Canal[])
    .filter((c) => canais[c])
    .map((c) => ({ canal: c, formato: canais[c]! }));
  const podeGerar = tema.trim().length > 0 && posts.length > 0;

  function fechar() {
    if (fase.kind === "gerando") return;
    setOpen(false);
    setFase({ kind: "form" });
  }

  async function sugerir() {
    setSugerindo(true);
    setErroSugestao("");
    try {
      const res = await fetch("/api/social/pautas/sugestoes", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro ao sugerir");
      setSugestoes(json.sugestoes);
    } catch (err) {
      setErroSugestao((err as Error).message);
    } finally {
      setSugerindo(false);
    }
  }

  function usarSugestao(s: SugestaoPauta) {
    setTema(s.titulo);
    setAngulo(s.angulo);
    const next: Record<Canal, string | null> = { instagram: null, linkedin: null };
    for (const c of s.canais) next[c.canal as Canal] = c.formato;
    if (next.instagram || next.linkedin) setCanais(next);
    setSugestoes(null);
  }

  async function gerar() {
    setFase({ kind: "gerando" });
    progresso.iniciar();
    try {
      const res = await fetch("/api/social/pautas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema, angulo, dataPlanejada: data || undefined, posts }),
      });
      await lerStreamClaude(res, progresso.onEvento);
      progresso.parar();
      setOpen(false);
      setFase({ kind: "form" });
      setTema("");
      setAngulo("");
      setData("");
      router.refresh();
    } catch (err) {
      progresso.parar();
      setFase({ kind: "erro", msg: (err as Error).message });
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover"
      >
        <Plus size={15} /> Nova Pauta
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10" onClick={fechar}>
          <div
            className="w-full max-w-xl rounded-xl border border-border bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-semibold">Nova Pauta</h2>
              <button onClick={fechar} className="text-muted hover:text-text" aria-label="Fechar">
                <X size={18} />
              </button>
            </header>

            {fase.kind === "gerando" ? (
              <div className="px-5 py-6">
                <ProgressoIA titulo="O Claude está escrevendo os Roteiros" progresso={progresso} aviso="Não feche esta janela." />
              </div>
            ) : (
              <div className="space-y-4 px-5 py-5">
                <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <span className="text-muted">Sem ideia de tema?</span>
                  <button
                    onClick={sugerir}
                    disabled={sugerindo}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-brand-soft hover:border-brand/50 disabled:opacity-60"
                  >
                    {sugerindo ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {sugerindo ? "Pensando…" : "Sugerir Pautas"}
                  </button>
                </div>
                {erroSugestao && <p className="text-xs text-danger">{erroSugestao}</p>}
                {sugestoes && (
                  <ul className="space-y-2">
                    {sugestoes.map((s) => (
                      <li key={s.titulo}>
                        <button
                          onClick={() => usarSugestao(s)}
                          className="w-full rounded-lg border border-border px-3 py-2 text-left hover:border-brand/50"
                        >
                          <div className="text-sm font-medium">{s.titulo}</div>
                          <div className="text-xs text-muted">{s.angulo}</div>
                          <div className="mt-1 text-[11px] text-brand-soft">
                            {SERIE_LABEL[s.serie as keyof typeof SERIE_LABEL] ?? s.serie}
                            {s.porque && <span className="text-muted"> · {s.porque}</span>}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <label className="block">
                  <span className="text-xs font-medium text-muted">Tema *</span>
                  <input
                    value={tema}
                    onChange={(e) => setTema(e.target.value)}
                    placeholder="Ex.: Adoção de IA não é projeto de TI"
                    className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Ângulo (opcional)</span>
                  <span className="mt-0.5 block text-xs text-muted/80">
                    O recorte do tema: a ideia que o Post defende. Tema &ldquo;IA nas empresas&rdquo; → ângulo &ldquo;o gargalo é adoção, não
                    tecnologia&rdquo;. Se ficar vazio, o Claude escolhe a partir da estratégia.
                  </span>
                  <textarea
                    value={angulo}
                    onChange={(e) => setAngulo(e.target.value)}
                    rows={2}
                    placeholder="Ex.: o gargalo é adoção, não tecnologia"
                    className="mt-1 w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </label>

                <div>
                  <span className="text-xs font-medium text-muted">Canais e Formatos *</span>
                  <div className="mt-1 space-y-2">
                    {(Object.keys(OPCOES) as Canal[]).map((canal) => (
                      <div key={canal} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                        <label className="flex w-28 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={!!canais[canal]}
                            onChange={(e) => setCanais({ ...canais, [canal]: e.target.checked ? OPCOES[canal][0] : null })}
                            className="accent-[var(--brand)]"
                          />
                          {CANAL_LABEL[canal]}
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {OPCOES[canal].map((f) => (
                            <button
                              key={f}
                              disabled={!canais[canal]}
                              onClick={() => setCanais({ ...canais, [canal]: f })}
                              className={`rounded-md px-2 py-0.5 text-xs disabled:opacity-40 ${
                                canais[canal] === f ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-text"
                              }`}
                            >
                              {FORMATO_LABEL[f]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="text-xs font-medium text-muted">Data planejada (opcional)</span>
                  <input
                    type="date"
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                    className="mt-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none [color-scheme:dark] focus:border-brand"
                  />
                </label>

                {fase.kind === "erro" && <p className="text-sm text-danger">{fase.msg}</p>}

                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={fechar} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text">
                    Cancelar
                  </button>
                  <button
                    onClick={gerar}
                    disabled={!podeGerar}
                    className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                  >
                    <Sparkles size={15} /> Gerar Roteiros
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
