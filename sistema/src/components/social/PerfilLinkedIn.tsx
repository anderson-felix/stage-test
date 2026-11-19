"use client";

/* eslint-disable @next/next/no-img-element -- imagens servidas pela API do hub */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Play,
  RefreshCw,
  ThumbsUp,
  MessageSquare,
  Share2,
  Type,
  Users,
  TrendingUp,
  BarChart2,
  Layers,
} from "lucide-react";
import type { FeedLinkedIn, PostLinkedIn } from "@/lib/linkedin";
import type { PostResumo } from "@/lib/social";
import { STATUS_LABEL } from "./labels";
import { OAuthConnectButton } from "./OAuthConnectButton";
import { useI18n } from "@/lib/use-i18n";

const PAGINA_URL = "https://br.linkedin.com/company/stageconsulting";
const wsUrl = (rel: string, v = "") =>
  `/api/ws/${rel.split("/").map(encodeURIComponent).join("/")}${v ? `?v=${v}` : ""}`;
const capaUrl = (path: string, versao: number) =>
  `/api/social/arquivo?path=${encodeURIComponent(path)}&v=${versao}`;
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const dataLonga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

const TIPO: Record<PostLinkedIn["tipo"], { label: string; icon: typeof FileText }> = {
  documento: { label: "Carrossel (PDF)", icon: FileText },
  imagem: { label: "Imagem", icon: ImageIcon },
  video: { label: "Vídeo", icon: Play },
  texto: { label: "Texto", icon: Type },
};

