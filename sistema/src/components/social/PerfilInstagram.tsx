"use client";

/* eslint-disable @next/next/no-img-element -- miniaturas servidas pela API do hub */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, ExternalLink, Layers, Loader2, Pin, Play, RefreshCw, X } from "lucide-react";
import type { FeedInstagram, PostInstagram } from "@/lib/instagram";
import type { PostResumo } from "@/lib/social";
import { STATUS_LABEL } from "./labels";

const PERFIL_URL = "https://www.instagram.com/stage.consulting/";
const wsUrl = (rel: string, v = "") => `/api/ws/${rel.split("/").map(encodeURIComponent).join("/")}${v ? `?v=${v}` : ""}`;
const capaUrl = (path: string, versao: number) => `/api/social/arquivo?path=${encodeURIComponent(path)}&v=${versao}`;
const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR"));

function quando(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function PerfilInstagram({ feed, planejados }: { feed: FeedInstagram | null; planejados: PostResumo[] }) {
  const router = useRouter();
  const [mostrarPlanejados, setMostrarPlanejados] = useState(false);
  const [aberto, setAberto] = useState<PostInstagram | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");

  const futuros = [...planejados].sort((a, b) => (b.dataPlanejada ?? "").localeCompare(a.dataPlanejada ?? ""));

  async function atualizar() {
    setAtualizando(true);
    setErro("");
    try {
      const res = await fetch("/api/social/instagram", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "não foi possível ler o Instagram");
      if (json.erro) setErro(json.erro);
      router.refresh();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setAtualizando(false);
    }
  }

  const versao = feed ? String(new Date(feed.atualizadoEm).getTime()) : "";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Perfil + grade */}
      <section className="overflow-hidden rounded-xl border border-border bg-white text-[#1c1b1e]">
        <div className="flex flex-wrap items-center gap-5 px-6 py-6 sm:gap-8">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#4c0dff] via-[#a98bff] to-[#4ffbe5] p-[3px]">
            {feed?.avatar ? (
              <img src={wsUrl(feed.avatar, versao)} alt="stage.consulting" className="h-full w-full rounded-full border-2 border-white object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full bg-white p-3">
                <img src="/logo-stage.png" alt="Stage" className="w-full" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-lg font-semibold">stage.consulting</span>
              <a
                href={PERFIL_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-[#efefef] px-3 py-1.5 text-sm font-semibold hover:bg-[#e0e0e0]"
              >
                Abrir no Instagram <ExternalLink size={13} />
              </a>
            </div>
            <div className="mt-2 flex flex-wrap gap-5 text-sm">
              <span>
                <b>{fmt(feed?.totalPosts ?? null)}</b> posts
              </span>
              <span>
                <b>{fmt(feed?.seguidores ?? null)}</b> seguidores
              </span>
              <span>
                <b>{fmt(feed?.seguindo ?? null)}</b> seguindo
              </span>
            </div>
            <div className="mt-2 text-sm">
              <div className="font-semibold">Stage Consulting</div>
              <div className="text-[#555]">{feed?.bio || "The new Stage of Consulting"}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#dbdbdb] px-4 py-2 text-xs">
          <span className="font-semibold uppercase tracking-wider text-[#555]">Posts</span>
          {futuros.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-[#555]">
              <input type="checkbox" checked={mostrarPlanejados} onChange={(e) => setMostrarPlanejados(e.target.checked)} className="accent-[#4c0dff]" />
              Pré-visualizar os {futuros.length} Posts planejados no hub (entram por cima)
            </label>
          )}
        </div>

        <div className="grid grid-cols-3 gap-[2px] bg-white">
          {mostrarPlanejados &&
            futuros.map((p) => (
              <Link
                key={p.path}
                href={`/social/${p.pauta.slug}/${p.slug}`}
                title={p.pauta.titulo}
                className="group relative aspect-[3/4] overflow-hidden bg-[#f2f2f2] outline outline-2 -outline-offset-2 outline-[#a98bff]"
              >
                {p.capa ? (
                  <img src={capaUrl(p.capa.path, p.capa.versao)} alt={p.pauta.titulo} className="h-full w-full object-cover opacity-85" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-3 text-center text-xs font-semibold text-[#777]">
                    {p.pauta.titulo}
                    <span className="absolute bottom-2 left-0 right-0 text-[10px] font-normal">sem Arte ainda</span>
                  </div>
                )}
                {p.formato === "carrossel" && <Layers size={16} className="absolute right-2 top-2 text-white drop-shadow" />}
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-[#4c0dff] px-2 py-0.5 text-[10px] font-medium text-white">
                  <CalendarClock size={11} />
                  {p.status === "pronto" && p.dataPlanejada ? `Agendado ${dataCurta(p.dataPlanejada)}` : `No hub · ${STATUS_LABEL[p.status]}`}
                </span>
                <span className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent p-2 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                  {p.pauta.titulo}
                </span>
              </Link>
            ))}

          {feed?.posts.map((p) => (
            <button
              key={p.codigo}
              onClick={() => setAberto(p)}
              title={p.data ? `Publicado em ${p.data.split("-").reverse().join("/")}` : "Abrir post"}
              className="group relative aspect-[3/4] overflow-hidden bg-[#f2f2f2]"
            >
              {p.imagem ? (
                <img src={wsUrl(p.imagem, versao)} alt={`Post ${p.codigo}`} className="h-full w-full object-cover transition group-hover:brightness-90" />
              ) : (
                <span className="text-xs text-[#777]">sem miniatura</span>
              )}
              <span className="absolute right-2 top-2 flex gap-1 text-white drop-shadow">
                {p.fixado && <Pin size={15} />}
                {p.tipo === "carrossel" && <Layers size={16} />}
                {p.tipo === "video" && <Play size={16} fill="white" />}
              </span>
            </button>
          ))}
        </div>

        {!feed && (
          <div className="px-6 py-10 text-center text-sm text-[#555]">
            O feed ainda não foi lido. Clique em <b>Atualizar do Instagram</b>.
          </div>
        )}
      </section>

      {/* Lateral */}
      <aside className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="font-semibold">Feed real</h2>
          <p className="mt-1 text-xs text-muted">
            {feed ? `Atualizado em ${quando(feed.atualizadoEm)}. ` : ""}O hub lê o perfil público da Stage (os 12 posts mais recentes) e atualiza
            sozinho uma vez por dia.
          </p>
          <button
            onClick={atualizar}
            disabled={atualizando}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {atualizando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {atualizando ? "Lendo o Instagram…" : "Atualizar do Instagram"}
          </button>
          {(erro || feed?.erro) && (
            <p className="mt-3 flex gap-1.5 text-xs text-warn">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              Não consegui ler o Instagram agora ({erro || feed?.erro}). Mostrando a última cópia.
            </p>
          )}
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
            Borda roxa = Post planejado no hub. Clique num post real para ver curtidas e o carrossel.
          </p>
        </div>

        {aberto && (
          <div className="sticky top-20 overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted">
              <a href={aberto.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-text">
                {aberto.data ? `Publicado em ${aberto.data.split("-").reverse().join("/")}` : "Abrir no Instagram"} <ExternalLink size={12} />
              </a>
              <button onClick={() => setAberto(null)} className="hover:text-text" aria-label="Fechar">
                <X size={14} />
              </button>
            </div>
            <iframe
              key={aberto.codigo}
              src={`https://www.instagram.com/p/${aberto.codigo}/embed/`}
              title={`Post do Instagram ${aberto.codigo}`}
              className="h-[620px] w-full border-0 bg-white"
            />
          </div>
        )}
      </aside>
    </div>
  );
}
