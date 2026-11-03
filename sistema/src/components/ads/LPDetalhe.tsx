"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Code2,
  Download,
  ExternalLink,
  Gauge,
  Monitor,
  RefreshCw,
  Save,
  Smartphone,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";
import type { LandingPage, StatusLP } from "@/lib/lp";
import type { SeoAnalysisReport } from "@/lib/seo-analyzer";
import { lerStreamClaude } from "@/lib/stream-client";
import { ProgressoIA, escrevendo, lendo, pensando, useProgressoIA } from "../ProgressoIA";
import { FINALIDADE_LP_OPCOES, SERVICO_LABEL } from "./labels";

const STATUS: { valor: StatusLP; label: string; cor: string }[] = [
  { valor: "rascunho", label: "Rascunho", cor: "bg-surface-2 text-muted" },
  { valor: "aprovada", label: "Aprovada", cor: "bg-brand/15 text-brand-soft" },
  { valor: "publicada", label: "Publicada", cor: "bg-ok/15 text-ok" },
];

const ETAPAS_GERAR = {
  etapas: [
    { rotulo: "Lendo o serviço, a Campanha e a identidade", quando: lendo },
    { rotulo: "Redigindo as seções e o formulário", quando: pensando },
    { rotulo: "Montando a página (HTML)", quando: escrevendo },
  ],
  estimativaSeg: 180,
};

const ETAPAS_AJUSTE = {
  etapas: [
    { rotulo: "Lendo a página atual e o pedido", quando: lendo },
    { rotulo: "Aplicando o ajuste", quando: escrevendo },
  ],
  estimativaSeg: 120,
};

