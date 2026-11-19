"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Clapperboard,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Loader2,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Video,
  Wand2,
} from "lucide-react";
import type { VideoScene, VideoScriptResult } from "@/app/api/estudio/route";

type TemplateCard = {
  id: string;
  nome: string;
  categoria: string;
  slides: number;
  descricao: string;
  estrutura: string[];
};

const TEMPLATES_STAGE: TemplateCard[] = [
  {
    id: "piramide-cta",
    nome: "Princípio da Pirâmide + CTA",
    categoria: "Metodologia Stage",
    slides: 4,
    descricao:
      "Começa pela conclusão executiva no Slide 1, sustenta com argumento central, prova com dados e fecha com chamada para ação.",
    estrutura: ["1. Tese Executiva", "2. Argumento Central", "3. Evidência / Dados", "4. CTA Consultivo"],
  },
  {
    id: "pros-contras",
    nome: "Comparativo Prós vs. Contras",
    categoria: "Decisão Executiva",
    slides: 4,
    descricao:
      "Contrasta dois modelos operacionais lado a lado para ajudar sócios e diretores a tomarem decisões estratégicas rápidas.",
    estrutura: ["1. Capa Comparativa", "2. Lado A: Vantagens", "3. Lado B: Riscos", "4. Veredito Prático"],
  },
  {
    id: "estudo-caso-b2b",
    nome: "Estudo de Caso B2B",
    categoria: "Prova Social & Autoridade",
    slides: 4,
    descricao:
      "Apresenta o cenário antes, a intervenção metodológica e os indicadores reais de eficiência e margem alcançados.",
    estrutura: ["1. Promessa / Resultado", "2. Cenário Antes", "3. A Intervenção", "4. Impacto Mensurável"],
  },
  {
    id: "mito-verdade",
    nome: "Mito vs. Verdade",
    categoria: "Quebra de Objeção",
    slides: 4,
    descricao:
      "Desconstrói crenças comuns do mercado que drenam caixa e apresenta a visão técnica orientada a margem.",
    estrutura: ["1. Gancho Polêmico", "2. O Mito Comum", "3. A Verdade Técnica", "4. Próximo Passo"],
  },
  {
    id: "checklist-passo",
    nome: "Checklist Passo a Passo",
    categoria: "Alto Salvamento",
    slides: 4,
    descricao:
      "Roteiro prático de implementação em etapas numeradas, desenhado para gerar salvamentos e compartilhamentos no LinkedIn e Instagram.",
    estrutura: ["1. Capa do Guia", "2. Passos 01 & 02", "3. Passos 03 & 04", "4. Salve e Compartilhe"],
  },
];

const ESTILOS_VISUAIS = [
  {
    id: "sobrio-executivo",
    nome: "Sóbrio Executivo",
    desc: "Fundo escuro profundo, tipografia de alto impacto e contraste institucional.",
    previewBg: "linear-gradient(145deg, #1E0B4B 0%, #120924 100%)",
    previewText: "#F6F3FF",
  },
  {
    id: "editorial-moderno",
    nome: "Editorial Moderno",
    desc: "Fundo off-white/lilás suave com diagramação estilo revista de negócios.",
    previewBg: "linear-gradient(145deg, #F8F6FF 0%, #EDE7FF 100%)",
    previewText: "#14111F",
  },
  {
    id: "minimalista-light",
    nome: "Minimalista Light",
    desc: "Fundo branco puro, respiro amplo e foco absoluto nos dados e títulos.",
    previewBg: "#FFFFFF",
    previewText: "#0F172A",
  },
  {
    id: "vibrante-tech",
    nome: "Vibrante Tech",
    desc: "Gradiente na cor primária da marca com acentos neon de alta energia.",
    previewBg: "linear-gradient(145deg, #4C0DFF 0%, #0D0628 100%)",
    previewText: "#4FFBE5",
  },
];

const ESTILOS_VIDEO = [
  "Institucional Executivo",
  "Reels/Shorts Dinâmico",
  "Educativo / Tutorial",
  "Storytelling / Bastidores",
  "Cartunesco / Animado",
] as const;

