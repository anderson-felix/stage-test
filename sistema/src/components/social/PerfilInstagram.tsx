"use client";

/* eslint-disable @next/next/no-img-element -- miniaturas servidas pela API do hub */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  ExternalLink,
  Layers,
  Loader2,
  Pin,
  Play,
  RefreshCw,
  X,
  Heart,
  MessageCircle,
  Users,
  TrendingUp,
  BarChart2,
} from "lucide-react";
import type { FeedInstagram, PostInstagram } from "@/lib/instagram";
import type { PostResumo } from "@/lib/social";
import { STATUS_LABEL } from "./labels";
import { OAuthConnectButton } from "./OAuthConnectButton";
import { useI18n } from "@/lib/use-i18n";

const PERFIL_URL = "https://www.instagram.com/stage.consulting/";
const wsUrl = (rel: string, v = "") =>
  `/api/ws/${rel.split("/").map(encodeURIComponent).join("/")}${v ? `?v=${v}` : ""}`;
const capaUrl = (path: string, versao: number) =>
  `/api/social/arquivo?path=${encodeURIComponent(path)}&v=${versao}`;
const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));

function quando(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function PerfilInstagram({
  feed,
  planejados,
  oauthAccount,
}: {
  feed: FeedInstagram | null;
  planejados: PostResumo[];
  oauthAccount?: { connected: boolean; handle?: string | null };
}) {
  const router = useRouter();
  const { dict } = useI18n();
  const [mostrarPlanejados, setMostrarPlanejados] = useState(true);
  const [aberto, setAberto] = useState<PostInstagram | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");

  const futuros = [...planejados].sort((a, b) =>
    (b.dataPlanejada ?? "").localeCompare(a.dataPlanejada ?? "")
  );

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

  // Cálculo de KPIs consolidados
  const totalPosts = feed?.totalPosts ?? feed?.posts.length ?? 0;
  const seguidores = feed?.seguidores ?? 0;
  const totalInteracoes = (feed?.posts ?? []).reduce(
    (acc, p) => acc + (p.curtidas ?? 0) + (p.comentarios ?? 0),
    0
  );
  const taxaEngajamento =
    feed?.posts && feed.posts.length > 0 && seguidores > 0
      ? ((totalInteracoes / feed.posts.length / seguidores) * 100).toFixed(2) + "%"
      : totalPosts > 0
        ? `${Math.round(totalInteracoes / (feed?.posts.length || 1))} / post`
        : "—";

  return (
    <div className="space-y-5">
      {/* Cards de KPIs Consolidados */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Seguidores</span>
            <Users size={16} className="text-brand-soft" />
          </div>
          <div className="mt-2 text-2xl font-bold text-text">{fmt(seguidores)}</div>
          <div className="mt-0.5 text-[11px] text-muted">Audiência no Instagram</div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Posts Publicados</span>
            <Layers size={16} className="text-brand-soft" />
          </div>
          <div className="mt-2 text-2xl font-bold text-text">{fmt(totalPosts)}</div>
          <div className="mt-0.5 text-[11px] text-muted">Publicações no perfil</div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Total de Interações</span>
            <Heart size={16} className="text-rose-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-text">{fmt(totalInteracoes)}</div>
          <div className="mt-0.5 text-[11px] text-muted">Curtidas + comentários recentes</div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Engajamento Médio</span>
            <TrendingUp size={16} className="text-ok" />
          </div>
          <div className="mt-2 text-2xl font-bold text-text">{taxaEngajamento}</div>
          <div className="mt-0.5 text-[11px] text-muted">Média por publicação</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Perfil + grade */}
        <section className="overflow-hidden rounded-xl border border-border bg-surface text-text shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-5 border-b border-border bg-surface-2/40 px-6 py-6">
            <div className="flex flex-wrap items-center gap-5 sm:gap-6">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-brand via-brand-soft to-ok p-[3px] shadow">
                {feed?.avatar ? (
                  <img
                    src={wsUrl(feed.avatar, versao)}
                    alt="Perfil"
                    className="h-full w-full rounded-full border-2 border-surface object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-surface p-3">
                    <img src="/logo-stage.png" alt="Stage" className="w-full" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg font-bold text-text">stage.consulting</span>
                  <a
                    href={PERFIL_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:border-brand/50 transition"
                  >
                    Abrir no Instagram <ExternalLink size={12} />
                  </a>
                </div>
                <div className="mt-2 flex flex-wrap gap-5 text-sm text-text">
                  <span>
                    <strong>{fmt(feed?.totalPosts ?? null)}</strong>{" "}
                    <span className="text-muted">posts</span>
                  </span>
                  <span>
                    <strong>{fmt(feed?.seguidores ?? null)}</strong>{" "}
                    <span className="text-muted">seguidores</span>
                  </span>
                  <span>
                    <strong>{fmt(feed?.seguindo ?? null)}</strong>{" "}
                    <span className="text-muted">seguindo</span>
                  </span>
                </div>
                <div className="mt-2 text-sm">
                  <div className="font-semibold text-text">Stage Consulting</div>
                  <div className="text-xs text-muted leading-relaxed">
                    {feed?.bio || "The new Stage of Consulting · Conteúdo B2B de Alto Impacto"}
                  </div>
                </div>
              </div>
            </div>

            {/* Status OAuth no cabeçalho */}
            <div className="shrink-0">
              <OAuthConnectButton
                platform="instagram"
                connected={Boolean(oauthAccount?.connected)}
                handle={oauthAccount?.handle}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2.5 text-xs">
            <span className="font-semibold uppercase tracking-wider text-muted">
              Grade de Publicações
            </span>
            {futuros.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-muted hover:text-text transition">
                <input
                  type="checkbox"
                  checked={mostrarPlanejados}
                  onChange={(e) => setMostrarPlanejados(e.target.checked)}
                  className="accent-[var(--brand)]"
                />
                Exibir {futuros.length} Posts agendados / planejados no hub
              </label>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1 bg-surface-2 p-1">
            {mostrarPlanejados &&
              futuros.map((p) => (
                <Link
                  key={p.path}
                  href={`/social/${p.pauta.slug}/${p.slug}`}
                  title={p.pauta.titulo}
                  className="group relative aspect-[3/4] overflow-hidden rounded bg-surface border border-brand/50 transition hover:shadow-lg"
                >
                  {p.capa ? (
                    <img
                      src={capaUrl(p.capa.path, p.capa.versao)}
                      alt={p.pauta.titulo}
                      className="h-full w-full object-cover opacity-90 transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-3 text-center text-xs font-medium text-muted">
                      {p.pauta.titulo}
                      <span className="absolute bottom-2 left-0 right-0 text-[10px] font-normal text-muted">
                        sem arte ainda
                      </span>
                    </div>
                  )}
                  {p.formato === "carrossel" && (
                    <Layers size={15} className="absolute right-2 top-2 text-white drop-shadow" />
                  )}
                  <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                    <CalendarClock size={11} />
                    {p.status === "pronto" && p.dataPlanejada
                      ? `Agendado ${dataCurta(p.dataPlanejada)}`
                      : `Hub · ${STATUS_LABEL[p.status]}`}
                  </span>
                  <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                    <div className="line-clamp-2 leading-snug">{p.pauta.titulo}</div>
                  </div>
                </Link>
              ))}

            {feed?.posts.map((p) => (
              <button
                key={p.codigo}
                onClick={() => setAberto(p)}
                title={p.data ? `Publicado em ${p.data.split("-").reverse().join("/")}` : "Abrir post"}
                className="group relative aspect-[3/4] overflow-hidden rounded bg-surface transition hover:opacity-95"
              >
                {p.imagem ? (
                  <img
                    src={wsUrl(p.imagem, versao)}
                    alt={`Post ${p.codigo}`}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <span className="text-xs text-muted">sem miniatura</span>
                )}
                <span className="absolute right-2 top-2 flex gap-1 text-white drop-shadow">
                  {p.fixado && <Pin size={15} />}
                  {p.tipo === "carrossel" && <Layers size={15} />}
                  {p.tipo === "video" && <Play size={15} fill="white" />}
                </span>

                {/* Métricas do post no hover */}
                <div className="absolute inset-0 flex items-center justify-center gap-4 bg-black/60 text-white opacity-0 transition group-hover:opacity-100">
                  <div className="flex items-center gap-1 text-xs font-semibold">
                    <Heart size={14} className="fill-white" /> {fmt(p.curtidas)}
                  </div>
                  <div className="flex items-center gap-1 text-xs font-semibold">
                    <MessageCircle size={14} className="fill-white" /> {fmt(p.comentarios)}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {!feed && (
            <div className="px-6 py-12 text-center text-sm text-muted">
              O feed ainda não foi sincronizado. Clique em <b>Atualizar do Instagram</b> na lateral.
            </div>
          )}
        </section>

        {/* Lateral */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 text-text shadow-sm">
            <h2 className="font-semibold text-text">Sincronização do Feed</h2>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              {feed ? `Atualizado em ${quando(feed.atualizadoEm)}. ` : ""}O hub lê o perfil público e as métricas sincronizadas via API oficial para alimentar a inteligência de conteúdo.
            </p>
            <button
              onClick={atualizar}
              disabled={atualizando}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60 transition shadow-sm"
            >
              {atualizando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {atualizando ? "Lendo o Instagram…" : "Atualizar do Instagram"}
            </button>
            {(erro || feed?.erro) && (
              <p className="mt-3 flex gap-1.5 text-xs text-warn">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                Não consegui ler o Instagram agora ({erro || feed?.erro}). Exibindo cópia local.
              </p>
            )}
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
              Cards com borda dourada/roxa representam posts produzidos no Hub.
            </p>
          </div>

          {aberto && (
            <div className="sticky top-20 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted">
                <a
                  href={aberto.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 hover:text-text font-medium"
                >
                  {aberto.data
                    ? `Publicado em ${aberto.data.split("-").reverse().join("/")}`
                    : "Abrir no Instagram"}{" "}
                  <ExternalLink size={12} />
                </a>
                <button
                  onClick={() => setAberto(null)}
                  className="hover:text-text p-1"
                  aria-label="Fechar"
                >
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
    </div>
  );
}
