"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Palette,
  Globe,
  Mail,
  Sparkles,
  Check,
  Loader2,
  Upload,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

type VisualGuide = {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  headingFont?: string;
  bodyFont?: string;
};

export default function OnboardingWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Step 1 fields
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [businessContext, setBusinessContext] = useState("");
  const [toneOfVoice, setToneOfVoice] = useState("");
  const [brandRules, setBrandRules] = useState("");
  const [currentFocus, setCurrentFocus] = useState("");

  // Step 2 fields
  const [logoBlobUrl, setLogoBlobUrl] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [visualGuide, setVisualGuide] = useState<VisualGuide>({
    primaryColor: "#A68A3E",
    secondaryColor: "#141414",
    accentColor: "#D4AF37",
    backgroundColor: "#0A0A0A",
    headingFont: "Cormorant Garamond",
    bodyFont: "Plus Jakarta Sans",
  });

  // Step 3 fields
  const [domainInput, setDomainInput] = useState("");
  const [dnsProviderHint, setDnsProviderHint] = useState("cloudflare");
  const [savedDomain, setSavedDomain] = useState<{
    domain: string;
    cnameTarget: string;
    verificationToken: string;
    dnsStatus: string;
  } | null>(null);

  // Step 4 fields
  const [destEmailsText, setDestEmailsText] = useState("");
  const [useStageFallback, setUseStageFallback] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/onboarding");
        if (res.ok) {
          const data = await res.json();
          setTenantName(data.tenant?.name ?? "");
          setTenantSlug(data.tenant?.slug ?? "workspace");
          setWebsiteUrl(data.brandProfile?.websiteUrl ?? "");
          setBusinessContext(data.brandProfile?.businessContext ?? "");
          setToneOfVoice(data.brandProfile?.toneOfVoice ?? "");
          setBrandRules(data.brandProfile?.brandRules ?? "");
          setCurrentFocus(data.brandProfile?.currentFocus ?? "");
          setLogoBlobUrl(data.brandProfile?.logoBlobUrl ?? null);
          if (data.brandProfile?.visualGuideJson && typeof data.brandProfile.visualGuideJson === "object") {
            setVisualGuide((prev) => ({ ...prev, ...(data.brandProfile.visualGuideJson as VisualGuide) }));
          }
          if (data.customDomain) {
            setSavedDomain(data.customDomain);
            setDomainInput(data.customDomain.domain);
          }
          if (Array.isArray(data.emailConfig?.leadDestinationEmails)) {
            setDestEmailsText(data.emailConfig.leadDestinationEmails.join(", "));
          }
          if (typeof data.emailConfig?.useStageFallback === "boolean") {
            setUseStageFallback(data.emailConfig.useStageFallback);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function extractSiteDesign() {
    if (!websiteUrl.trim()) {
      setError("Informe a URL do site para extrair a identidade.");
      return;
    }
    setExtracting(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/brand/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl.trim(), saveToProfile: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao extrair design do site");
      const tokens = json.tokens;
      if (tokens) {
        setVisualGuide((prev) => ({
          ...prev,
          primaryColor: tokens.colors?.[0] ?? prev.primaryColor,
          secondaryColor: tokens.colors?.[1] ?? prev.secondaryColor,
          accentColor: tokens.colors?.[2] ?? prev.accentColor,
          backgroundColor: tokens.backgroundColor ?? prev.backgroundColor,
          headingFont: tokens.fonts?.[0] ?? prev.headingFont,
          bodyFont: tokens.fonts?.[1] ?? tokens.fonts?.[0] ?? prev.bodyFont,
        }));
        if (!businessContext.trim() && tokens.description) {
          setBusinessContext(`${tokens.title ? `${tokens.title} — ` : ""}${tokens.description}`);
        }
        setNotice("Identidade visual e metadados extraídos automaticamente do site!");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  async function handleLogoUpload(file: File | null) {
    if (!file) return;
    setUploadingLogo(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("category", "logo");
      const res = await fetch("/api/media", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao enviar logo");
      setLogoBlobUrl(json.asset.blobUrl);
      setLogoPreviewUrl(json.asset.previewUrl);
      setNotice("Logo enviada com sucesso!");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function registerCustomDomain() {
    if (!domainInput.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput.trim(), dnsProviderHint }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao registrar domínio");
      setSavedDomain(json.domain);
      setNotice("Domínio registrado! Configure o CNAME e TXT no seu provedor DNS.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveProgress(complete = false) {
    setSaving(true);
    setError("");
    try {
      const emails = destEmailsText
        .split(/[,\n;]/)
        .map((e) => e.trim())
        .filter(Boolean);
      const res = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantName,
          websiteUrl,
          businessContext,
          toneOfVoice,
          brandRules,
          currentFocus,
          logoBlobUrl,
          visualGuideJson: visualGuide,
          leadDestinationEmails: emails,
          useStageFallback,
          onboardingCompleted: complete,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao salvar onboarding");
      if (complete) {
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand";

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-12 text-sm text-muted">
        <Loader2 size={18} className="mr-2 animate-spin" /> Carregando configuração da marca…
      </div>
    );
  }

  const STEPS = [
    { id: 1, label: "1. Identidade & Negócio", icon: Building2 },
    { id: 2, label: "2. Identidade Visual", icon: Palette },
    { id: 3, label: "3. Domínio de LPs", icon: Globe },
    { id: 4, label: "4. E-mail de Leads", icon: Mail },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <span className="rounded-md bg-brand/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-brand-soft">
          Configuração Inicial do Workspace
        </span>
        <h1 className="mt-2 text-2xl font-semibold">Bem-vindo ao Stage Marketing Hub</h1>
        <p className="text-sm text-muted">
          Configure o cérebro da sua marca em 4 passos rápidos para que a IA produza LPs, anúncios e conteúdo com a sua identidade.
        </p>
      </div>

      {/* Stepper */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map(({ id, label, icon: Icon }) => {
          const active = step === id;
          const done = step > id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setStep(id)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${
                active
                  ? "border-brand bg-brand/15 text-brand-soft"
                  : done
                    ? "border-ok/40 bg-ok/10 text-ok"
                    : "border-border bg-surface text-muted hover:text-text"
              }`}
            >
              {done ? <Check size={14} /> : <Icon size={14} />}
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">{error}</div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-xs text-ok">{notice}</div>
      )}

      <div className="rounded-2xl border border-border bg-surface p-6 shadow-xl">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Passo 1 — Identidade e Negócio</h2>
            <p className="text-xs text-muted">
              Essas informações alimentam todos os System Prompts de Landing Pages, Google Ads, Roteiros e Copywriting.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-muted">Nome da Marca / Empresa *</span>
                <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} className={input} />
              </label>

              <div className="block">
                <span className="text-xs font-medium text-muted">Site atual (opcional, extração automática)</span>
                <div className="mt-1 flex gap-2">
                  <input
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://suaempresa.com.br"
                    className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={extractSiteDesign}
                    disabled={extracting}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/15 px-3 py-2 text-xs font-medium text-brand-soft hover:bg-brand/25 disabled:opacity-50"
                  >
                    {extracting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    Extrair do Site
                  </button>
                </div>
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-muted">O que sua empresa faz, público-alvo e proposta de valor *</span>
              <textarea
                value={businessContext}
                onChange={(e) => setBusinessContext(e.target.value)}
                rows={4}
                placeholder="Descreva os serviços/produtos, cliente ideal (ICP), dores que resolve e diferenciais competitivos…"
                className={`${input} resize-none`}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-muted">Tom de Voz da Marca</span>
                <textarea
                  value={toneOfVoice}
                  onChange={(e) => setToneOfVoice(e.target.value)}
                  rows={3}
                  placeholder="Ex.: Consultivo, executivo, direto ao ponto, sem jargões vazios…"
                  className={`${input} resize-none`}
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted">Regras Editoriais & Palavras Proibidas</span>
                <textarea
                  value={brandRules}
                  onChange={(e) => setBrandRules(e.target.value)}
                  rows={3}
                  placeholder="Ex.: Nunca prometer resultados irreais; evitar clichês de marketing…"
                  className={`${input} resize-none`}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-muted">Foco Estratégico Atual (Trimestre / Mês)</span>
              <textarea
                value={currentFocus}
                onChange={(e) => setCurrentFocus(e.target.value)}
                rows={2}
                placeholder="Ex.: Gerar leads qualificados B2B para consultoria de IA e diagnóstico executivo."
                className={`${input} resize-none`}
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Passo 2 — Identidade Visual</h2>
            <p className="text-xs text-muted">
              Cores, tipografia e logo usadas automaticamente na geração de Landing Pages e nos slides do Instagram/LinkedIn.
            </p>

            <div className="rounded-xl border border-dashed border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">Logo da Marca</div>
                  <div className="text-xs text-muted">PNG, SVG ou WEBP com fundo transparente recomendado.</div>
                  {logoBlobUrl && <div className="mt-1 font-mono text-[11px] text-ok">Logo configurada: {logoBlobUrl}</div>}
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs font-medium hover:bg-brand hover:text-white">
                  {uploadingLogo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploadingLogo ? "Enviando…" : "Enviar Logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => handleLogoUpload(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
              </div>
              {logoPreviewUrl && (
                <div className="mt-3 flex h-16 items-center justify-center rounded-lg bg-bg p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoPreviewUrl} alt="Logo preview" className="max-h-12 object-contain" />
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="text-xs font-medium text-muted">Cor Primária</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={visualGuide.primaryColor || "#A68A3E"}
                    onChange={(e) => setVisualGuide({ ...visualGuide, primaryColor: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border border-border bg-bg"
                  />
                  <input
                    value={visualGuide.primaryColor || ""}
                    onChange={(e) => setVisualGuide({ ...visualGuide, primaryColor: e.target.value })}
                    className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-mono text-xs"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted">Cor Secundária</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={visualGuide.secondaryColor || "#141414"}
                    onChange={(e) => setVisualGuide({ ...visualGuide, secondaryColor: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border border-border bg-bg"
                  />
                  <input
                    value={visualGuide.secondaryColor || ""}
                    onChange={(e) => setVisualGuide({ ...visualGuide, secondaryColor: e.target.value })}
                    className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-mono text-xs"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted">Cor de Destaque (CTA)</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={visualGuide.accentColor || "#D4AF37"}
                    onChange={(e) => setVisualGuide({ ...visualGuide, accentColor: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border border-border bg-bg"
                  />
                  <input
                    value={visualGuide.accentColor || ""}
                    onChange={(e) => setVisualGuide({ ...visualGuide, accentColor: e.target.value })}
                    className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-mono text-xs"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted">Cor de Fundo</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={visualGuide.backgroundColor || "#0A0A0A"}
                    onChange={(e) => setVisualGuide({ ...visualGuide, backgroundColor: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border border-border bg-bg"
                  />
                  <input
                    value={visualGuide.backgroundColor || ""}
                    onChange={(e) => setVisualGuide({ ...visualGuide, backgroundColor: e.target.value })}
                    className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-mono text-xs"
                  />
                </div>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-muted">Fonte de Títulos (Google Fonts)</span>
                <input
                  value={visualGuide.headingFont || ""}
                  onChange={(e) => setVisualGuide({ ...visualGuide, headingFont: e.target.value })}
                  placeholder="Ex.: Cormorant Garamond, Playfair Display, Inter"
                  className={input}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted">Fonte de Corpo (Google Fonts)</span>
                <input
                  value={visualGuide.bodyFont || ""}
                  onChange={(e) => setVisualGuide({ ...visualGuide, bodyFont: e.target.value })}
                  placeholder="Ex.: Plus Jakarta Sans, Inter, DM Sans"
                  className={input}
                />
              </label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Passo 3 — Domínio de Landing Pages</h2>
            <p className="text-xs text-muted">
              Suas LPs podem rodar em um subdomínio próprio (ex.: <code>lp.suaempresa.com.br</code>) ou no subdomínio gratuito{" "}
              <code>{tenantSlug}.lp.stage.consult</code>.
            </p>

            <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
              <input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="Ex.: lp.suaempresa.com.br"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <select
                value={dnsProviderHint}
                onChange={(e) => setDnsProviderHint(e.target.value)}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
              >
                <option value="cloudflare">Cloudflare</option>
                <option value="registrobr">Registro.br</option>
                <option value="godaddy">GoDaddy</option>
                <option value="hostgator">HostGator</option>
              </select>
              <button
                type="button"
                onClick={registerCustomDomain}
                disabled={saving || !domainInput.trim()}
                className="rounded-lg bg-brand px-4 py-2 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                Registrar Domínio
              </button>
            </div>

            {savedDomain && (
              <div className="rounded-xl border border-border bg-bg p-4 text-xs">
                <div className="font-semibold text-brand-soft">Apontamentos DNS para {savedDomain.domain}:</div>
                <div className="mt-2 space-y-1 font-mono">
                  <div>
                    CNAME: <strong>{savedDomain.domain}</strong> → <strong>{savedDomain.cnameTarget}</strong>
                  </div>
                  <div>
                    TXT: <strong>_stage-verify.{savedDomain.domain}</strong> → <strong>{savedDomain.verificationToken}</strong>
                  </div>
                </div>
                <p className="mt-2 text-muted">
                  Você também pode verificar o DNS depois em <strong>Site & LPs → Configurar Domínio</strong>.
                </p>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Passo 4 — E-mail de Notificação de Leads</h2>
            <p className="text-xs text-muted">
              Defina quem recebe os alertas imediatos sempre que um novo lead preencher qualquer formulário nas suas Landing Pages.
            </p>

            <label className="block">
              <span className="text-xs font-medium text-muted">E-mails de Destino dos Leads (separados por vírgula) *</span>
              <input
                value={destEmailsText}
                onChange={(e) => setDestEmailsText(e.target.value)}
                placeholder="comercial@suaempresa.com.br, marketing@suaempresa.com.br"
                className={input}
              />
            </label>

            <label className="flex items-start gap-2.5 rounded-xl border border-border bg-bg p-3.5 text-xs">
              <input
                type="checkbox"
                checked={useStageFallback}
                onChange={(e) => setUseStageFallback(e.target.checked)}
                className="mt-0.5 accent-[var(--brand)]"
              />
              <div>
                <div className="font-medium text-text">Usar remetente gerenciado Stage (`leads@stage.consult`) automaticamente</div>
                <div className="mt-0.5 text-muted">
                  Garante entrega imediata dos leads sem precisar configurar DKIM/SPF agora. Você pode conectar seu domínio próprio de remetente a qualquer momento em <strong>Minha Conta</strong>.
                </div>
              </div>
            </label>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-xs font-medium text-muted hover:text-text"
            >
              <ArrowLeft size={14} /> Passo Anterior
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {step < 4 ? (
              <button
                type="button"
                onClick={async () => {
                  await saveProgress(false);
                  setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s));
                }}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Salvar e Avançar <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => saveProgress(true)}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-ok px-5 py-2 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Concluir Configuração e Abrir Hub
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

