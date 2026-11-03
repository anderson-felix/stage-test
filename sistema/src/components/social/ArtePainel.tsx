"use client";

/* eslint-disable @next/next/no-img-element -- PNGs servidos pela API do hub, com versão na URL */

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, FileText, Loader2, PenTool, RefreshCw, Sparkles, Upload, Wand2 } from "lucide-react";
import type { PostCompleto } from "@/lib/social";
import { lerStreamClaude } from "@/lib/stream-client";
import { ProgressoIA, escrevendo, lendo, pensando, renderizando, useProgressoIA } from "../ProgressoIA";

const arquivoUrl = (path: string, versao: number, download = false) =>
  `/api/social/arquivo?path=${encodeURIComponent(path)}&v=${versao}${download ? "&download=1" : ""}`;

export function ArtePainel({ post, onAtualizado }: { post: PostCompleto; onAtualizado: (p: PostCompleto) => void }) {
  const [atual, setAtual] = useState(0);
  const [modoAjuste, setModoAjuste] = useState(false);
  const progresso = useProgressoIA({
    etapas: modoAjuste
      ? [
          { rotulo: "Lendo a Arte atual e o pedido" },
          { rotulo: "Aplicando o ajuste", quando: escrevendo },
          { rotulo: "Renderizando os slides", quando: renderizando },
        ]
      : [
          { rotulo: "Lendo o Roteiro e a identidade da marca", quando: lendo },
          { rotulo: "Desenhando a composição de cada slide", quando: pensando },
          { rotulo: "Montando o layout dos slides", quando: escrevendo },
          { rotulo: "Renderizando os slides", quando: renderizando },
        ],
    estimativaSeg: modoAjuste ? 60 : 150,
  });
  const gerando = progresso.estado !== null;
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [ajuste, setAjuste] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const base = `/api/social/posts/${post.pauta.slug}/${post.slug}`;
  const { slides, pdf, versao } = post.arte;
  const temArte = slides.length > 0;
  const idx = Math.min(atual, Math.max(slides.length - 1, 0));
  const vertical = post.formato === "story";

  async function recarregar() {
    const res = await fetch(base);
    if (res.ok) onAtualizado(await res.json());
  }

  async function gerar(pedido?: string) {
    setModoAjuste(!!pedido);
    progresso.iniciar();
    setErro("");
    try {
      const res = await fetch(`${base}/arte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedido ? { ajuste: pedido } : {}),
      });
      await lerStreamClaude(res, progresso.onEvento);
      setAjuste("");
      setAtual(0);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      progresso.parar();
    }
  }

  async function enviar(files: FileList | null) {
    if (!files?.length) return;
    setEnviando(true);
    setErro("");
    try {
      const form = new FormData();
      // Ordem dos slides = ordem alfabética dos nomes (slide-01, slide-02…)
      for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
        form.append("arquivos", f);
      }
      const res = await fetch(`${base}/arte`, { method: "PUT", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro no upload");
      setAtual(0);
      onAtualizado(json);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function baixarTodos() {
    slides.forEach((s, i) =>
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = arquivoUrl(s, versao, true);
        a.click();
      }, i * 400),
    );
  }

  const ocupado = gerando || enviando;

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Arte</h2>
        {post.origemArte && temArte && (
          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">
            {post.origemArte === "ia" ? "Gerada pela IA" : "Enviada pelo designer"}
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.pdf"
        className="hidden"
        onChange={(e) => enviar(e.target.files)}
      />

      {gerando ? (
        <div className="mt-4">
          <ProgressoIA
            titulo={modoAjuste ? "A IA está ajustando a Arte" : "A IA está criando a Arte"}
            progresso={progresso}
            aviso="Não saia desta página, senão a geração é cancelada."
          />
        </div>
      ) : !temArte ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <p className="max-w-sm text-sm text-muted">
            A IA monta a Arte a partir do Roteiro, no padrão visual da Stage. Você revisa e pede ajustes.
          </p>
          <button
            onClick={() => gerar()}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
          >
            <Sparkles size={15} /> Gerar Arte com IA
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-text"
          >
            {enviando ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} ou enviar a Arte do designer
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,380px)_1fr]">
          {/* Mock do feed */}
          <div className="overflow-hidden rounded-xl border border-border bg-white text-[#1c1b1e]">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4c0dff] text-[11px] font-bold text-white">S</div>
              <div className="text-xs font-semibold">{post.canal === "instagram" ? "stage.consulting" : "Stage Consulting"}</div>
            </div>
            <div className={`relative bg-[#f2f2f2] ${vertical ? "aspect-[9/16]" : "aspect-[4/5]"}`}>
              <img src={arquivoUrl(slides[idx], versao)} alt={`Slide ${idx + 1}`} className="h-full w-full object-cover" />
              {slides.length > 1 && (
                <>
                  <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
                    {idx + 1}/{slides.length}
                  </span>
                  {idx > 0 && (
                    <button
                      onClick={() => setAtual(idx - 1)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 shadow"
                      aria-label="Anterior"
                    >
                      <ChevronLeft size={16} />
                    </button>
                  )}
                  {idx < slides.length - 1 && (
                    <button
                      onClick={() => setAtual(idx + 1)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 shadow"
                      aria-label="Próximo"
                    >
                      <ChevronRight size={16} />
                    </button>
                  )}
                </>
              )}
            </div>
            {slides.length > 1 && (
              <div className="flex justify-center gap-1 py-2">
                {slides.map((_, i) => (
                  <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === idx ? "bg-[#4c0dff]" : "bg-[#c9c9c9]"}`} />
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            {post.arte.html && post.origemArte === "ia" && (
              <Link
                href={`/social/${post.pauta.slug}/${post.slug}/editor`}
                aria-disabled={ocupado}
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover ${ocupado ? "pointer-events-none opacity-50" : ""}`}
              >
                <PenTool size={15} /> Editar Arte
              </Link>
            )}

            <div className="flex flex-wrap gap-1.5">
              {slides.map((s, i) => (
                <button
                  key={s}
                  onClick={() => setAtual(i)}
                  className={`overflow-hidden rounded-md border-2 ${i === idx ? "border-brand" : "border-transparent opacity-70 hover:opacity-100"}`}
                >
                  <img src={arquivoUrl(s, versao)} alt={`Miniatura ${i + 1}`} className={`${vertical ? "h-20 w-[45px]" : "h-16 w-[51px]"} object-cover`} />
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted" htmlFor="ajuste">
                Pedir ajuste à IA
              </label>
              <textarea
                id="ajuste"
                value={ajuste}
                onChange={(e) => setAjuste(e.target.value)}
                rows={3}
                placeholder={`Ex.: "slide ${idx + 1} com fundo claro" ou "título da capa maior"`}
                className="mt-1 w-full rounded-lg border border-border bg-bg p-3 text-sm outline-none focus:border-brand"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => gerar(ajuste)}
                  disabled={!ajuste.trim() || ocupado}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  <Wand2 size={14} /> Aplicar ajuste
                </button>
                <button
                  onClick={() => {
                    if (confirm("Gerar do zero substitui a Arte atual, inclusive o que foi editado à mão. A versão atual fica em arte/historico/. Continuar?")) gerar();
                  }}
                  disabled={ocupado}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-text disabled:opacity-50"
                >
                  <RefreshCw size={14} /> Gerar do zero
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <button
                onClick={baixarTodos}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:border-brand/50"
              >
                <Download size={14} /> Baixar {slides.length > 1 ? `${slides.length} PNGs` : "PNG"}
              </button>
              {pdf && (
                <a
                  href={arquivoUrl(pdf, versao, true)}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:border-brand/50"
                >
                  <FileText size={14} /> Baixar PDF
                </a>
              )}
              <button
                onClick={() => inputRef.current?.click()}
                disabled={ocupado}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-text disabled:opacity-50"
              >
                {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Enviar Arte do designer
              </button>
            </div>
            <p className="text-xs text-muted">A Arte anterior fica guardada em arte/historico/ no workspace.</p>
          </div>
        </div>
      )}

      {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}
    </section>
  );
}
