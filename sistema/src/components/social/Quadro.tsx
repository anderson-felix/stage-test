"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Video, Layers, Image as ImageIcon, Sparkles, Filter } from "lucide-react";
import type { PostResumo, Status, Canal, Formato } from "@/lib/social";
import {
  CANAL_LABEL,
  FORMATO_LABEL,
  SERIE_LABEL,
  STATUS_DOT,
  STATUS_LABEL,
  STATUS_ORDEM,
  formatarData,
} from "./labels";

function FormatoBadge({ formato }: { formato: Formato }) {
  switch (formato) {
    case "video":
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">
          <Video size={10} /> {FORMATO_LABEL[formato]}
        </span>
      );
    case "carrossel":
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
          <Layers size={10} /> {FORMATO_LABEL[formato]}
        </span>
      );
    case "post-unico":
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/15 text-purple-400 border border-purple-500/30">
          <ImageIcon size={10} /> {FORMATO_LABEL[formato]}
        </span>
      );
    case "story":
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <Sparkles size={10} /> {FORMATO_LABEL[formato]}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-surface-2 text-muted border border-border">
          {formato}
        </span>
      );
  }
}

/** Quadro por Status. Arrastar um card para outra coluna muda o Status do Post. */
export function Quadro({ posts: inicial }: { posts: PostResumo[] }) {
  const router = useRouter();
  const [posts, setPosts] = useState(inicial);
  const [sobre, setSobre] = useState<Status | null>(null);
  const [erro, setErro] = useState("");
  const [filtroCanal, setFiltroCanal] = useState<Canal | "todos">("todos");
  const [filtroFormato, setFiltroFormato] = useState<Formato | "todos">("todos");

  const postsFiltrados = useMemo(() => {
    return posts.filter((p) => {
      if (filtroCanal !== "todos" && p.canal !== filtroCanal) return false;
      if (filtroFormato !== "todos" && p.formato !== filtroFormato) return false;
      return true;
    });
  }, [posts, filtroCanal, filtroFormato]);

  async function mover(path: string, status: Status) {
    const post = posts.find((p) => p.path === path);
    if (!post || post.status === status) return;
    const anterior = post.status;
    setPosts((ps) => ps.map((p) => (p.path === path ? { ...p, status } : p)));
    setErro("");
    const res = await fetch(`/api/social/posts/${post.pauta.slug}/${post.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setPosts((ps) => ps.map((p) => (p.path === path ? { ...p, status: anterior } : p)));
      setErro((await res.json()).error ?? "não foi possível mover o Post");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-muted font-medium">
            <Filter size={13} /> Filtrar por:
          </span>
          <div className="flex items-center gap-1 bg-surface-2 rounded-md p-0.5 border border-border">
            <button
              onClick={() => setFiltroCanal("todos")}
              className={`px-2 py-1 rounded transition ${
                filtroCanal === "todos" ? "bg-brand/15 text-brand-soft font-semibold" : "text-muted hover:text-text"
              }`}
            >
              Todos Canais
            </button>
            <button
              onClick={() => setFiltroCanal("instagram")}
              className={`px-2 py-1 rounded transition ${
                filtroCanal === "instagram" ? "bg-brand/15 text-brand-soft font-semibold" : "text-muted hover:text-text"
              }`}
            >
              Instagram
            </button>
            <button
              onClick={() => setFiltroCanal("linkedin")}
              className={`px-2 py-1 rounded transition ${
                filtroCanal === "linkedin" ? "bg-brand/15 text-brand-soft font-semibold" : "text-muted hover:text-text"
              }`}
            >
              LinkedIn
            </button>
          </div>

          <div className="flex items-center gap-1 bg-surface-2 rounded-md p-0.5 border border-border">
            <button
              onClick={() => setFiltroFormato("todos")}
              className={`px-2 py-1 rounded transition ${
                filtroFormato === "todos" ? "bg-brand/15 text-brand-soft font-semibold" : "text-muted hover:text-text"
              }`}
            >
              Todos Formatos
            </button>
            <button
              onClick={() => setFiltroFormato("carrossel")}
              className={`px-2 py-1 rounded transition ${
                filtroFormato === "carrossel" ? "bg-brand/15 text-brand-soft font-semibold" : "text-muted hover:text-text"
              }`}
            >
              Carrossel
            </button>
            <button
              onClick={() => setFiltroFormato("post-unico")}
              className={`px-2 py-1 rounded transition ${
                filtroFormato === "post-unico" ? "bg-brand/15 text-brand-soft font-semibold" : "text-muted hover:text-text"
              }`}
            >
              Post único
            </button>
            <button
              onClick={() => setFiltroFormato("story")}
              className={`px-2 py-1 rounded transition ${
                filtroFormato === "story" ? "bg-brand/15 text-brand-soft font-semibold" : "text-muted hover:text-text"
              }`}
            >
              Story
            </button>
            <button
              onClick={() => setFiltroFormato("video")}
              className={`px-2 py-1 rounded transition ${
                filtroFormato === "video" ? "bg-brand/15 text-brand-soft font-semibold" : "text-muted hover:text-text"
              }`}
            >
              Roteiro de Vídeo
            </button>
          </div>
        </div>

        <div className="text-muted">
          Exibindo <strong>{postsFiltrados.length}</strong> de {posts.length} posts
        </div>
      </div>

      {erro && <p className="text-sm text-danger">{erro}</p>}

      <div className="grid min-h-0 flex-1 auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
        {STATUS_ORDEM.map((status) => {
          const items = postsFiltrados.filter((p) => p.status === status);
          return (
            <section
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(status);
              }}
              onDragLeave={() => setSobre((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setSobre(null);
                mover(e.dataTransfer.getData("text/plain"), status);
              }}
              className={`flex min-h-0 flex-col rounded-xl border bg-surface transition ${
                sobre === status ? "border-brand" : "border-border"
              }`}
            >
              <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                <h2 className="text-sm font-medium">{STATUS_LABEL[status]}</h2>
                <span className="ml-auto text-xs text-muted">{items.length}</span>
              </header>
              <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2">
                {items.map((post) => (
                  <PostCard key={post.path} post={post} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function PostCard({ post }: { post: PostResumo }) {
  return (
    <Link
      href={`/social/${post.pauta.slug}/${post.slug}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", post.path)}
      className="block cursor-grab rounded-lg border border-border bg-surface-2 p-3 transition hover:border-brand/50 active:cursor-grabbing"
    >
      {post.capa && (
        // eslint-disable-next-line @next/next/no-img-element -- PNG servido pela API do hub
        <img
          src={`/api/social/arquivo?path=${encodeURIComponent(post.capa.path)}&v=${post.capa.versao}`}
          alt=""
          draggable={false}
          className="mb-2 aspect-[4/5] w-full rounded-md object-cover"
        />
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-brand-soft">
        <span className="text-muted">{CANAL_LABEL[post.canal]}</span>
        <FormatoBadge formato={post.formato} />
        {post.pauta.exemplo && (
          <span className="ml-auto rounded bg-bg px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-muted">
            exemplo
          </span>
        )}
      </div>
      <h3 className="mt-1 text-sm font-medium leading-snug">{post.pauta.titulo}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span>{SERIE_LABEL[post.serie]}</span>
        {post.dataPlanejada && <span>· {formatarData(post.dataPlanejada)}</span>}
        {post.origemArte && <span>· Arte {post.origemArte === "ia" ? "IA" : "designer"}</span>}
      </div>
    </Link>
  );
}
