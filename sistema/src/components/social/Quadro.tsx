"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PostResumo, Status } from "@/lib/social";
import { CANAL_LABEL, FORMATO_LABEL, SERIE_LABEL, STATUS_DOT, STATUS_LABEL, STATUS_ORDEM, formatarData } from "./labels";

/** Quadro por Status. Arrastar um card para outra coluna muda o Status do Post. */
export function Quadro({ posts: inicial }: { posts: PostResumo[] }) {
  const router = useRouter();
  const [posts, setPosts] = useState(inicial);
  const [sobre, setSobre] = useState<Status | null>(null);
  const [erro, setErro] = useState("");

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
      {erro && <p className="text-sm text-danger">{erro}</p>}
      <div className="grid min-h-0 flex-1 auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
        {STATUS_ORDEM.map((status) => {
          const items = posts.filter((p) => p.status === status);
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
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-brand-soft">
        {CANAL_LABEL[post.canal]} · {FORMATO_LABEL[post.formato]}
        {post.pauta.exemplo && (
          <span className="ml-auto rounded bg-bg px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-muted">exemplo</span>
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
