"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Plus, Sparkles, X, Upload, FolderOpen } from "lucide-react";
import { lerStreamClaude } from "@/lib/stream-client";
import type { SugestaoPauta } from "@/app/api/social/pautas/sugestoes/route";
import { ProgressoIA, gravou, lendo, useProgressoIA } from "../ProgressoIA";
import { CANAL_LABEL, FORMATO_LABEL, SERIE_LABEL, getLocalizedToneSocialOptions } from "./labels";
import { useI18n } from "@/lib/use-i18n";
import type { Formato } from "@/lib/social";

type MediaOption = {
  id: string;
  fileName: string;
  mimeType: string;
};

const ETAPAS_PAUTA = {
  etapas: [
    { rotulo: "Lendo a estratégia, o tom de voz e as Séries", quando: lendo },
    { rotulo: "Definindo a Pauta", quando: gravou(/pauta\.md$/) },
    { rotulo: "Escrevendo Roteiro e Legenda de cada Post", quando: gravou(/(post|legenda)\.md$/) },
  ],
  estimativaSeg: 100,
};

const OPCOES: Record<"instagram" | "linkedin", readonly Formato[]> = {
  instagram: ["carrossel", "post-unico", "story", "video"],
  linkedin: ["carrossel", "post-unico", "video"],
} as const;

type Canal = keyof typeof OPCOES;

const TONE_OPTIONS = [
  { value: "", label: "Padrão da marca" },
  { value: "Consultivo", label: "Consultivo & Executivo" },
  { value: "Direto", label: "Direto & Prático" },
  { value: "Provocativo", label: "Provocativo & Desafiador" },
  { value: "Educativo", label: "Educativo & Didático" },
  { value: "Formal", label: "Formal & Institucional" },
];

const LANGUAGE_OPTIONS = [
  { value: "pt-BR", label: "Português (pt-BR)" },
  { value: "en-US", label: "English (en-US)" },
  { value: "es-ES", label: "Español (es-ES)" },
];

type Fase = { kind: "form" } | { kind: "gerando" } | { kind: "erro"; msg: string };

