"use client";

/* eslint-disable @next/next/no-img-element -- imagens servidas pela API do hub */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, ExternalLink, FileText, Image as ImageIcon, Loader2, MapPin, Play, RefreshCw, ThumbsUp, Type, Users } from "lucide-react";
import type { FeedLinkedIn, PostLinkedIn } from "@/lib/linkedin";
import type { PostResumo } from "@/lib/social";
import { STATUS_LABEL } from "./labels";

const PAGINA_URL = "https://br.linkedin.com/company/stageconsulting";
const wsUrl = (rel: string, v = "") => `/api/ws/${rel.split("/").map(encodeURIComponent).join("/")}${v ? `?v=${v}` : ""}`;
const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR"));
const dataLonga = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

const TIPO: Record<PostLinkedIn["tipo"], { label: string; icon: typeof FileText }> = {
  documento: { label: "Carrossel (PDF)", icon: FileText },
  imagem: { label: "Imagem", icon: ImageIcon },
  video: { label: "Vídeo", icon: Play },
  texto: { label: "Texto", icon: Type },
};

function quando(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function PerfilLinkedIn({ feed, planejados }: { feed: FeedLinkedIn | null; planejados: PostResumo[] }) {
  const router = useRouter();
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");

  async function atualizar() {
    setAtualizando(true);
    setErro("");
    try {
      const res = await fetch("/api/social/linkedin", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "não foi possível ler o LinkedIn");
      if (json.erro) setErro(json.erro);
      router.refresh();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setAtualizando(false);
    }
  }

  const versao = feed ? String(new Date(feed.atualizadoEm).getTime()) : "";
  const futuros = [...planejados].sort((a, b) => (a.dataPlanejada ?? "9").localeCompare(b.dataPlanejada ?? "9"));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="overflow-hidden rounded-xl border border-border bg-[#f4f2ee] text-[#1c1b1e]">
        {/* Cabeçalho da página da empresa */}
        <div className="bg-white">
          <div className="h-24 bg-gradient-to-r from-[#21005e] via-[#4c0dff] to-[#6d23f9]" />
          <div className="px-6 pb-5">
            <div className="-mt-10 flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border-4 border-white bg-white shadow-sm">
              {feed?.logo ? (
                <img src={wsUrl(feed.logo, versao)} alt="Stage Consulting" className="h-full w-full object-cover" />
              ) : (
                <img src="/logo-stage.png" alt="Stage" className="w-full p-2" />
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">{feed?.nome ?? "Stage Consulting"}</h2>
                <p className="text-sm text-[#555]">{feed?.slogan ?? "Create, Update, Be Great!"}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#666]">
                  {feed?.local && (
                    <span className="flex items-center gap-1">
                      <MapPin size={13} /> {feed.local}
                    </span>
                  )}
                  <span>
                    <b className="text-[#1c1b1e]">{fmt(feed?.seguidores ?? null)}</b> seguidores
                  </span>
                  {feed?.funcionarios != null && (
                    <span className="flex items-center gap-1">
                      <Users size={13} /> {fmt(feed.funcionarios)} funcionários no LinkedIn
                    </span>
                  )}
                </div>
              </div>
              <a
                href={PAGINA_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-full bg-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#004182]"
              >
                Abrir no LinkedIn <ExternalLink size={13} />
              </a>
            </div>
            {feed?.descricao && <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-[#444]">{feed.descricao}</p>}
          </div>
        </div>

        {/* Posts */}
        <div className="flex items-center justify-between px-4 py-3 text-xs">
          <span className="font-semibold uppercase tracking-wider text-[#555]">Posts recentes</span>
          <span className="text-[#777]">{feed?.posts.length ?? 0} posts</span>
        </div>
        {feed && feed.posts.length > 0 ? (
          <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
            {feed.posts.map((p) => {
              const { label, icon: Icon } = TIPO[p.tipo];
              return (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex flex-col rounded-lg border border-[#e0dfdc] bg-white p-4 transition hover:border-[#0a66c2]/50 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs text-[#666]">
                    <span className="flex items-center gap-1.5 rounded bg-[#f3f0ff] px-2 py-0.5 font-medium text-[#4c0dff]">
                      <Icon size={12} /> {label}
                    </span>
                    {p.data && <span>{dataLonga(p.data)}</span>}
                  </div>
                  {p.imagem && <img src={wsUrl(p.imagem, versao)} alt="" className="mt-3 max-h-56 w-full rounded object-cover" />}
                  <p className="mt-3 line-clamp-6 flex-1 whitespace-pre-line text-sm text-[#333]">{p.texto || "(sem texto)"}</p>
                  <div className="mt-3 flex items-center justify-between border-t border-[#eee] pt-2 text-xs text-[#666]">
                    <span className="flex items-center gap-1">
                      <ThumbsUp size={12} /> {fmt(p.curtidas)}
                    </span>
                    <span className="flex items-center gap-1 text-[#0a66c2] opacity-0 transition group-hover:opacity-100">
                      Ver no LinkedIn <ExternalLink size={11} />
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <div className="px-4 pb-8 pt-2 text-center text-sm text-[#666]">Nenhum post lido ainda. Clique em “Atualizar do LinkedIn”.</div>
        )}
      </section>

      <aside className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Cópia da página</h3>
          <p className="mt-2 text-sm text-muted">
            {feed ? <>Lida em {quando(feed.atualizadoEm)}. Atualiza sozinha uma vez por dia.</> : "Ainda não lida."}
          </p>
          {(erro || feed?.erro) && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-warn">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {erro || feed?.erro} Mostrando a última cópia boa.
            </p>
          )}
          <button
            onClick={atualizar}
            disabled={atualizando}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:border-brand/50 disabled:opacity-50"
          >
            {atualizando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar do LinkedIn
          </button>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
            <CalendarClock size={13} /> Planejados no hub
          </h3>
          {futuros.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhum Post de LinkedIn a caminho.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {futuros.map((p) => (
                <li key={p.path}>
                  <Link href={`/social/${p.pauta.slug}/${p.slug}`} className="block rounded-lg border border-border px-3 py-2 hover:border-brand/50">
                    <div className="truncate text-sm font-medium">{p.pauta.titulo}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {p.formato === "carrossel" ? "Carrossel" : "Post único"} · {STATUS_LABEL[p.status]}
                      {p.dataPlanejada && ` · ${dataCurta(p.dataPlanejada)}`}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted">
          Com a API oficial do LinkedIn, esta tela passa a agendar e publicar direto do hub e a mostrar alcance, impressões e engajamento.
        </div>
      </aside>
    </div>
  );
}
