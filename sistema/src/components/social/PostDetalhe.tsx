"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Download, Loader2, Pencil, Trash2 } from "lucide-react";
import type { PostCompleto, Status } from "@/lib/social";
import { ArtePainel } from "./ArtePainel";
import { CANAL_LABEL, FORMATO_LABEL, SERIE_LABEL, STATUS_DOT, STATUS_LABEL, STATUS_ORDEM } from "./labels";

type Slide = { titulo: string; texto: string; visual: string; fonte: string; extra: string };

/** Quebra o Roteiro em slides ("### Slide N — LAYOUT" + linhas Texto:/Visual:/Fonte:). */
function parseRoteiro(md: string): Slide[] | null {
  const blocos = md.split(/^###\s+/m).slice(1);
  if (blocos.length === 0) return null;
  return blocos.map((bloco) => {
    const [titulo, ...linhas] = bloco.split("\n");
    const slide: Slide = { titulo: titulo.trim(), texto: "", visual: "", fonte: "", extra: "" };
    for (const linha of linhas) {
      const m = /^(Texto|Visual|Fonte):\s*(.*)$/.exec(linha.trim());
      if (m) slide[m[1].toLowerCase() as "texto" | "visual" | "fonte"] = m[2].replace(/^"(.*)"$/, "$1");
      else if (linha.trim()) slide.extra += (slide.extra ? "\n" : "") + linha.trim();
    }
    return slide;
  });
}

export function PostDetalhe({ inicial }: { inicial: PostCompleto }) {
  const router = useRouter();
  const [post, setPost] = useState(inicial);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [editandoRoteiro, setEditandoRoteiro] = useState(false);
  const [roteiro, setRoteiro] = useState(inicial.roteiro);
  const [legenda, setLegenda] = useState(inicial.legenda);
  const [link, setLink] = useState(inicial.link ?? "");
  const [copiado, setCopiado] = useState<string | null>(null);

  const base = `/api/social/posts/${post.pauta.slug}/${post.slug}`;
  const slides = parseRoteiro(post.roteiro);
  const legendaMudou = legenda.trim() !== post.legenda.trim();

  async function salvar(campo: string, mudancas: Record<string, unknown>) {
    setSalvando(campo);
    setErro("");
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mudancas),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro ao salvar");
      setPost(json);
      return true;
    } catch (err) {
      setErro((err as Error).message);
      return false;
    } finally {
      setSalvando(null);
    }
  }

  async function excluir(pautaInteira: boolean) {
    const alvo =
      pautaInteira || post.irmaos.length <= 1
        ? `a Pauta "${post.pauta.titulo}"${post.irmaos.length > 1 ? ` e seus ${post.irmaos.length} Posts` : ""}`
        : `o Post ${CANAL_LABEL[post.canal]} · ${FORMATO_LABEL[post.formato]} desta Pauta`;
    if (!confirm(`Excluir ${alvo}? Os arquivos vão para a lixeira do workspace (marketing/social/_lixeira/).`)) return;
    setSalvando("excluir");
    setErro("");
    try {
      const res = await fetch(`${base}${pautaInteira ? "?pauta=1" : ""}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro ao excluir");
      router.push("/social");
      router.refresh();
    } catch (err) {
      setErro((err as Error).message);
      setSalvando(null);
    }
  }

  async function copiar(qual: string, texto: string) {
    await navigator.clipboard.writeText(texto);
    setCopiado(qual);
    setTimeout(() => setCopiado(null), 1500);
  }

  function baixarMd() {
    const conteudo = [
      `# ${post.pauta.titulo}`,
      "",
      `**Canal:** ${CANAL_LABEL[post.canal]} · **Formato:** ${FORMATO_LABEL[post.formato]} · **Série:** ${SERIE_LABEL[post.serie]}`,
      post.dataPlanejada ? `**Data planejada:** ${post.dataPlanejada}` : "",
      post.pauta.angulo ? `**Ângulo:** ${post.pauta.angulo}` : "",
      "",
      "## Roteiro",
      "",
      post.roteiro,
      "",
      "## Legenda",
      "",
      post.legenda,
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([conteudo], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `roteiro-${post.pauta.slug}-${post.slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/social" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft size={15} /> Social
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-brand-soft">
            {CANAL_LABEL[post.canal]} · {FORMATO_LABEL[post.formato]} · {SERIE_LABEL[post.serie]}
            {post.pauta.exemplo && <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 normal-case tracking-normal text-muted">exemplo</span>}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{post.pauta.titulo}</h1>
          {post.pauta.angulo && <p className="mt-1 text-sm text-muted">Ângulo: {post.pauta.angulo}</p>}
        </div>
        {post.irmaos.length > 1 && (
          <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
            {post.irmaos.map((i) => (
              <Link
                key={i.slug}
                href={`/social/${post.pauta.slug}/${i.slug}`}
                className={`rounded-md px-3 py-1.5 text-xs ${
                  i.slug === post.slug ? "bg-brand text-white" : "text-muted hover:text-text"
                }`}
              >
                {CANAL_LABEL[i.canal]} · {FORMATO_LABEL[i.formato]}
              </Link>
            ))}
          </div>
        )}
      </div>

      {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
        <ArtePainel post={post} onAtualizado={setPost} />

        {/* Roteiro */}
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Roteiro</h2>
            {editandoRoteiro ? (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setRoteiro(post.roteiro);
                    setEditandoRoteiro(false);
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-text"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => (await salvar("roteiro", { roteiro })) && setEditandoRoteiro(false)}
                  disabled={salvando === "roteiro"}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
                >
                  {salvando === "roteiro" && <Loader2 size={14} className="animate-spin" />} Salvar Roteiro
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditandoRoteiro(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-text"
              >
                <Pencil size={14} /> Editar
              </button>
            )}
          </div>

          {editandoRoteiro ? (
            <textarea
              value={roteiro}
              onChange={(e) => setRoteiro(e.target.value)}
              rows={28}
              className="w-full rounded-xl border border-border bg-bg p-4 font-mono text-sm leading-relaxed outline-none focus:border-brand"
            />
          ) : slides ? (
            <ol className="space-y-3">
              {slides.map((s, i) => (
                <li key={i} className="rounded-xl border border-border bg-surface p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-soft">{s.titulo}</div>
                  {s.texto && <p className="mt-2 text-base font-medium leading-snug">{s.texto}</p>}
                  {s.visual && (
                    <p className="mt-2 text-sm text-muted">
                      <span className="font-medium text-text/70">Visual:</span> {s.visual}
                    </p>
                  )}
                  {s.fonte && <p className="mt-1 text-xs text-warn">Fonte: {s.fonte}</p>}
                  {s.extra && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{s.extra}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <pre className="whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 text-sm">{post.roteiro || "Sem Roteiro."}</pre>
          )}
        </section>
        </div>

        {/* Lateral */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4">
            {post.status === "pronto" && (
              <button
                onClick={() => salvar("status", { status: "publicado" })}
                disabled={salvando !== null}
                className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-ok/15 px-3 py-2 text-sm font-medium text-ok hover:bg-ok/25"
              >
                <Check size={15} /> Marcar como publicado
              </button>
            )}
            {post.status === "publicado" && post.publicadoEm && (
              <p className="mb-3 text-xs text-muted">Publicado em {post.publicadoEm.split("-").reverse().join("/")}</p>
            )}
            {post.status === "publicado" && (
              <label className="mb-4 block">
                <span className="text-xs font-medium uppercase tracking-wider text-muted">Link do post</span>
                <div className="mt-1 flex gap-1.5">
                  <input
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder={post.canal === "instagram" ? "https://www.instagram.com/p/…" : "https://www.linkedin.com/posts/…"}
                    className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                  {link.trim() !== (post.link ?? "") && (
                    <button
                      type="button"
                      onClick={() => salvar("link", { link: link.trim() || null })}
                      disabled={salvando !== null}
                      className="rounded-lg bg-brand px-3 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                    >
                      {salvando === "link" ? <Loader2 size={14} className="animate-spin" /> : "Salvar"}
                    </button>
                  )}
                </div>
                {post.canal === "instagram" && <span className="mt-1 block text-xs text-muted">Aparece em Social → Instagram como post real.</span>}
              </label>
            )}
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Status</h3>
            <div className="mt-2 grid grid-cols-1 gap-1">
              {STATUS_ORDEM.map((s: Status) => (
                <button
                  key={s}
                  onClick={() => salvar("status", { status: s })}
                  disabled={salvando !== null}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    post.status === s ? "bg-surface-2 font-medium text-text ring-1 ring-brand" : "text-muted hover:bg-surface-2"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
                  {STATUS_LABEL[s]}
                  {post.status === s && <Check size={14} className="ml-auto text-brand-soft" />}
                </button>
              ))}
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">Data planejada</span>
              <input
                type="date"
                value={post.dataPlanejada ?? ""}
                onChange={(e) => salvar("data", { dataPlanejada: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none [color-scheme:dark] focus:border-brand"
              />
            </label>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Legenda</h3>
              <button onClick={() => copiar("legenda", post.legenda)} className="flex items-center gap-1 text-xs text-muted hover:text-text">
                {copiado === "legenda" ? <Check size={13} className="text-ok" /> : <Copy size={13} />} Copiar
              </button>
            </div>
            <textarea
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              rows={10}
              className="mt-2 w-full rounded-lg border border-border bg-bg p-3 text-sm leading-relaxed outline-none focus:border-brand"
            />
            {legendaMudou && (
              <button
                onClick={() => salvar("legenda", { legenda })}
                disabled={salvando === "legenda"}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
              >
                {salvando === "legenda" && <Loader2 size={14} className="animate-spin" />} Salvar Legenda
              </button>
            )}
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Exportar para o designer</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => copiar("roteiro", `${post.roteiro}\n\n---\nLegenda:\n${post.legenda}`)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:border-brand/50"
              >
                {copiado === "roteiro" ? <Check size={14} className="text-ok" /> : <Copy size={14} />} Copiar
              </button>
              <button
                onClick={baixarMd}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:border-brand/50"
              >
                <Download size={14} /> Baixar .md
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Excluir</h3>
            <div className="mt-2 space-y-2">
              {post.irmaos.length > 1 && (
                <button
                  onClick={() => excluir(false)}
                  disabled={salvando !== null}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-danger hover:border-danger/60 disabled:opacity-50"
                >
                  <Trash2 size={14} /> Só este Post ({CANAL_LABEL[post.canal]} · {FORMATO_LABEL[post.formato]})
                </button>
              )}
              <button
                onClick={() => excluir(true)}
                disabled={salvando !== null}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-danger hover:border-danger/60 disabled:opacity-50"
              >
                {salvando === "excluir" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {post.irmaos.length > 1 ? ` Pauta inteira (${post.irmaos.length} Posts)` : " Excluir Pauta"}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">Vai para marketing/social/_lixeira/ no workspace; dá para recuperar de lá.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
