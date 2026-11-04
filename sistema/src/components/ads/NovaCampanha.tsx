"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, ImagePlus, Loader2, Plus, X, Link2, Upload, FolderOpen } from "lucide-react";
import type { Servico } from "@/lib/ads";
import { SERVICO_LABEL, SERVICOS_ORDEM } from "./labels";
import { useI18n } from "@/lib/use-i18n";

type LpOption = {
  id: string;
  slug: string;
  title: string;
  serviceType: string;
};

type MediaOption = {
  id: string;
  fileName: string;
  mimeType: string;
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

export function NovaCampanha() {
  const router = useRouter();
  const { dict } = useI18n();
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [servico, setServico] = useState<Servico>("technology");
  const [orcamento, setOrcamento] = useState("");
  const [regiao, setRegiao] = useState("Brasil");
  const [briefing, setBriefing] = useState("");
  const [toneStyle, setToneStyle] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [arquivo, setArquivo] = useState<File | null>(null);

  // Vínculo opcional com Landing Page existente
  const [landingPages, setLandingPages] = useState<LpOption[]>([]);
  const [selectedLpId, setSelectedLpId] = useState("");
  const [loadingLps, setLoadingLps] = useState(false);

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
      setLoadingLps(true);
      fetch("/api/lp")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.lps && Array.isArray(data.lps)) {
            setLandingPages(data.lps);
          }
        })
        .catch(() => undefined)
        .finally(() => setLoadingLps(false));

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

  function escolherLP(lpId: string) {
    setSelectedLpId(lpId);
    if (!lpId) return;
    const lp = landingPages.find((x) => x.id === lpId);
    if (lp) {
      if (!titulo) setTitulo(`Campanha: ${lp.title}`);
      if (lp.serviceType && SERVICOS_ORDEM.includes(lp.serviceType as Servico)) {
        setServico(lp.serviceType as Servico);
      }
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

      const res = await fetch("/api/ads/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo,
          servico,
          orcamentoDiario: orcamento ? Number(orcamento.replace(",", ".")) : null,
          regiao: regiao.trim().toLowerCase() === "brasil" ? "Brazil" : regiao,
          briefing,
          toneStyle: toneStyle || undefined,
          language,
          referenceAssetId,
          landingPageId: selectedLpId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro ao criar a Campanha");

      if (arquivo) {
        const form = new FormData();
        form.append("arquivo", arquivo);
        const up = await fetch(`/api/ads/campanhas/${json.slug}/pesquisa`, { method: "PUT", body: form });
        const upJson = await up.json();
        if (!up.ok) throw new Error(`Campanha criada, mas o CSV não foi aceito: ${upJson.error}`);
      }
      router.push(`/leads/campanhas/${json.slug}?iniciar=${arquivo ? "montar" : "sementes"}`);
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
        className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover shadow-sm"
      >
        <Plus size={15} /> Nova Campanha
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
              <h2 className="font-semibold text-text">Nova Campanha · Google Ads</h2>
              <button
                onClick={() => !enviando && setOpen(false)}
                className="text-muted hover:text-text p-1"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </header>

            <div className="space-y-4 px-5 py-5">
              {/* Seletor opcional de Landing Page Existente */}
              <div className="rounded-lg border border-border bg-surface-2 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-text">
                  <Link2 size={14} className="text-brand-soft" />
                  <span>Vincular a uma Landing Page Existente (opcional)</span>
                </div>
                <p className="text-[11px] text-muted leading-relaxed">
                  A Campanha herdará os temas da página e preencherá automaticamente a URL de destino nos anúncios CSV.
                </p>
                {loadingLps ? (
                  <div className="py-1 text-xs text-muted flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> Carregando LPs…
                  </div>
                ) : (
                  <select
                    value={selectedLpId}
                    onChange={(e) => escolherLP(e.target.value)}
                    className={input}
                  >
                    <option value="">Nenhuma por enquanto (criar campanha independente)</option>
                    {landingPages.map((lp) => (
                      <option key={lp.id} value={lp.id}>
                        {lp.title} (/{lp.slug})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <label className="block">
                <span className="text-xs font-medium text-muted">Nome da Campanha *</span>
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex.: Consultoria de IA para Médias Empresas"
                  className={input}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-muted">Serviço / Vertical *</span>
                  <select value={servico} onChange={(e) => setServico(e.target.value as Servico)} className={input}>
                    {SERVICOS_ORDEM.map((s) => (
                      <option key={s} value={s}>
                        {SERVICO_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Orçamento diário (R$, opcional)</span>
                  <input
                    value={orcamento}
                    onChange={(e) => setOrcamento(e.target.value)}
                    inputMode="decimal"
                    placeholder="Ex.: 150"
                    className={input}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-medium text-muted">Região</span>
                  <input value={regiao} onChange={(e) => setRegiao(e.target.value)} className={input} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Tom dos Anúncios</span>
                  <select value={toneStyle} onChange={(e) => setToneStyle(e.target.value)} className={input}>
                    {TONE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Idioma</span>
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
                <span className="text-xs font-medium text-muted">Briefing (opcional)</span>
                <textarea
                  value={briefing}
                  onChange={(e) => setBriefing(e.target.value)}
                  rows={3}
                  placeholder="Para quem é, que problema resolve, o que diferencia sua marca. Se ficar vazio, a IA usa o BrandProfile."
                  className={`${input} resize-none`}
                />
              </label>

              <div className="rounded-lg border border-dashed border-border p-3">
                <div className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet size={16} className="text-brand-soft" />
                  <span className="font-medium">Pesquisa do Planejador de palavras-chave</span>
                  <span className="text-xs text-muted">(opcional)</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Com o CSV, a IA já monta a campanha. Sem ele, a IA sugere os termos para você pesquisar no Planejador, e você envia o CSV depois.
                </p>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-text file:border file:border-border"
                />
              </div>

              {/* Imagem de Referência Visual: Upload novo ou Selecionar da Galeria da Marca */}
              <div className="rounded-lg border border-border bg-surface-2 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-text">
                    <ImagePlus size={15} className="text-brand-soft" />
                    <span>Imagem de Referência (opcional)</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setOrigemImagem("upload")}
                      className={`px-2 py-0.5 rounded transition ${
                        origemImagem === "upload" ? "bg-brand text-white font-medium" : "text-muted hover:text-text"
                      }`}
                    >
                      <Upload size={11} className="inline mr-1" /> Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrigemImagem("galeria")}
                      className={`px-2 py-0.5 rounded transition ${
                        origemImagem === "galeria" ? "bg-brand text-white font-medium" : "text-muted hover:text-text"
                      }`}
                    >
                      <FolderOpen size={11} className="inline mr-1" /> Galeria ({mediaAssets.length})
                    </button>
                  </div>
                </div>

                {origemImagem === "upload" ? (
                  <div>
                    <p className="text-[11px] text-muted mb-1.5">
                      Envie um print de concorrente ou LP para contextualizar os anúncios RSA.
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
                      Selecione um ativo existente na Biblioteca da Marca do workspace:
                    </p>
                    {loadingMedia ? (
                      <div className="py-1 text-xs text-muted flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" /> Carregando ativos…
                      </div>
                    ) : mediaAssets.length === 0 ? (
                      <p className="text-xs text-muted py-1">Nenhuma imagem na biblioteca ainda.</p>
                    ) : (
                      <select
                        value={selectedAssetId}
                        onChange={(e) => setSelectedAssetId(e.target.value)}
                        className={input}
                      >
                        <option value="">Selecione uma imagem da galeria…</option>
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
                  {enviando && <Loader2 size={15} className="animate-spin" />}
                  {arquivo ? "Criar e montar campanha" : "Criar e sugerir termos"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
