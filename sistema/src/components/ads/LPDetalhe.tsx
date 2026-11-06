"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Code2,
  Coins,
  Copy,
  Download,
  ExternalLink,
  FileEdit,
  Gauge,
  Globe,
  Loader2,
  Monitor,
  RefreshCw,
  Rocket,
  Save,
  Smartphone,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";
import type { CustomDomainWithInstructions } from "@/lib/domains";
import type { LandingPage, StatusLP } from "@/lib/lp";
import type { SeoAnalysisReport } from "@/lib/seo-analyzer";
import { lerStreamClaude } from "@/lib/stream-client";
import { DomainSetupModal } from "@/components/site/DomainSetupModal";
import { ProgressoIA, escrevendo, lendo, pensando, useProgressoIA } from "../ProgressoIA";
import { FINALIDADE_LP_OPCOES, SERVICO_LABEL, getLocalizedStatusLpLabel, getLocalizedFinalidadeOpcoes } from "./labels";
import { useI18n } from "@/lib/use-i18n";

const STATUS: { valor: StatusLP; cor: string }[] = [
  { valor: "rascunho", cor: "bg-surface-2 text-muted" },
  { valor: "aprovada", cor: "bg-brand/15 text-brand-soft" },
  { valor: "publicada", cor: "bg-ok/15 text-ok" },
];

const CHIPS_IA = [
  "Tornar copy mais persuasiva",
  "Encurtar textos",
  "Focar em prova social",
] as const;

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

type ModoEditor = "preview" | "visual" | "codigo";