const DURACOES_VIDEO = ["30s", "60s", "90s+"] as const;

type MediaAssetItem = {
  id: string;
  category: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  blobUrl: string;
  createdAt: string;
};

type BrandProfileData = {
  companyBio?: string | null;
  voiceTone?: string | null;
  visualGuideJson?: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    headingFont?: string;
    bodyFont?: string;
    logoAssetId?: string;
  } | null;
};

type RecentPostItem = {
  id: string;
  slug: string;
  pautaSlug: string;
  pautaTitle: string;
  title: string;
  channel: string;
  format: string;
  serie: string;
  status: string;
  scheduledDate: string | null;
  hasArte: boolean;
  slidesBlobUrls: string[];
};

export default function EstudioPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [aba, setAba] = useState<"templates" | "video" | "ativos">("templates");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  // Dados do tenant
  const [tenantName, setTenantName] = useState("Stage Consulting");
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [brandProfile, setBrandProfile] = useState<BrandProfileData | null>(null);
  const [assets, setAssets] = useState<MediaAssetItem[]>([]);
  const [recentPosts, setRecentPosts] = useState<RecentPostItem[]>([]);

  // Aba 1: Templates
  const [estiloVisual, setEstiloVisual] = useState<string>("sobrio-executivo");
  const [canalTemplate, setCanalTemplate] = useState<"instagram" | "linkedin">("instagram");
  const [tituloCustom, setTituloCustom] = useState<string>("");
  const [criandoTemplateId, setCriandoTemplateId] = useState<string | null>(null);

  // Aba 2: Vídeo & Roteirização
  const [estiloVideo, setEstiloVideo] = useState<string>(ESTILOS_VIDEO[0]);
  const [duracaoVideo, setDuracaoVideo] = useState<string>("60s");
  const [canalVideo, setCanalVideo] = useState<"instagram" | "linkedin">("instagram");
  const [temaVideo, setTemaVideo] = useState<string>("");
  const [gerandoRoteiro, setGerandoRoteiro] = useState(false);
  const [salvandoRoteiro, setSalvandoRoteiro] = useState(false);
  const [roteiroGerado, setRoteiroGerado] = useState<VideoScriptResult | null>(null);
  const [avisoRoteiro, setAvisoRoteiro] = useState<string>("");

  // Aba 3: Ativos
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("all");
  const [categoriaUpload, setCategoriaUpload] = useState<string>("reference");
  const [enviandoAsset, setEnviandoAsset] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch("/api/estudio");
      if (!res.ok) throw new Error("Falha ao carregar dados do Estúdio");
      const data = await res.json();
      if (data.tenant?.name) setTenantName(data.tenant.name);
      if (typeof data.tenant?.tokenCreditBalance === "number") {
        setCreditBalance(data.tenant.tokenCreditBalance);
      }
      setBrandProfile(data.brandProfile || null);
      setAssets(Array.isArray(data.assets) ? data.assets : []);
      setRecentPosts(Array.isArray(data.recentPosts) ? data.recentPosts : []);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  async function usarTemplate(templateId: string) {
    setErro("");
    setSucesso("");
    setCriandoTemplateId(templateId);
    try {
      const res = await fetch("/api/estudio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "use_template",
          templateId,
          toneStyle: estiloVisual,
          channel: canalTemplate,
          customTitle: tituloCustom.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        editorUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.editorUrl) {
        throw new Error(data.error || "Não foi possível criar o post a partir do template");
      }
      router.push(data.editorUrl);
    } catch (err) {
      setErro((err as Error).message);
      setCriandoTemplateId(null);
    }
  }

  async function gerarRoteiroVideo() {
    if (!temaVideo.trim()) {
      setErro("Descreva o tema ou objetivo do vídeo antes de gerar o roteiro.");
      return;
    }
    setErro("");
    setSucesso("");
    setAvisoRoteiro("");
    setGerandoRoteiro(true);
    try {
      const res = await fetch("/api/estudio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_video_script",
          videoStyle: estiloVideo,
          duration: duracaoVideo,
          topic: temaVideo.trim(),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        script?: VideoScriptResult;
        notice?: string;
        error?: string;
      };
      if (!res.ok || !data.script) {
        throw new Error(data.error || "Falha ao gerar roteiro de vídeo");
      }
      setRoteiroGerado(data.script);
      if (data.notice) setAvisoRoteiro(data.notice);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("stage:credits-updated"));
      }
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setGerandoRoteiro(false);
    }
  }

  function atualizarCena(idx: number, campo: keyof VideoScene, valor: string) {
    if (!roteiroGerado) return;
    const novas = roteiroGerado.scenes.map((c, i) =>
      i === idx ? { ...c, [campo]: valor } : c
    );
    setRoteiroGerado({ ...roteiroGerado, scenes: novas });
  }

  function adicionarCena() {
    if (!roteiroGerado) return;
    setRoteiroGerado({
      ...roteiroGerado,
      scenes: [
        ...roteiroGerado.scenes,
        {
          timecode: "00:30 - 00:40",
          speech: "Nova fala do apresentador...",
          sceneDirection: "Plano médio / B-Roll complementar",
          onScreenText: "DESTAQUE NA TELA",
        },
      ],
    });
  }

  async function salvarRoteiroNoCalendario() {
    if (!roteiroGerado) return;
    setErro("");
    setSucesso("");
    setSalvandoRoteiro(true);
    try {
      const res = await fetch("/api/estudio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_video_post",
          channel: canalVideo,
          script: roteiroGerado,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        postUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.postUrl) {
        throw new Error(data.error || "Erro ao salvar roteiro no calendário");
      }
      setSucesso("Roteiro salvo no Calendário Social como Story / Série Sócios!");
      router.push(data.postUrl);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvandoRoteiro(false);
    }
  }

  async function enviarArquivo(file?: File) {
    if (!file) return;
    setErro("");
    setSucesso("");
    setEnviandoAsset(true);
    try {
      const fd = new FormData();
      fd.set("arquivo", file);
      fd.set("category", categoriaUpload);
      const res = await fetch("/api/media", { method: "POST", body: fd });
      const data = (await res.json()) as { asset?: MediaAssetItem; error?: string };
      if (!res.ok || !data.asset) {
        throw new Error(data.error || "Falha ao enviar arquivo");
      }
      setAssets((prev) => [data.asset!, ...prev]);
      setSucesso(`Ativo "${data.asset.fileName}" salvo no Azure Blob Storage.`);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviandoAsset(false);
    }
  }

  async function excluirAsset(id: string) {
    setErro("");
    try {
      const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao remover ativo");
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const vg = brandProfile?.visualGuideJson || {};
  const primaryColor = vg.primaryColor || "#4C0DFF";
  const secondaryColor = vg.secondaryColor || "#6D23F9";
  const accentColor = vg.accentColor || "#4FFBE5";
  const headingFont = vg.headingFont || "Plus Jakarta Sans";
  const bodyFont = vg.bodyFont || "Inter";

  const assetsFiltrados =
    categoriaFiltro === "all"
      ? assets
      : assets.filter((a) => a.category === categoriaFiltro);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold">
            <Clapperboard size={24} className="text-brand-soft" /> Estúdio Criativo · {tenantName}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Templates multi-slide da metodologia Stage, roteirizador técnico de vídeo estilo CapCut e banco de ativos da marca.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {creditBalance !== null && (
            <span className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted">
              Saldo IA: <strong className="text-text">{creditBalance.toLocaleString("pt-BR")}</strong> créditos
            </span>
          )}
          <Link
            href="/social"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium hover:border-brand/50"
          >
            Calendário Social <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* Navegação das 3 Abas */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <button
          onClick={() => setAba("templates")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
            aba === "templates"
              ? "bg-brand text-white shadow-sm"
              : "bg-surface text-muted hover:text-text"
          }`}
        >
          <LayoutTemplate size={16} /> 1. Templates de Carrossel & Artes Visuais
        </button>
        <button
          onClick={() => setAba("video")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
            aba === "video"
              ? "bg-brand text-white shadow-sm"
              : "bg-surface text-muted hover:text-text"
          }`}
        >
          <Film size={16} /> 2. Estúdio de Vídeo & Roteirização
        </button>
        <button
          onClick={() => setAba("ativos")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
            aba === "ativos"
              ? "bg-brand text-white shadow-sm"
              : "bg-surface text-muted hover:text-text"
          }`}
        >
          <FolderOpen size={16} /> 3. Banco de Ativos & Identidade da Marca
        </button>
      </div>

      {erro && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="flex items-center gap-2 rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
          <CheckCircle2 size={16} /> {sucesso}
        </div>
      )}

      {/* ABA 1: TEMPLATES DE CARROSSEL & ARTES VISUAIS */}
      {aba === "templates" && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 rounded-xl border border-border bg-surface p-5 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted">
                1. Escolha o Estilo / Tom Visual do Template
              </label>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {ESTILOS_VISUAIS.map((est) => {
                  const ativo = estiloVisual === est.id;
                  return (
                    <button
                      key={est.id}
                      type="button"
                      onClick={() => setEstiloVisual(est.id)}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                        ativo
                          ? "border-brand bg-brand/10"
                          : "border-border bg-surface-2/60 hover:border-brand/40"
                      }`}
                    >
                      <span
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 text-xs font-bold shadow-inner"
                        style={{ background: est.previewBg, color: est.previewText }}
                      >
                        Aa
                      </span>
                      <div>
                        <div className="text-sm font-semibold">{est.nome}</div>
                        <p className="mt-0.5 text-xs text-muted">{est.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col justify-between gap-3 border-t border-border pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                  2. Título Inicial (Opcional)
                </label>
                <input
                  type="text"
                  value={tituloCustom}
                  onChange={(e) => setTituloCustom(e.target.value)}
                  placeholder="Ex.: 3 Gargalos que Drenam o EBITDA"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                  3. Canal de Destino
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCanalTemplate("instagram")}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                      canalTemplate === "instagram"
                        ? "border-brand bg-brand/15 text-brand-soft"
                        : "border-border bg-bg text-muted"
                    }`}
                  >
                    Instagram (1080×1350)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCanalTemplate("linkedin")}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                      canalTemplate === "linkedin"
                        ? "border-brand bg-brand/15 text-brand-soft"
                        : "border-border bg-bg text-muted"
                    }`}
                  >
                    LinkedIn (Carrossel)
                  </button>
                </div>
              </div>

              <div className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-muted">
                Instanciar e editar um template no Editor Visual é uma operação manual:{" "}
                <strong className="text-ok">0 créditos de IA consumidos</strong>.
              </div>
            </div>
          </div>

          {/* Galeria dos 5 Templates */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES_STAGE.map((tpl) => {
              const criando = criandoTemplateId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  className="flex flex-col justify-between rounded-xl border border-border bg-surface p-5 transition hover:border-brand/50"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-md bg-brand/15 px-2.5 py-0.5 text-[11px] font-semibold text-brand-soft">
                        {tpl.categoria}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <Layers size={13} /> {tpl.slides} slides
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold">{tpl.nome}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{tpl.descricao}</p>

                    <div className="mt-4 space-y-1.5 rounded-lg bg-surface-2/70 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                        Estrutura de Slides (.slide)
                      </div>
                      {tpl.estrutura.map((item) => (
                        <div key={item} className="text-xs text-text/90">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => usarTemplate(tpl.id)}
                    disabled={criandoTemplateId !== null}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                  >
                    {criando ? (
                      <>
                        <Loader2 size={15} className="animate-spin" /> Abrindo Editor Visual…
                      </>
                    ) : (
                      <>
                        <Wand2 size={15} /> Usar Template no Editor
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Biblioteca rápida de artes recentes para reedição */}
          {recentPosts.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
                  Peças Recentes no Hub (Clique para abrir ou editar)
                </h3>
                <Link href="/social" className="text-xs text-brand-soft hover:underline">
                  Ver calendário completo →
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                {recentPosts.slice(0, 8).map((p) => (
                  <Link
                    key={p.id}
                    href={p.hasArte ? `/social/${p.pautaSlug}/${p.slug}/editor` : `/social/${p.pautaSlug}/${p.slug}`}
                    className="group flex flex-col justify-between rounded-lg border border-border bg-surface-2/50 p-3 hover:border-brand/50"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[10px] uppercase text-muted">
                        <span>{p.channel}</span>
                        <span>{p.format}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs font-medium group-hover:text-brand-soft">
                        {p.title}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
                      <span>{p.scheduledDate || "Sem data"}</span>
                      <span className="font-medium text-brand-soft">
                        {p.hasArte ? "Abrir Editor →" : "Ver Roteiro →"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA 2: ESTÚDIO DE VÍDEO & ROTEIRIZAÇÃO (ESTILO CAPCUT / SÓCIOS) */}
      {aba === "video" && (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Video size={19} className="text-brand-soft" /> Roteirizador Técnico de Vídeo (Estilo CapCut / Reels & Sócios)
                </h2>
                <p className="text-xs text-muted">
                  Gere quadros cena a cena com Timecode, Gancho de 3s, Teleprompter, Direção de B-Roll e Legenda na Tela.
                </p>
              </div>
              <span className="rounded-md bg-brand/15 px-2.5 py-1 text-xs font-medium text-brand-soft">
                Consome créditos de IA apenas ao acionar o gerador Claude
              </span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {/* Seletor fechado: Estilo de Vídeo */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                  Estilo de Vídeo
                </label>
                <div className="flex flex-col gap-1.5">
                  {ESTILOS_VIDEO.map((est) => (
                    <button
                      key={est}
                      type="button"
                      onClick={() => setEstiloVideo(est)}
                      className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                        estiloVideo === est
                          ? "border-brand bg-brand/15 text-brand-soft"
                          : "border-border bg-bg text-muted hover:text-text"
                      }`}
                    >
                      {est}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seletor fechado: Duração e Canal */}
              <div className="flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                    Duração Alvo
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {DURACOES_VIDEO.map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setDuracaoVideo(dur)}
                        className={`rounded-lg border py-2.5 text-center text-sm font-semibold transition ${
                          duracaoVideo === dur
                            ? "border-brand bg-brand text-white"
                            : "border-border bg-bg text-muted hover:text-text"
                        }`}
                      >
                        {dur}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                    Canal Principal
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCanalVideo("instagram")}
                      className={`rounded-lg border py-2 text-xs font-medium ${
                        canalVideo === "instagram"
                          ? "border-brand bg-brand/15 text-brand-soft"
                          : "border-border bg-bg text-muted"
                      }`}
                    >
                      Instagram Reels / Story
                    </button>
                    <button
                      type="button"
                      onClick={() => setCanalVideo("linkedin")}
                      className={`rounded-lg border py-2 text-xs font-medium ${
                        canalVideo === "linkedin"
                          ? "border-brand bg-brand/15 text-brand-soft"
                          : "border-border bg-bg text-muted"
                      }`}
                    >
                      LinkedIn Vídeo Sócio
                    </button>
                  </div>
                </div>
              </div>

              {/* Tema / Briefing + Botão Gerar */}
              <div className="flex flex-col justify-between gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                    Tema, Tese ou Briefing do Vídeo
                  </label>
                  <textarea
                    rows={5}
                    value={temaVideo}
                    onChange={(e) => setTemaVideo(e.target.value)}
                    placeholder="Ex.: Por que empresas que crescem faturamento sem governança de margem quebram o caixa em 12 meses..."
                    className="w-full rounded-lg border border-border bg-bg p-3 text-sm focus:border-brand focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={gerarRoteiroVideo}
                  disabled={gerandoRoteiro}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
                >
                  {gerandoRoteiro ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Gerando Roteiro Cena a Cena…
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} /> Gerar Roteiro Técnico de Vídeo
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {avisoRoteiro && (
            <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-xs text-warn">
              {avisoRoteiro}
            </div>
          )}

          {/* Quadro Cena a Cena */}
          {roteiroGerado && (
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-brand-soft">
                    {roteiroGerado.videoStyle} · {roteiroGerado.duration}
                  </span>
                  <input
                    type="text"
                    value={roteiroGerado.title}
                    onChange={(e) =>
                      setRoteiroGerado({ ...roteiroGerado, title: e.target.value })
                    }
                    className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-lg font-semibold focus:border-brand focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={adicionarCena}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-medium hover:border-brand/40"
                  >
                    <Plus size={14} /> Adicionar Cena
                  </button>
                  <button
                    type="button"
                    onClick={salvarRoteiroNoCalendario}
                    disabled={salvandoRoteiro}
                    className="flex items-center gap-1.5 rounded-lg bg-ok px-4 py-2 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50"
                  >
                    {salvandoRoteiro ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CalendarPlus size={14} />
                    )}
                    Salvar como SocialPost (Story / Sócios)
                  </button>
                </div>
              </div>

              {/* Gancho de 3s e CTA Final */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-brand-soft">
                    Gancho de 3 Segundos (Hook Inicial)
                  </label>
                  <input
                    type="text"
                    value={roteiroGerado.hook3s}
                    onChange={(e) =>
                      setRoteiroGerado({ ...roteiroGerado, hook3s: e.target.value })
                    }
                    className="mt-1 w-full rounded border border-border bg-bg px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div className="rounded-lg border border-ok/30 bg-ok/5 p-3">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ok">
                    CTA Final (Chamada para Ação)
                  </label>
                  <input
                    type="text"
                    value={roteiroGerado.ctaFinal}
                    onChange={(e) =>
                      setRoteiroGerado({ ...roteiroGerado, ctaFinal: e.target.value })
                    }
                    className="mt-1 w-full rounded border border-border bg-bg px-2.5 py-1.5 text-sm"
                  />
                </div>
              </div>

              {/* Tabela / Quadro Cena a Cena */}
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="w-36 px-3 py-2.5">Timecode</th>
                      <th className="px-3 py-2.5">Fala / Teleprompter</th>
                      <th className="px-3 py-2.5">Direção de Cena / B-Roll</th>
                      <th className="px-3 py-2.5">Legenda na Tela (On-screen)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {roteiroGerado.scenes.map((cena, idx) => (
                      <tr key={idx} className="align-top">
                        <td className="p-2.5">
                          <input
                            type="text"
                            value={cena.timecode}
                            onChange={(e) => atualizarCena(idx, "timecode", e.target.value)}
                            className="w-full rounded border border-border bg-bg px-2 py-1.5 font-mono text-xs text-brand-soft"
                          />
                        </td>
                        <td className="p-2.5">
                          <textarea
                            rows={3}
                            value={cena.speech}
                            onChange={(e) => atualizarCena(idx, "speech", e.target.value)}
                            className="w-full rounded border border-border bg-bg p-2 text-xs leading-relaxed"
                          />
                        </td>
                        <td className="p-2.5">
                          <textarea
                            rows={3}
                            value={cena.sceneDirection}
                            onChange={(e) =>
                              atualizarCena(idx, "sceneDirection", e.target.value)
                            }
                            className="w-full rounded border border-border bg-bg p-2 text-xs text-muted"
                          />
                        </td>
                        <td className="p-2.5">
                          <textarea
                            rows={3}
                            value={cena.onScreenText}
                            onChange={(e) =>
                              atualizarCena(idx, "onScreenText", e.target.value)
                            }
                            className="w-full rounded border border-border bg-bg p-2 font-semibold text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA 3: BANCO DE ATIVOS & IDENTIDADE DA MARCA */}
      {aba === "ativos" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Coluna Esquerda: Identidade Visual do BrandProfile */}
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Palette size={18} className="text-brand-soft" /> Identidade da Marca
              </h2>
              <Link
                href="/onboarding"
                className="text-xs font-medium text-brand-soft hover:underline"
              >
                Editar no Onboarding →
              </Link>
            </div>

            <div className="space-y-3 rounded-lg bg-surface-2 p-3.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                Paleta Oficial (BrandProfile)
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border bg-bg p-2 text-center">
                  <div
                    className="mx-auto h-8 w-full rounded"
                    style={{ backgroundColor: primaryColor }}
                  />
                  <div className="mt-1 text-[10px] text-muted">Primária</div>
                  <div className="font-mono text-xs font-semibold">{primaryColor}</div>
                </div>
                <div className="rounded-lg border border-border bg-bg p-2 text-center">
                  <div
                    className="mx-auto h-8 w-full rounded"
                    style={{ backgroundColor: secondaryColor }}
                  />
                  <div className="mt-1 text-[10px] text-muted">Secundária</div>
                  <div className="font-mono text-xs font-semibold">{secondaryColor}</div>
                </div>
                <div className="rounded-lg border border-border bg-bg p-2 text-center">
                  <div
                    className="mx-auto h-8 w-full rounded"
                    style={{ backgroundColor: accentColor }}
                  />
                  <div className="mt-1 text-[10px] text-muted">Acento</div>
                  <div className="font-mono text-xs font-semibold">{accentColor}</div>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-lg bg-surface-2 p-3.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                Tipografia & Tom de Voz
              </div>
              <div className="text-xs">
                <span className="text-muted">Títulos:</span>{" "}
                <strong className="text-text">{headingFont}</strong>
              </div>
              <div className="text-xs">
                <span className="text-muted">Corpo:</span>{" "}
                <strong className="text-text">{bodyFont}</strong>
              </div>
              {brandProfile?.voiceTone && (
                <div className="pt-1 text-xs text-muted">
                  <span className="font-medium text-text">Tom de voz:</span>{" "}
                  {brandProfile.voiceTone}
                </div>
              )}
            </div>

            {/* Upload de novo ativo */}
            <div className="rounded-lg border border-dashed border-border p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Novo Upload (Azure Blob Storage)
              </div>
              <select
                value={categoriaUpload}
                onChange={(e) => setCategoriaUpload(e.target.value)}
                className="mb-3 w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs"
              >
                <option value="logo">Logo da Marca (logo)</option>
                <option value="reference">Referência Visual (reference)</option>
                <option value="lp_asset">Ativo de Landing Page (lp_asset)</option>
                <option value="upload">Geral / Social (upload)</option>
              </select>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.gif,.svg,.pdf"
                className="hidden"
                onChange={(e) => enviarArquivo(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={enviandoAsset}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
              >
                {enviandoAsset ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                Selecionar Arquivo do Computador
              </button>
            </div>
          </div>

          {/* Coluna Direita: Galeria de MediaAssets do Tenant */}
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <ImageIcon size={18} className="text-brand-soft" /> Banco de Ativos ({assetsFiltrados.length})
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "all", label: "Todos" },
                  { id: "logo", label: "Logos" },
                  { id: "reference", label: "Referências" },
                  { id: "social_slide", label: "Slides PNG" },
                  { id: "upload", label: "Uploads" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoriaFiltro(cat.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      categoriaFiltro === cat.id
                        ? "bg-brand text-white"
                        : "bg-surface-2 text-muted hover:text-text"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {carregando ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted">
                <Loader2 size={16} className="mr-2 animate-spin" /> Carregando banco de ativos…
              </div>
            ) : assetsFiltrados.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted">
                Nenhum ativo encontrado nesta categoria. Envie logos, fotos de sócios ou referências ao lado.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {assetsFiltrados.map((asset) => (
                  <div
                    key={asset.id}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-surface-2/60 p-2.5"
                  >
                    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-bg p-2">
                      <img
                        src={`/api/media/${asset.id}`}
                        alt={asset.fileName}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-1">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium" title={asset.fileName}>
                          {asset.fileName}
                        </div>
                        <div className="text-[10px] uppercase text-muted">{asset.category}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => excluirAsset(asset.id)}
                        title="Remover ativo"
                        className="rounded p-1 text-muted hover:bg-danger/15 hover:text-danger"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