function quando(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function PerfilLinkedIn({
  feed,
  planejados,
  oauthAccount,
}: {
  feed: FeedLinkedIn | null;
  planejados: PostResumo[];
  oauthAccount?: { connected: boolean; handle?: string | null };
}) {
  const router = useRouter();
  const { dict } = useI18n();
  const [mostrarPlanejados, setMostrarPlanejados] = useState(true);
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
  const futuros = [...planejados].sort((a, b) =>
    (a.dataPlanejada ?? "9").localeCompare(b.dataPlanejada ?? "9")
  );

  // KPIs consolidados
  const seguidores = feed?.seguidores ?? 0;
  const totalPosts = feed?.posts.length ?? 0;
  const totalInteracoes = (feed?.posts ?? []).reduce(
    (acc, p) => acc + (p.reacoes ?? p.curtidas ?? 0) + (p.comentarios ?? 0),
    0
  );
  const mediaInteracoes =
    totalPosts > 0 ? `${Math.round(totalInteracoes / totalPosts)} / post` : "—";

  return (
    <div className="space-y-5">
      {/* Cards de KPIs Consolidados */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Seguidores</span>
            <Users size={16} className="text-[#0a66c2]" />
          </div>
          <div className="mt-2 text-2xl font-bold text-text">{fmt(seguidores)}</div>
          <div className="mt-0.5 text-[11px] text-muted">Conexões no LinkedIn</div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Posts no Feed</span>
            <FileText size={16} className="text-brand-soft" />
          </div>
          <div className="mt-2 text-2xl font-bold text-text">{fmt(totalPosts)}</div>
          <div className="mt-0.5 text-[11px] text-muted">Artigos, carrosséis e posts</div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Reações & Comentários</span>
            <ThumbsUp size={16} className="text-ok" />
          </div>
          <div className="mt-2 text-2xl font-bold text-text">{fmt(totalInteracoes)}</div>
          <div className="mt-0.5 text-[11px] text-muted">Interações somadas recentes</div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Média por Publicação</span>
            <TrendingUp size={16} className="text-brand-soft" />
          </div>
          <div className="mt-2 text-2xl font-bold text-text">{mediaInteracoes}</div>
          <div className="mt-0.5 text-[11px] text-muted">Engajamento corporativo B2B</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-xl border border-border bg-surface text-text shadow-sm">
          {/* Cabeçalho da página da empresa */}
          <div className="border-b border-border bg-surface">
            <div className="h-24 bg-gradient-to-r from-brand/80 via-brand-soft/70 to-brand" />
            <div className="px-6 pb-5">
              <div className="-mt-10 flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border-4 border-surface bg-surface shadow-sm">
                {feed?.logo ? (
                  <img
                    src={wsUrl(feed.logo, versao)}
                    alt="Logo da Empresa"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img src="/logo-stage.png" alt="Stage" className="w-full p-2" />
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-text">
                    {feed?.nome ?? "Stage Consulting"}
                  </h2>
                  <p className="text-sm text-muted">
                    {feed?.slogan ?? "Create, Update, Be Great!"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {feed?.local && (
                      <span className="flex items-center gap-1">
                        <MapPin size={13} /> {feed.local}
                      </span>
                    )}
                    <span>
                      <strong className="text-text">{fmt(feed?.seguidores ?? null)}</strong>{" "}
                      seguidores
                    </span>
                    {feed?.funcionarios != null && (
                      <span className="flex items-center gap-1">
                        <Users size={13} /> {fmt(feed.funcionarios)} pessoas na organização
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <OAuthConnectButton
                    platform="linkedin"
                    connected={Boolean(oauthAccount?.connected)}
                    handle={oauthAccount?.handle}
                  />
                  <a
                    href={PAGINA_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:border-brand/50 transition"
                  >
                    Abrir no LinkedIn <ExternalLink size={12} />
                  </a>
                </div>
              </div>
              {feed?.descricao && (
                <p className="mt-3 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted">
                  {feed.descricao}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2/40 px-4 py-2.5 text-xs">
            <span className="font-semibold uppercase tracking-wider text-muted">
              Publicações & Artigos
            </span>
            {futuros.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-muted hover:text-text transition">
                <input
                  type="checkbox"
                  checked={mostrarPlanejados}
                  onChange={(e) => setMostrarPlanejados(e.target.checked)}
                  className="accent-[var(--brand)]"
                />
                Exibir {futuros.length} Posts planejados no hub
              </label>
            )}
          </div>

          <div className="divide-y divide-border">
            {mostrarPlanejados &&
              futuros.map((p) => (
                <article key={p.path} className="p-5 transition hover:bg-surface-2/40">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span className="flex items-center gap-1.5 font-semibold text-brand-soft">
                      <CalendarClock size={14} /> Post planejado no Hub · {STATUS_LABEL[p.status]}
                    </span>
                    {p.dataPlanejada && <span>Data: {dataCurta(p.dataPlanejada)}</span>}
                  </div>
                  <h3 className="mt-1.5 text-base font-semibold text-text">
                    <Link href={`/social/${p.pauta.slug}/${p.slug}`} className="hover:underline">
                      {p.pauta.titulo}
                    </Link>
                  </h3>
                  {p.capa && (
                    <div className="mt-3 max-w-md overflow-hidden rounded-lg border border-border bg-surface-2">
                      <img
                        src={capaUrl(p.capa.path, p.capa.versao)}
                        alt={p.pauta.titulo}
                        className="max-h-80 w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted">
                    <Link
                      href={`/social/${p.pauta.slug}/${p.slug}`}
                      className="text-brand-soft hover:underline font-medium"
                    >
                      Editar Roteiro e Arte →
                    </Link>
                  </div>
                </article>
              ))}

            {feed?.posts.map((p, idx) => {
              const TipoIcon = TIPO[p.tipo]?.icon ?? FileText;
              return (
                <article key={p.urn || p.id || idx} className="p-5 transition hover:bg-surface-2/30">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span className="flex items-center gap-1.5 font-medium">
                      <TipoIcon size={14} className="text-brand-soft" />
                      {TIPO[p.tipo]?.label ?? "Post"}
                    </span>
                    {p.data && <span>{dataLonga(p.data)}</span>}
                  </div>

                  {p.texto && (
                    <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-text line-clamp-4">
                      {p.texto}
                    </p>
                  )}

                  {p.imagem && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface-2">
                      <img
                        src={wsUrl(p.imagem, versao)}
                        alt="Mídia da postagem"
                        className="max-h-96 w-full object-cover"
                      />
                    </div>
                  )}

                  {/* Métricas do post */}
                  <div className="mt-3 flex items-center gap-5 border-t border-border pt-2 text-xs text-muted">
                    <span className="flex items-center gap-1 font-medium">
                      <ThumbsUp size={13} className="text-brand-soft" /> {fmt(p.reacoes ?? p.curtidas)} reações
                    </span>
                    <span className="flex items-center gap-1 font-medium">
                      <MessageSquare size={13} className="text-brand-soft" /> {fmt(p.comentarios)} comentários
                    </span>
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto flex items-center gap-1 text-brand-soft hover:underline font-medium"
                      >
                        Ver no LinkedIn <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {!feed && (
            <div className="px-6 py-12 text-center text-sm text-muted">
              Nenhuma postagem lida ainda. Clique em <b>Atualizar do LinkedIn</b> ao lado.
            </div>
          )}
        </section>

        {/* Lateral */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 text-text shadow-sm">
            <h2 className="font-semibold text-text">Sincronização LinkedIn</h2>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              {feed ? `Atualizado em ${quando(feed.atualizadoEm)}. ` : ""}O hub consome os dados oficiais da Company Page via LinkedIn Marketing API e atualiza periodicamente.
            </p>
            <button
              onClick={atualizar}
              disabled={atualizando}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60 transition shadow-sm"
            >
              {atualizando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {atualizando ? "Sincronizando LinkedIn…" : "Atualizar do LinkedIn"}
            </button>
            {(erro || feed?.erro) && (
              <p className="mt-3 flex gap-1.5 text-xs text-warn">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                Não consegui ler o LinkedIn agora ({erro || feed?.erro}). Exibindo cópia local.
              </p>
            )}
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
              Conecte a conta oficial via OAuth para publicação direta e métricas detalhadas de alcance.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
