"use client";

/* eslint-disable @next/next/no-img-element -- PNGs servidos pela API do hub/media */

import { useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  FileText,
  Loader2,
  Lock,
  PenTool,
  RefreshCw,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import type { PostCompleto } from "@/lib/social";
import { lerStreamClaude } from "@/lib/stream-client";
import {
  ProgressoIA,
  escrevendo,
  lendo,
  pensando,
  renderizando,
  useProgressoIA,
} from "../ProgressoIA";

export const arquivoUrl = (path: string, versao: number, download = false) => {
  if (path.startsWith("/api/media/")) {
    return `/api/social/arquivo?path=${encodeURIComponent(path)}&v=${versao}${
      download ? "&download=1" : ""
    }`;
  }
  return `/api/social/arquivo?path=${encodeURIComponent(path)}&v=${versao}${
    download ? "&download=1" : ""
  }`;
};

export function ArtePainel({
  post,
  onAtualizado,
  onAprovarRoteiro,
  aprovandoRoteiro,
}: {
  post: PostCompleto;
  onAtualizado: (p: PostCompleto) => void;
  onAprovarRoteiro?: () => void;
  aprovandoRoteiro?: boolean;
}) {
  const [atual, setAtual] = useState(0);
  const [modoAjuste, setModoAjuste] = useState(false);
  const progresso = useProgressoIA({
    etapas: modoAjuste
      ? [
          { rotulo: "Lendo a Arte atual e o pedido" },
          { rotulo: "Aplicando o ajuste", quando: escrevendo },
          { rotulo: "Renderizando os slides no Blob Storage", quando: renderizando },
        ]
      : [
          { rotulo: "Lendo o Roteiro aprovado e a identidade da marca", quando: lendo },
          { rotulo: "Desenhando a composição de cada slide", quando: pensando },
          { rotulo: "Montando o layout HTML dos slides", quando: escrevendo },
          { rotulo: "Renderizando os slides no Playwright → Blob Storage", quando: renderizando },
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
  const roteiroAprovado = post.status !== "rascunho";

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
      if (res.status === 402 || res.status === 400) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Não foi possível gerar a Arte");
      }
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
      for (const f of [...files].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true })
      )) {
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
      }, i * 400)
    );
  }

  const ocupado = gerando || enviando;

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Etapa 2 · Arte Visual & Slides</h2>
          {!roteiroAprovado ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2.5 py-0.5 text-[11px] font-medium text-warn">
              <Lock size={11} /> Aguardando Aprovação do Roteiro
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2.5 py-0.5 text-[11px] font-medium text-ok">
              <CheckCircle2 size={11} /> Roteiro Aprovado
            </span>
          )}
        </div>
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
        onChange={(e) => void enviar(e.target.files)}
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
          {!roteiroAprovado ? (
            <>
              <p className="max-w-md text-sm text-muted">
                Fluxo em 2 Etapas: Revise ou edite o <strong>Roteiro</strong> abaixo gratuitamente e clique em{" "}
                <strong>Aprovar Roteiro</strong> antes de consumir créditos de IA para gerar a Arte.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {onAprovarRoteiro && (
                  <button
                    type="button"
                    onClick={onAprovarRoteiro}
                    disabled={aprovandoRoteiro}
                    className="flex items-center gap-1.5 rounded-lg bg-ok px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {aprovandoRoteiro ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    Aprovar Roteiro (0 Tokens)
                  </button>
                )}
                <button
                  type="button"
                  disabled
                  className="flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-brand/40 px-4 py-2 text-sm font-medium text-white/70"
                >
                  <Lock size={14} /> Gerar Arte com IA (Requer Roteiro Aprovado)
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="max-w-md text-sm text-muted">
                Roteiro aprovado! Agora a IA monta a Arte HTML e renderiza os slides no padrão visual da marca.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => void gerar()}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
                >
                  <Sparkles size={15} /> Gerar Arte com IA
                </button>
                {post.arte.html && (
                  <Link
                    href={`/social/${post.pauta.slug}/${post.slug}/editor`}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-4 py-2 text-sm font-medium text-text hover:border-brand/50"
                  >
                    <PenTool size={14} /> Abrir Editor Visual Manual (0 Tokens)
                  </Link>
                )}
              </div>
            </>
          )}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-text"
          >
            {enviando ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} ou
            enviar a Arte pronta do designer (PNG/JPG/PDF)
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,380px)_1fr]">
          {/* Mock do feed */}
          <div className="overflow-hidden rounded-xl border border-border bg-white text-[#1c1b1e]">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4c0dff] text-[11px] font-bold text-white">
                S
              </div>
              <div className="text-xs font-semibold">
                {post.canal === "instagram" ? "stage.consulting" : "Stage Consulting"}
              </div>
            </div>
            <div className={`relative bg-[#f2f2f2] ${vertical ? "aspect-[9/16]" : "aspect-[4/5]"}`}>
              <img
                src={arquivoUrl(slides[idx], versao)}
                alt={`Slide ${idx + 1}`}
                className="h-full w-full object-cover"
              />
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
                  <span
                    key={i}
                    className={`h-1.5 w-1.5 rounded-full ${
                      i === idx ? "bg-[#4c0dff]" : "bg-[#c9c9c9]"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            {post.arte.html && (
              <Link
                href={`/social/${post.pauta.slug}/${post.slug}/editor`}
                aria-disabled={ocupado}
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover ${
                  ocupado ? "pointer-events-none opacity-50" : ""
                }`}
              >
                <PenTool size={15} /> Abrir Editor Visual Manual (Zero Tokens)
              </Link>
            )}

            <div className="flex flex-wrap gap-1.5">
              {slides.map((s, i) => (
                <button
                  key={`${s}-${i}`}
                  onClick={() => setAtual(i)}
                  className={`overflow-hidden rounded-md border-2 ${
                    i === idx ? "border-brand" : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                >
                  <img
                    src={arquivoUrl(s, versao)}
                    alt={`Miniatura ${i + 1}`}
                    className={`${vertical ? "h-20 w-[45px]" : "h-16 w-[51px]"} object-cover`}
                  />
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-bg p-3">
              <div className="flex items-center justify-between">
                <label
                  className="text-xs font-medium uppercase tracking-wider text-muted"
                  htmlFor="ajuste"
                >
                  Pedir Ajuste à IA
                </label>
                <span className="inline-flex items-center gap-1 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium text-warn">
                  <Coins size={10} /> Consome créditos IA
                </span>
              </div>
              <textarea
                id="ajuste"
                value={ajuste}
                onChange={(e) => setAjuste(e.target.value)}
                rows={3}
                placeholder={`Ex.: "slide ${idx + 1} com fundo claro" ou "título da capa maior"`}
                className="mt-2 w-full rounded-lg border border-border bg-surface p-2.5 text-sm outline-none focus:border-brand"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => void gerar(ajuste)}
                  disabled={!ajuste.trim() || ocupado || !roteiroAprovado}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  <Wand2 size={13} /> Aplicar Ajuste com IA
                </button>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        "Gerar do zero substitui a Arte atual. A versão anterior permanece salva no histórico do post. Continuar?"
                      )
                    ) {
                      void gerar();
                    }
                  }}
                  disabled={ocupado || !roteiroAprovado}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-text disabled:opacity-50"
                >
                  <RefreshCw size={13} /> Gerar do Zero
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
                {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}{" "}
                Enviar Arte do designer
              </button>
            </div>
            <p className="text-xs text-muted">
              Os slides renderizados são salvos no Azure Blob Storage e o histórico de versões HTML fica registrado no banco.
            </p>
          </div>
        </div>
      )}

      {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}
    </section>
  );
}