export function LPDetalhe({
  inicial,
  campanhas,
  gerarAoAbrir,
}: {
  inicial: LandingPage;
  campanhas: { slug: string; titulo: string }[];
  gerarAoAbrir: boolean;
}) {
  const router = useRouter();
  const [lp, setLp] = useState(inicial);
  const [mobile, setMobile] = useState(false);
  const [modoCodigo, setModoCodigo] = useState(false);
  const [htmlManual, setHtmlManual] = useState(inicial.draftHtml ?? "");
  const [salvandoHtml, setSalvandoHtml] = useState(false);

  const progresso = useProgressoIA(lp.versao ? ETAPAS_AJUSTE : ETAPAS_GERAR);
  const rodando = progresso.estado !== null;
  const [ajuste, setAjuste] = useState("");
  const [url, setUrl] = useState(inicial.urlPublicada);
  const [erro, setErro] = useState("");
  const [seoReport, setSeoReport] = useState<SeoAnalysisReport | null>(null);

  const [gtmId, setGtmId] = useState(
    typeof inicial.trackingConfig?.gtmId === "string" ? inicial.trackingConfig.gtmId : ""
  );
  const [hotjarId, setHotjarId] = useState(
    typeof inicial.trackingConfig?.hotjarId === "string" ? inicial.trackingConfig.hotjarId : ""
  );
  const [metaPixelId, setMetaPixelId] = useState(
    typeof inicial.trackingConfig?.metaPixelId === "string"
      ? inicial.trackingConfig.metaPixelId
      : ""
  );

  const iniciou = useRef(false);
  const base = `/api/lp/${lp.slug}`;

  const carregarSeo = useCallback(async () => {
    try {
      const res = await fetch(`${base}/seo`);
      if (res.ok) {
        setSeoReport((await res.json()) as SeoAnalysisReport);
      }
    } catch {
      // ignora
    }
  }, [base]);

  useEffect(() => {
    if (lp.versao > 0) {
      void carregarSeo();
    }
  }, [lp.versao, carregarSeo]);

  async function gerar(pedido?: string) {
    progresso.iniciar();
    setErro("");
    try {
      const res = await fetch(`${base}/gerar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedido ? { ajuste: pedido } : {}),
      });
      if (res.status === 402) {
        const j = await res.json();
        throw new Error(j.error || "Créditos de IA insuficientes");
      }
      await lerStreamClaude(res, progresso.onEvento);
      const atual = await fetch(base);
      if (atual.ok) {
        const updated = (await atual.json()) as LandingPage;
        setLp(updated);
        setHtmlManual(updated.draftHtml ?? "");
      }
      setAjuste("");
      await carregarSeo();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      progresso.parar();
    }
  }

  useEffect(() => {
    if (!gerarAoAbrir) return;
    const t = setTimeout(() => {
      if (iniciou.current) return;
      iniciou.current = true;
      router.replace(`/site/lp/${inicial.slug}`, { scroll: false });
      if (!inicial.versao) void gerar();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispara só na montagem
  }, []);

  async function salvar(m: Record<string, unknown>) {
    setErro("");
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(m),
    });
    const json = await res.json();
    if (!res.ok) setErro(json.error ?? "erro ao salvar");
    else {
      setLp(json);
      if (typeof json.draftHtml === "string") setHtmlManual(json.draftHtml);
    }
  }

  async function salvarEdicaoManualHtml() {
    setSalvandoHtml(true);
    setErro("");
    try {
      await salvar({ draftHtml: htmlManual });
      setModoCodigo(false);
      await carregarSeo();
    } finally {
      setSalvandoHtml(false);
    }
  }

  const ocupado = rodando;
  const campanhaTitulo =
    campanhas.find((c) => c.slug === lp.campanha)?.titulo ?? lp.campanha;

  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col px-4 py-6">
      <Link
        href="/site"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={15} /> Site & LPs
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-brand-soft">
            {lp.finalidade === "site" ? "Página do site" : "Landing Page de Ads"} ·{" "}
            {SERVICO_LABEL[lp.servico]}
            {lp.campanha && (
              <>
                {" · "}
                <Link
                  href={`/leads/campanhas/${lp.campanha}`}
                  className="hover:underline"
                >
                  Campanha: {campanhaTitulo}
                </Link>
              </>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{lp.titulo}</h1>
          <p className="text-xs text-muted">
            Endereço público: /{lp.slug} · {lp.viewsCount ?? 0} visualizações ·{" "}
            {lp.leadsCount ?? 0} leads capturados
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {STATUS.map((s) => (
            <button
              key={s.valor}
              onClick={() => salvar({ status: s.valor })}
              className={`rounded-md px-2.5 py-1 text-xs ${
                lp.status === s.valor
                  ? `${s.cor} font-medium`
                  : "text-muted hover:text-text"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}

      <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_350px]">
        <div className="flex min-h-[70vh] flex-col overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="flex-1 truncate text-sm text-muted">
              {modoCodigo ? `Editor HTML Manual (Sem consumo de créditos IA)` : `Preview · /${lp.slug}`}
            </span>
            {lp.versao > 0 && (
              <button
                type="button"
                onClick={() => setModoCodigo(!modoCodigo)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                  modoCodigo
                    ? "bg-brand text-white"
                    : "border border-border bg-bg text-muted hover:text-text"
                }`}
              >
                <Code2 size={13} /> {modoCodigo ? "Voltar ao Preview" : "Editar HTML"}
              </button>
            )}
            {!modoCodigo && (
              <div className="flex rounded-md bg-bg p-0.5">
                {[
                  { on: false, icon: Monitor, label: "Desktop" },
                  { on: true, icon: Smartphone, label: "Celular" },
                ].map(({ on, icon: Icon, label }) => (
                  <button
                    key={label}
                    onClick={() => setMobile(on)}
                    title={label}
                    className={`rounded px-2 py-1 ${
                      mobile === on
                        ? "bg-surface-2 text-text"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    <Icon size={15} />
                  </button>
                ))}
              </div>
            )}
            {lp.versao > 0 && (
              <a
                href={`/api/lp-preview/${lp.slug}?v=${lp.versao}`}
                target="_blank"
                rel="noreferrer"
                title="Abrir em nova aba"
                className="rounded p-1.5 text-muted hover:text-text"
              >
                <ExternalLink size={15} />
              </a>
            )}
          </div>
          <div className="flex min-h-0 flex-1 justify-center bg-bg">
            {rodando ? (
              <div className="m-auto w-full max-w-md p-6">
                <ProgressoIA
                  titulo={`O Claude está ${lp.versao ? "ajustando" : "escrevendo"} a LP`}
                  progresso={progresso}
                  aviso={`${
                    lp.versao ? "" : "A página é longa. "
                  }Não saia desta página, senão a geração é cancelada.`}
                />
              </div>
            ) : modoCodigo ? (
              <div className="flex h-full w-full flex-col p-3">
                <textarea
                  value={htmlManual}
                  onChange={(e) => setHtmlManual(e.target.value)}
                  className="min-h-[55vh] flex-1 rounded-lg border border-border bg-surface p-3 font-mono text-xs text-text outline-none focus:border-brand"
                />
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted">
                    Edições manuais de HTML são salvas direto no banco sem consumir créditos de IA.
                  </span>
                  <button
                    type="button"
                    onClick={() => void salvarEdicaoManualHtml()}
                    disabled={salvandoHtml}
                    className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
                  >
                    <Save size={14} /> Salvar HTML Manualmente
                  </button>
                </div>
              </div>
            ) : lp.versao > 0 ? (
              <iframe
                key={lp.versao}
                src={`/api/lp-preview/${lp.slug}?v=${lp.versao}`}
                title={`Preview ${lp.titulo}`}
                sandbox="allow-scripts allow-forms"
                className={`h-full border-0 bg-white ${
                  mobile ? "w-[390px] border-x border-border" : "w-full"
                }`}
              />
            ) : (
              <div className="m-auto flex flex-col items-center gap-3 p-6 text-center text-sm text-muted">
                A LP ainda não foi gerada.
                <button
                  onClick={() => gerar()}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-hover"
                >
                  <Sparkles size={15} /> Gerar LP com IA
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4 overflow-y-auto">
          {/* Card Analisador SEO (0-100 + Checklist Medido vs Estimado) */}
          {seoReport && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
                  <Gauge size={14} className="text-brand-soft" /> Score SEO & Conversão
                </h3>
                <span
                  className={`rounded-lg px-2.5 py-0.5 text-xs font-bold ${
                    seoReport.score >= 80
                      ? "bg-ok/15 text-ok"
                      : seoReport.score >= 55
                        ? "bg-warn/15 text-warn"
                        : "bg-danger/15 text-danger"
                  }`}
                >
                  {seoReport.score}/100 ({seoReport.grade})
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {seoReport.checklist.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border bg-bg p-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-medium text-text">
                        {item.passed ? (
                          <CheckCircle2 size={13} className="shrink-0 text-ok" />
                        ) : (
                          <XCircle size={13} className="shrink-0 text-warn" />
                        )}
                        <span>{item.label}</span>
                      </div>
                      <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-muted">
                        {item.evaluationType === "measured" ? "Medido" : "Estimado"}
                      </span>
                    </div>
                    <p className="mt-1 pl-5 text-[11px] text-muted">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
              Finalidade
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
              {FINALIDADE_LP_OPCOES.map((f) => (
                <button
                  key={f.valor}
                  onClick={() => lp.finalidade !== f.valor && salvar({ finalidade: f.valor })}
                  disabled={ocupado}
                  className={`rounded-md px-2 py-1.5 text-xs ${
                    lp.finalidade === f.valor
                      ? "bg-surface-2 font-medium text-text"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {FINALIDADE_LP_OPCOES.find((f) => f.valor === lp.finalidade)?.descricao}
            </p>
            {lp.finalidade === "campanha" && (
              <label className="mt-3 block">
                <span className="text-xs text-muted">Campanha atrelada</span>
                <select
                  value={lp.campanha ?? ""}
                  onChange={(e) => salvar({ campanha: e.target.value || null })}
                  disabled={ocupado}
                  className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
                >
                  <option value="">Nenhuma por enquanto</option>
                  {campanhas.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.titulo}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <label
              className="text-xs font-medium uppercase tracking-wider text-muted"
              htmlFor="ajuste-lp"
            >
              Pedir ajuste à IA
            </label>
            <textarea
              id="ajuste-lp"
              value={ajuste}
              onChange={(e) => setAjuste(e.target.value)}
              rows={3}
              placeholder='Ex.: "headline mais direta" ou "tirar a seção de FAQ" ou "formulário com menos campos"'
              className="mt-2 w-full rounded-lg border border-border bg-bg p-3 text-sm outline-none focus:border-brand"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => gerar(ajuste)}
                disabled={!ajuste.trim() || ocupado || !lp.versao}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                <Wand2 size={14} /> Aplicar ajuste
              </button>
              <button
                onClick={() => gerar()}
                disabled={ocupado}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-text disabled:opacity-50"
              >
                <RefreshCw size={14} /> Gerar do zero
              </button>
            </div>
          </div>

          {/* Pixels e Rastreamento */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
              Pixels & Tracking (Injetados na LP Pública)
            </h3>
            <div className="mt-2 space-y-2 text-xs">
              <label className="block text-muted">
                Google Tag Manager (GTM-XXXX)
                <input
                  value={gtmId}
                  onChange={(e) => setGtmId(e.target.value)}
                  placeholder="GTM-5NDZ8J6"
                  className="mt-1 w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text outline-none focus:border-brand"
                />
              </label>
              <label className="block text-muted">
                Meta Pixel ID
                <input
                  value={metaPixelId}
                  onChange={(e) => setMetaPixelId(e.target.value)}
                  placeholder="Ex.: 1234567890"
                  className="mt-1 w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text outline-none focus:border-brand"
                />
              </label>
              <label className="block text-muted">
                Hotjar Site ID
                <input
                  value={hotjarId}
                  onChange={(e) => setHotjarId(e.target.value)}
                  placeholder="Ex.: 3819201"
                  className="mt-1 w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text outline-none focus:border-brand"
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  salvar({
                    trackingConfig: {
                      gtmId: gtmId.trim() || null,
                      metaPixelId: metaPixelId.trim() || null,
                      hotjarId: hotjarId.trim() || null,
                    },
                  })
                }
                className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 font-medium text-text hover:border-brand/50"
              >
                Salvar Pixels
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
              Publicar & Exportar
            </h3>
            <a
              href={`/api/lp/${lp.slug}/download`}
              aria-disabled={!lp.versao}
              className={`mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:border-brand/50 ${
                lp.versao ? "" : "pointer-events-none opacity-40"
              }`}
            >
              <Download size={14} /> Baixar HTML Autocontido
            </a>
            <label className="mt-4 block">
              <span className="text-xs text-muted">URL publicada</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            {url !== lp.urlPublicada && (
              <button
                onClick={() => salvar({ urlPublicada: url })}
                className="mt-2 w-full rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
              >
                Salvar URL
              </button>
            )}
          </div>

          {lp.briefing && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
                Briefing
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                {lp.briefing}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