export function NovaPauta() {
  const router = useRouter();
  const { dict } = useI18n();
  const progresso = useProgressoIA(ETAPAS_PAUTA);
  const [open, setOpen] = useState(false);
  const [tema, setTema] = useState("");
  const [angulo, setAngulo] = useState("");
  const [data, setData] = useState("");
  const [toneStyle, setToneStyle] = useState("");
  const [language, setLanguage] = useState("pt-BR");

  // Imagem de referência (Upload vs Galeria da Marca)
  const [origemImagem, setOrigemImagem] = useState<"upload" | "galeria">("upload");
  const [refFile, setRefFile] = useState<File | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [mediaAssets, setMediaAssets] = useState<MediaOption[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  const [canais, setCanais] = useState<Record<Canal, Formato | null>>({ instagram: "carrossel", linkedin: null });
  const [fase, setFase] = useState<Fase>({ kind: "form" });
  const [sugestoes, setSugestoes] = useState<SugestaoPauta[] | null>(null);
  const [sugerindo, setSugerindo] = useState(false);
  const [erroSugestao, setErroSugestao] = useState("");

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
    const next: Record<Canal, Formato | null> = { instagram: null, linkedin: null };
    for (const c of s.canais) next[c.canal as Canal] = c.formato as Formato;
    if (next.instagram || next.linkedin) setCanais(next);
    setSugestoes(null);
  }

  async function gerar() {
    setFase({ kind: "gerando" });
    progresso.iniciar();
    try {
      let referenceAssetId: string | undefined;

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

      const res = await fetch("/api/social/pautas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tema,
          angulo,
          dataPlanejada: data || undefined,
          posts,
          toneStyle: toneStyle || undefined,
          language,
          referenceAssetId,
        }),
      });
      await lerStreamClaude(res, progresso.onEvento);
      progresso.parar();
      setOpen(false);
      setFase({ kind: "form" });
      setTema("");
      setAngulo("");
      setData("");
      setRefFile(null);
      setSelectedAssetId("");
      router.refresh();
    } catch (err) {
      progresso.parar();
      setFase({ kind: "erro", msg: (err as Error).message });
    }
  }

  const input = "mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover shadow-sm"
      >
        <Plus size={15} /> {dict.social.newPauta}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10"
          onClick={fechar}
        >
          <div
            className="w-full max-w-xl rounded-xl border border-border bg-surface text-text shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-semibold text-text">{dict.social.newPauta}</h2>
              <button onClick={fechar} className="text-muted hover:text-text p-1" aria-label={dict.common.close}>
                <X size={18} />
              </button>
            </header>

            {fase.kind === "gerando" ? (
              <div className="px-5 py-6">
                <ProgressoIA
                  titulo={dict.social.claudeWritingScripts}
                  progresso={progresso}
                  aviso={dict.social.doNotCloseWindow}
                />
              </div>
            ) : (
              <div className="space-y-4 px-5 py-5">
                <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <span className="text-muted">{dict.social.noThemeIdea}</span>
                  <button
                    onClick={sugerir}
                    disabled={sugerindo}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-brand-soft hover:border-brand/50 disabled:opacity-60 transition"
                  >
                    {sugerindo ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {sugerindo ? dict.social.thinking : dict.social.suggestTopics}
                  </button>
                </div>
                {erroSugestao && <p className="text-xs text-danger">{erroSugestao}</p>}
                {sugestoes && (
                  <ul className="space-y-2">
                    {sugestoes.map((s) => (
                      <li key={s.titulo}>
                        <button
                          onClick={() => usarSugestao(s)}
                          className="w-full rounded-lg border border-border px-3 py-2 text-left hover:border-brand/50 transition"
                        >
                          <div className="text-sm font-medium text-text">{s.titulo}</div>
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
                  <span className="text-xs font-medium text-muted">{dict.social.topicTitle}</span>
                  <input
                    value={tema}
                    onChange={(e) => setTema(e.target.value)}
                    placeholder={dict.social.topicPlaceholder}
                    className={input}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-muted">{dict.social.angle}</span>
                  <span className="mt-0.5 block text-xs text-muted/80">
                    {dict.social.angleDesc}
                  </span>
                  <textarea
                    value={angulo}
                    onChange={(e) => setAngulo(e.target.value)}
                    rows={2}
                    placeholder={dict.social.anglePlaceholder}
                    className={`${input} resize-none`}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-xs font-medium text-muted">{dict.social.toneLabel}</span>
                    <select value={toneStyle} onChange={(e) => setToneStyle(e.target.value)} className={input}>
                      {getLocalizedToneSocialOptions(dict).map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-muted">{dict.social.languageLabel}</span>
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} className={input}>
                      {LANGUAGE_OPTIONS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-muted">{dict.social.plannedDate}</span>
                    <input
                      type="date"
                      value={data}
                      onChange={(e) => setData(e.target.value)}
                      className={`${input} [color-scheme:dark]`}
                    />
                  </label>
                </div>

                <div>
                  <span className="text-xs font-medium text-muted">{dict.social.channelsAndFormats}</span>
                  <div className="mt-1 space-y-2">
                    {(Object.keys(OPCOES) as Canal[]).map((canal) => (
                      <div key={canal} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
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
                              type="button"
                              disabled={!canais[canal]}
                              onClick={() => setCanais({ ...canais, [canal]: f })}
                              className={`rounded-md px-2 py-0.5 text-xs transition disabled:opacity-40 ${
                                canais[canal] === f ? "bg-brand text-white font-medium" : "bg-surface-2 text-muted hover:text-text"
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

                {/* Imagem de Referência Visual: Upload novo ou Selecionar da Galeria da Marca */}
                <div className="rounded-lg border border-border bg-surface-2 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-text">
                      <ImagePlus size={15} className="text-brand-soft" />
                      <span>{dict.social.referenceImageOptional}</span>
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
                        {dict.social.uploadHelpPauta}
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
                        {dict.social.galleryHelpPauta}
                      </p>
                      {loadingMedia ? (
                        <div className="py-1 text-xs text-muted flex items-center gap-1.5">
                          <Loader2 size={12} className="animate-spin" /> {dict.ads.loadingAssets}
                        </div>
                      ) : mediaAssets.length === 0 ? (
                        <p className="text-xs text-muted py-1">{dict.social.noGalleryImagesYet}</p>
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

                {fase.kind === "erro" && <p className="text-sm text-danger">{fase.msg}</p>}

                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={fechar} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text">
                    {dict.common.cancel || "Cancelar"}
                  </button>
                  <button
                    onClick={gerar}
                    disabled={!podeGerar}
                    className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50 shadow-sm"
                  >
                    <Sparkles size={15} /> {dict.social.generateScripts}
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