export function LPDetalhe({
  inicial,
  campanhas,
  gerarAoAbrir,
  dominiosIniciais,
  fallbackDomainInicial,
}: {
  inicial: LandingPage;
  campanhas: { slug: string; titulo: string }[];
  gerarAoAbrir: boolean;
  dominiosIniciais?: CustomDomainWithInstructions[];
  fallbackDomainInicial?: string;
}) {
  const router = useRouter();
  const { dict, locale } = useI18n();
  const [lp, setLp] = useState(inicial);
  const [mobile, setMobile] = useState(false);
  const [modoEditor, setModoEditor] = useState<ModoEditor>("preview");
  const [htmlManual, setHtmlManual] = useState(inicial.draftHtml ?? "");
  const [salvandoManual, setSalvandoManual] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [copiadoUrl, setCopiadoUrl] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const progresso = useProgressoIA(lp.versao ? ETAPAS_AJUSTE : ETAPAS_GERAR);
  const rodando = progresso.estado !== null;
  const [ajuste, setAjuste] = useState("");
  const [erro, setErro] = useState("");
  const [avisoSucesso, setAvisoSucesso] = useState("");
  const [seoReport, setSeoReport] = useState<SeoAnalysisReport | null>(
    inicial.seoMetadata && typeof inicial.seoMetadata === "object" && "score" in inicial.seoMetadata
      ? (inicial.seoMetadata as unknown as SeoAnalysisReport)
      : null
  );
  const [auditandoSeo, setAuditandoSeo] = useState(false);

  const [fallbackDomain, setFallbackDomain] = useState(fallbackDomainInicial || "");
  const [customDomains, setCustomDomains] = useState<CustomDomainWithInstructions[]>(
    dominiosIniciais || []
  );
  const [selectedDomainId, setSelectedDomainId] = useState<string>(
    inicial.customDomainId ?? ""
  );

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

  const atualizarSeo = useCallback(async () => {
    setAuditandoSeo(true);
    setErro("");
    try {
      const res = await fetch(`${base}/seo`, { method: "POST" });
      if (res.ok) {
        const rep = (await res.json()) as SeoAnalysisReport;
        setSeoReport(rep);
      }
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setAuditandoSeo(false);
    }
  }, [base]);

  const carregarDominios = useCallback(async () => {
    try {
      const res = await fetch("/api/domains");
      if (res.ok) {
        const data = (await res.json()) as {
          fallbackDomain: string;
          customDomains: CustomDomainWithInstructions[];
        };
        setFallbackDomain(data.fallbackDomain);
        setCustomDomains(data.customDomains);
      }
    } catch {
      // ignora
    }
  }, []);

  useEffect(() => {
    void carregarDominios();
  }, [carregarDominios]);

  useEffect(() => {
    if (lp.versao > 0) {
      void carregarSeo();
    }
  }, [lp.versao, carregarSeo]);

  // Ativa/desativa contentEditable dentro do iframe quando o usuário entra no modo "visual"
  const sincronizarModoVisualIframe = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !doc.body) return;
    if (modoEditor === "visual") {
      doc.body.contentEditable = "true";
      doc.body.style.outline = "2px dashed rgba(99, 102, 241, 0.5)";
      doc.body.style.outlineOffset = "-4px";
    } else {
      doc.body.contentEditable = "false";
      doc.body.style.outline = "";
      doc.body.style.outlineOffset = "";
    }
  }, [modoEditor]);

  useEffect(() => {
    sincronizarModoVisualIframe();
  }, [modoEditor, sincronizarModoVisualIframe]);

  async function gerar(pedido?: string) {
    progresso.iniciar();
    setErro("");
    setAvisoSucesso("");
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

  async function salvar(m: Record<string, unknown>, method: "PUT" | "PATCH" = "PATCH") {
    setErro("");
    setAvisoSucesso("");
    const res = await fetch(base, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(m),
    });
    const json = await res.json();
    if (!res.ok) {
      setErro(json.error ?? "erro ao salvar");
      return null;
    } else {
      setLp(json);
      if (typeof json.draftHtml === "string") setHtmlManual(json.draftHtml);
      return json as LandingPage;
    }
  }

  async function salvarEdicaoManual() {
    setSalvandoManual(true);
    setErro("");
    setAvisoSucesso("");
    try {
      let htmlParaSalvar = htmlManual;
      if (modoEditor === "visual") {
        const doc = iframeRef.current?.contentDocument;
        if (doc && doc.documentElement) {
          doc.body.removeAttribute("contenteditable");
          doc.body.style.outline = "";
          doc.body.style.outlineOffset = "";
          htmlParaSalvar = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
          setHtmlManual(htmlParaSalvar);
        }
      }
      const atualizado = await salvar({ draftHtml: htmlParaSalvar }, "PUT");
      if (atualizado) {
        setModoEditor("preview");
        await carregarSeo();
        setAvisoSucesso("Edição manual salva com sucesso (0 créditos consumidos).");
      }
    } finally {
      setSalvandoManual(false);
    }
  }

  async function publicarLpOnline() {
    setPublicando(true);
    setErro("");
    setAvisoSucesso("");
    try {
      const res = await fetch(`${base}/publicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customDomainId: selectedDomainId || null,
          trackingConfig: {
            gtmId: gtmId.trim() || null,
            hotjarId: hotjarId.trim() || null,
            metaPixelId: metaPixelId.trim() || null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao publicar LP");
      if (json.lp) setLp(json.lp);
      if (json.seoReport) setSeoReport(json.seoReport);
      setAvisoSucesso(`LP publicada online em ${json.publicUrl}`);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setPublicando(false);
    }
  }

  async function despublicarLp() {
    setPublicando(true);
    setErro("");
    setAvisoSucesso("");
    try {
      const res = await fetch(`${base}/publicar`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao despublicar LP");
      if (json.lp) setLp(json.lp);
      setAvisoSucesso("LP despublicada e retornada para rascunho.");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setPublicando(false);
    }
  }

  const ocupado = rodando || salvandoManual || publicando;
  const campanhaTitulo =
    campanhas.find((c) => c.slug === lp.campanha)?.titulo ?? lp.campanha;

  const dominioEscolhido = customDomains.find((d) => d.id === selectedDomainId);
  const urlPublicaCalculada =
    lp.urlPublicada ||
    (dominioEscolhido
      ? `https://${dominioEscolhido.domain}/${lp.slug}`
      : `https://${fallbackDomain || "stage-consulting.lp.stage.consult"}/${lp.slug}`);

  const melhoriasRecomendadas = seoReport
    ? seoReport.checklist.filter((item) => !item.passed)
    : [];

  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col px-4 py-6">
      <Link
        href="/site"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={15} /> {dict.ads.breadcrumbSite}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-brand-soft">
            {lp.finalidade === "site" ? dict.ads.pageOfSite : dict.ads.lpAds} ·{" "}
            {SERVICO_LABEL[lp.servico]}
            {lp.campanha && (
              <>
                {" · "}
                <Link
                  href={`/leads/campanhas/${lp.campanha}`}
                  className="hover:underline"
                >
                  {dict.ads.campaignLabel} {campanhaTitulo}
                </Link>
              </>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{lp.titulo}</h1>
          <p className="text-xs text-muted">
            {dict.ads.publicAddress} /{lp.slug} · {lp.viewsCount ?? 0} {dict.ads.viewsCount} ·{" "}
            {lp.leadsCount ?? 0} {dict.ads.leadsCaptured}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DomainSetupModal onCloseChanged={() => void carregarDominios()} />
          <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
            {STATUS.map((s) => (
              <button
                key={s.valor}
                onClick={() => void salvar({ status: s.valor })}
                className={`rounded-md px-2.5 py-1 text-xs ${
                  lp.status === s.valor
                    ? `${s.cor} font-medium`
                    : "text-muted hover:text-text"
                }`}
              >
                {getLocalizedStatusLpLabel(s.valor, dict)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}
      {avisoSucesso && <p className="mt-3 text-sm text-ok">{avisoSucesso}</p>}

      <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex min-h-[72vh] flex-col overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <span className="flex-1 truncate text-xs text-muted">
              {modoEditor === "codigo"
                ? dict.ads.editorHtmlManual
                : modoEditor === "visual"
                  ? dict.ads.editorVisualMode
                  : `${dict.ads.previewTab} · /${lp.slug}`}
            </span>

            {lp.versao > 0 && (
              <div className="flex items-center gap-1 rounded-lg border border-border bg-bg p-0.5">
                <button
                  type="button"
                  onClick={() => setModoEditor("preview")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    modoEditor === "preview"
                      ? "bg-surface-2 text-text"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {dict.ads.previewTab}
                </button>
                <button
                  type="button"
                  onClick={() => setModoEditor("visual")}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                    modoEditor === "visual"
                      ? "bg-brand text-white"
                      : "text-muted hover:text-text"
                  }`}
                >
                  <FileEdit size={12} /> {dict.ads.editTextTab}
                </button>
                <button
                  type="button"
                  onClick={() => setModoEditor("codigo")}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                    modoEditor === "codigo"
                      ? "bg-brand text-white"
                      : "text-muted hover:text-text"
                  }`}
                >
                  <Code2 size={12} /> {dict.ads.editHtmlTab}
                </button>
              </div>
            )}

            {modoEditor !== "preview" && lp.versao > 0 && (
              <button
                type="button"
                onClick={() => void salvarEdicaoManual()}
                disabled={salvandoManual}
                className="flex items-center gap-1.5 rounded-lg bg-ok px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {salvandoManual ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Save size={13} />
                )}
                {dict.ads.saveManualEdit}
              </button>
            )}

            {modoEditor !== "codigo" && (
              <div className="flex rounded-md bg-bg p-0.5">
                {[
                  { on: false, icon: Monitor, label: dict.ads.desktop },
                  { on: true, icon: Smartphone, label: dict.ads.mobile },
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
                title={dict.ads.openNewTab}
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
                  titulo={lp.versao ? dict.ads.adjustingLp : dict.ads.generatingLp}
                  progresso={progresso}
                  aviso={`${
                    lp.versao ? "" : "A página é longa. "
                  }${dict.ads.doNotLeavePage}`}
                />
              </div>
            ) : modoEditor === "codigo" ? (
              <div className="flex h-full w-full flex-col p-3">
                <textarea
                  value={htmlManual}
                  onChange={(e) => setHtmlManual(e.target.value)}
                  className="min-h-[58vh] flex-1 rounded-lg border border-border bg-surface p-3 font-mono text-xs text-text outline-none focus:border-brand"
                />
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted">
                    {dict.ads.manualHtmlNotice}
                  </span>
                  <button
                    type="button"
                    onClick={() => void salvarEdicaoManual()}
                    disabled={salvandoManual}
                    className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
                  >
                    {salvandoManual ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    {dict.ads.saveManualEdit}
                  </button>
                </div>
              </div>
            ) : lp.versao > 0 ? (
              <iframe
                ref={iframeRef}
                key={lp.versao}
                src={`/api/lp-preview/${lp.slug}?v=${lp.versao}`}
                title={`Preview ${lp.titulo}`}
                onLoad={sincronizarModoVisualIframe}
                sandbox="allow-same-origin allow-scripts allow-forms"
                className={`h-full border-0 bg-white ${
                  mobile ? "w-[390px] border-x border-border" : "w-full"
                }`}
              />
            ) : (
              <div className="m-auto flex flex-col items-center gap-3 p-6 text-center text-sm text-muted">
                {dict.ads.lpNotGeneratedYet}
                <button
                  onClick={() => void gerar()}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-hover"
                >
                  <Sparkles size={15} /> {dict.ads.generateLpWithAi}
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4 overflow-y-auto pr-1">
          {/* Painel de Publicação Online, Domínio & Tracking */}
          <div className="rounded-xl border border-brand/30 bg-surface p-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-soft">
                <Rocket size={14} /> {dict.ads.publishPanelTitle}
              </h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  lp.status === "publicada"
                    ? "bg-ok/15 text-ok"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {lp.status === "publicada" ? dict.ads.statusOnline : dict.ads.statusDraftBadge}
              </span>
            </div>

            <div className="mt-3 space-y-3 text-xs">
              <label className="block text-muted">
                {dict.ads.publishDomain}
                <select
                  value={selectedDomainId}
                  onChange={(e) => setSelectedDomainId(e.target.value)}
                  disabled={ocupado}
                  className="mt-1 w-full rounded-lg border border-border bg-bg px-2.5 py-2 text-xs text-text outline-none focus:border-brand"
                >
                  <option value="">
                    {dict.ads.freeSubdomain} ({fallbackDomain || `${lp.slug}.lp.stage.consult`})
                  </option>
                  {customDomains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.domain} ({d.dnsStatus === "VERIFIED" ? "DNS OK" : "DNS Pendente"})
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-2 pt-1">
                <label className="block text-muted">
                  GTM ID (GTM-XXXX)
                  <input
                    value={gtmId}
                    onChange={(e) => setGtmId(e.target.value)}
                    placeholder="GTM-5NDZ8J6"
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
                <label className="block text-muted">
                  Meta Pixel ID
                  <input
                    value={metaPixelId}
                    onChange={(e) => setMetaPixelId(e.target.value)}
                    placeholder="Ex.: 1234567890"
                    className="mt-1 w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text outline-none focus:border-brand"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => void publicarLpOnline()}
                disabled={ocupado || !lp.versao}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {publicando ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Globe size={14} />
                )}
                {lp.status === "publicada" ? dict.ads.updateOnlineBtn : dict.ads.publishOnlineBtn}
              </button>

              {lp.status === "publicada" && (
                <div className="space-y-2 rounded-lg border border-ok/30 bg-ok/10 p-2.5">
                  <div className="text-[11px] font-medium text-ok">{dict.ads.activePublicLink}</div>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={urlPublicaCalculada}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 truncate font-mono text-[11px] text-text underline hover:text-brand-soft"
                    >
                      {urlPublicaCalculada}
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(urlPublicaCalculada);
                        setCopiadoUrl(true);
                        setTimeout(() => setCopiadoUrl(false), 1500);
                      }}
                      className="rounded border border-border bg-surface p-1.5 text-muted hover:text-text"
                      title={dict.ads.copyPublicLink}
                    >
                      {copiadoUrl ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void despublicarLp()}
                    disabled={ocupado}
                    className="w-full rounded border border-border bg-surface py-1 text-[11px] text-muted hover:text-danger"
                  >
                    {dict.ads.unpublishBtn}
                  </button>
                </div>
              )}

              <a
                href={`/api/lp/${lp.slug}/download`}
                aria-disabled={!lp.versao}
                className={`flex items-center justify-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-muted hover:border-brand/50 hover:text-text ${
                  lp.versao ? "" : "pointer-events-none opacity-40"
                }`}
              >
                <Download size={13} /> {dict.ads.downloadStandaloneHtml}
              </a>
            </div>
          </div>

          {/* Card Analisador SEO em Tempo Real (0-100 + Melhorias Recomendadas) */}
          {seoReport ? (
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
                  <Gauge size={14} className="text-brand-soft" /> {dict.ads.seoDiagnostics}
                </h3>
                <div className="flex items-center gap-2">
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
                  <button
                    type="button"
                    onClick={() => void atualizarSeo()}
                    disabled={auditandoSeo}
                    className="flex items-center gap-1 rounded-md border border-border bg-bg px-2 py-1 text-[11px] text-muted hover:text-text disabled:opacity-50"
                  >
                    {auditandoSeo ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    {dict.common.refresh}
                  </button>
                </div>
              </div>

              {melhoriasRecomendadas.length > 0 && (
                <div className="mt-2.5 rounded-lg border border-warn/30 bg-warn/10 p-2.5 text-[11px]">
                  <div className="font-semibold text-warn">
                    {dict.ads.recommendedImprovements} ({melhoriasRecomendadas.length}):
                  </div>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-muted">
                    {melhoriasRecomendadas.map((m) => (
                      <li key={m.id}>
                        <strong className="text-text">{m.label}:</strong> {m.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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
          ) : (
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
                    <Gauge size={14} className="text-brand-soft" /> {dict.ads.seoDiagnostics}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted">{dict.ads.seoAuditNotice}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void atualizarSeo()}
                  disabled={auditandoSeo || !lp.versao}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  {auditandoSeo ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Gauge size={13} />
                  )}
                  {dict.ads.runSeoAudit}
                </button>
              </div>
            </div>
          )}

          {/* Edição Assistida por IA (Com chips rápidos e aviso explícito de créditos) */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <label
                className="text-xs font-medium uppercase tracking-wider text-muted"
                htmlFor="ajuste-lp"
              >
                {dict.ads.requestAiAdjustment}
              </label>
              <span className="inline-flex items-center gap-1 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium text-warn">
                <Coins size={11} /> {dict.ads.consumesAiCredits}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {[dict.ads.chipPersuasive, dict.ads.chipShorten, dict.ads.chipSocialProof].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setAjuste(chip)}
                  disabled={ocupado}
                  className="rounded-full border border-border bg-bg px-2.5 py-1 text-[11px] text-muted transition hover:border-brand/50 hover:text-text"
                >
                  + {chip}
                </button>
              ))}
            </div>

            <textarea
              id="ajuste-lp"
              value={ajuste}
              onChange={(e) => setAjuste(e.target.value)}
              rows={3}
              placeholder='Ex.: "headline mais direta", "remover FAQ" ou selecione uma sugestão acima'
              className="mt-2 w-full rounded-lg border border-border bg-bg p-3 text-sm outline-none focus:border-brand"
            />
            <p className="mt-1.5 text-[11px] text-muted">
              {dict.ads.creditsWarning}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                onClick={() => void gerar(ajuste)}
                disabled={!ajuste.trim() || ocupado || !lp.versao}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                <Wand2 size={13} /> {dict.ads.applyAiAdjustment}
              </button>
              <button
                onClick={() => void gerar()}
                disabled={ocupado}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-text disabled:opacity-50"
              >
                <RefreshCw size={13} /> {dict.ads.regenerateFromScratch}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
              {dict.ads.purposeAndAdsLink}
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
              {getLocalizedFinalidadeOpcoes(dict).map((f) => (
                <button
                  key={f.valor}
                  onClick={() => lp.finalidade !== f.valor && void salvar({ finalidade: f.valor })}
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
              {getLocalizedFinalidadeOpcoes(dict).find((f) => f.valor === lp.finalidade)?.descricao}
            </p>
            {lp.finalidade === "campanha" && (
              <label className="mt-3 block">
                <span className="text-xs text-muted">{dict.ads.linkedAdsCampaign}</span>
                <select
                  value={lp.campanha ?? ""}
                  onChange={(e) => void salvar({ campanha: e.target.value || null })}
                  disabled={ocupado}
                  className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
                >
                  <option value="">{dict.ads.noneForNow}</option>
                  {campanhas.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.titulo}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {lp.briefing && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
                {dict.ads.originalBriefing}
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
