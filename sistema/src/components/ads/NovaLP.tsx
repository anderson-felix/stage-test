"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Plus, X, FolderOpen, Upload } from "lucide-react";
import type { Servico } from "@/lib/ads";
import type { FinalidadeLP } from "@/lib/lp";
import { SERVICO_LABEL, SERVICOS_ORDEM, getLocalizedToneOptions, getLocalizedFinalidadeOpcoes } from "./labels";
import { useI18n } from "@/lib/use-i18n";

type MediaOption = {
  id: string;
  fileName: string;
  mimeType: string;
  blobUrl: string;
};

const TONE_OPTIONS = [
  { value: "", label: "Padrão da marca" },
  { value: "Consultivo", label: "Consultivo & Executivo" },
  { value: "Direto", label: "Direto & Orientado a Conversão" },
  { value: "Provocativo", label: "Provocativo & Desafiador" },
  { value: "Educativo", label: "Educativo & Didático" },
  { value: "Formal", label: "Formal & Institucional" },
];

const LANGUAGE_OPTIONS = [
  { value: "pt-BR", label: "Português (pt-BR)" },
  { value: "en-US", label: "English (en-US)" },
  { value: "es-ES", label: "Español (es-ES)" },
];

export function NovaLP({ campanhas }: { campanhas: { slug: string; titulo: string; servico: Servico }[] }) {
  const router = useRouter();
  const { dict } = useI18n();
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [servico, setServico] = useState<Servico>("technology");
  const [finalidade, setFinalidade] = useState<FinalidadeLP>("campanha");
  const [campanha, setCampanha] = useState("");
  const [briefing, setBriefing] = useState("");
  const [toneStyle, setToneStyle] = useState("");
  const [language, setLanguage] = useState("pt-BR");

  // Imagem de referência (Upload vs Galeria da Marca)
  const [origemImagem, setOrigemImagem] = useState<"upload" | "galeria">("upload");
  const [refFile, setRefFile] = useState<File | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [mediaAssets, setMediaAssets] = useState<MediaOption[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (open) {
      setLoadingMedia(true);
      fetch("/api/media")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.assets && Array.isArray(data.assets)) {
            const imgs = data.assets.filter((a: MediaOption) =>
              a.mimeType.startsWith("image/")
            );
            setMediaAssets(imgs);
          }
        })
        .catch(() => undefined)
        .finally(() => setLoadingMedia(false));
    }
  }, [open]);

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
      let referenceAssetId: string | null = null;

      if (origemImagem === "upload" && refFile) {
        const form = new FormData();
        form.append("file", refFile);
        form.append("category", "reference");
        const upRes = await fetch("/api/media", { method: "POST", body: form });
        const upJson = await upRes.json();
        if (!upRes.ok) throw new Error(upJson.error ?? "Erro ao enviar imagem de referência");
        referenceAssetId = upJson.asset.id;
      } else if (origemImagem === "galeria" && selectedAssetId) {
        referenceAssetId = selectedAssetId;
      }

      const res = await fetch("/api/lp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo,
          servico,
          finalidade,
          campanha: finalidade === "campanha" ? campanha || null : null,
          briefing,
          toneStyle: toneStyle || undefined,
          language,
          referenceAssetId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro ao criar a LP");
      const query = new URLSearchParams({ gerar: "1" });
      if (toneStyle) query.set("toneStyle", toneStyle);
      if (language) query.set("language", language);
      if (referenceAssetId) query.set("referenceAssetId", referenceAssetId);
      router.push(`/site/lp/${json.slug}?${query.toString()}`);
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
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:border-brand/50 shadow-sm"
      >
        <Plus size={15} /> {dict.ads.newLP}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10"
          onClick={() => !enviando && setOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl border border-border bg-surface text-text shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-semibold text-text">{dict.ads.novaLpTitle}</h2>
              <button
                onClick={() => !enviando && setOpen(false)}
                className="text-muted hover:text-text p-1"
                aria-label={dict.common.close}
              >
                <X size={18} />
              </button>
            </header>
            <div className="space-y-4 px-5 py-5">
              <div>
                <span className="text-xs font-medium text-muted">{dict.ads.questionPaidTraffic}</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {getLocalizedFinalidadeOpcoes(dict).map((f) => (
                    <button
                      key={f.valor}
                      type="button"
                      onClick={() => setFinalidade(f.valor)}
                      aria-pressed={finalidade === f.valor}
                      className={`rounded-lg border px-3 py-2 text-left transition ${
                        finalidade === f.valor ? "border-brand bg-brand/10 font-medium" : "border-border hover:border-brand/50"
                      }`}
                    >
                      <span className="block text-sm font-medium">
                        {f.valor === "campanha" ? dict.ads.yes : dict.ads.no}
                        {f.label.toLowerCase()}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{f.descricao}</span>
                    </button>
                  ))}
                </div>
              </div>

              {finalidade === "campanha" && (
                <label className="block">
                  <span className="text-xs font-medium text-muted">{dict.ads.whichCampaign}</span>
                  <select value={campanha} onChange={(e) => escolherCampanha(e.target.value)} className={input}>
                    <option value="">{campanhas.length ? dict.ads.noneForNow : dict.ads.noneCreatedYet}</option>
                    {campanhas.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.titulo}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-muted">
                    {dict.ads.campaignLinkedDesc}
                  </span>
                </label>
              )}

              <label className="block">
                <span className="text-xs font-medium text-muted">{dict.ads.lpName}</span>
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder={dict.ads.lpNamePlaceholder}
                  className={input}
                />
                <span className="mt-1 block text-xs text-muted">
                  {dict.ads.lpNameHelp}
                </span>
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-medium text-muted">{dict.ads.serviceVertical}</span>
                  <select value={servico} onChange={(e) => setServico(e.target.value as Servico)} className={input}>
                    {SERVICOS_ORDEM.map((s) => (
                      <option key={s} value={s}>
                        {SERVICO_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-muted">{dict.ads.tone}</span>
                  <select value={toneStyle} onChange={(e) => setToneStyle(e.target.value)} className={input}>
                    {getLocalizedToneOptions(dict).map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-muted">{dict.ads.language}</span>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} className={input}>
                    {LANGUAGE_OPTIONS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-muted">{dict.ads.briefing}</span>
                <textarea
                  value={briefing}
                  onChange={(e) => setBriefing(e.target.value)}
                  rows={3}
                  placeholder={
                    finalidade === "site"
                      ? dict.ads.briefingPlaceholderSite
                      : dict.ads.briefingPlaceholderCampaign
                  }
                  className={`${input} resize-none`}
                />
              </label>

              {/* Imagem de Referência Visual: Upload novo ou Selecionar da Galeria da Marca */}
              <div className="rounded-lg border border-border bg-surface-2 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-text">
                    <ImagePlus size={15} className="text-brand-soft" />
                    <span>{dict.ads.visualReference}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setOrigemImagem("upload")}
                      className={`px-2 py-0.5 rounded transition ${
                        origemImagem === "upload" ? "bg-brand text-white font-medium" : "text-muted hover:text-text"
                      }`}
                    >
                      <Upload size={11} className="inline mr-1" /> {dict.ads.upload}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrigemImagem("galeria")}
                      className={`px-2 py-0.5 rounded transition ${
                        origemImagem === "galeria" ? "bg-brand text-white font-medium" : "text-muted hover:text-text"
                      }`}
                    >
                      <FolderOpen size={11} className="inline mr-1" /> {dict.ads.gallery} ({mediaAssets.length})
                    </button>
                  </div>
                </div>

                {origemImagem === "upload" ? (
                  <div>
                    <p className="text-[11px] text-muted mb-1.5">
                      {dict.ads.uploadHelpLp}
                    </p>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(e) => setRefFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-text file:border file:border-border"
                    />
                  </div>
                ) : (
                  <div>
                    <p className="text-[11px] text-muted mb-1.5">
                      {dict.ads.galleryHelp}
                    </p>
                    {loadingMedia ? (
                      <div className="py-2 text-xs text-muted flex items-center gap-1.5">
                        <Loader2 size={13} className="animate-spin" /> {dict.ads.loadingAssets}
                      </div>
                    ) : mediaAssets.length === 0 ? (
                      <p className="text-xs text-muted py-1">{dict.ads.noAssetsYet}</p>
                    ) : (
                      <select
                        value={selectedAssetId}
                        onChange={(e) => setSelectedAssetId(e.target.value)}
                        className={input}
                      >
                        <option value="">{dict.ads.selectGalleryImage}</option>
                        {mediaAssets.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.fileName}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {erro && <p className="text-sm text-danger">{erro}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setOpen(false)}
                  disabled={enviando}
                  className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text"
                >
                  {dict.common.cancel || "Cancelar"}
                </button>
                <button
                  onClick={criar}
                  disabled={!titulo.trim() || enviando}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50 shadow-sm"
                >
                  {enviando && <Loader2 size={15} className="animate-spin" />}{" "}
                  {finalidade === "site" ? dict.ads.createAndGeneratePage : dict.ads.createAndGenerateLp}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
