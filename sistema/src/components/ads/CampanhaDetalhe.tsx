"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  Loader2,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import type { CampanhaCompleta, GrupoAnuncios, StatusCampanha, LpVinculadaOption } from "@/lib/ads";
import { lerStreamClaude } from "@/lib/stream-client";
import { useI18n } from "@/lib/use-i18n";
import {
  ProgressoIA,
  escrevendo,
  lendo,
  pensando,
  useProgressoIA,
  type ConfigProgresso,
} from "../ProgressoIA";
import {
  SERVICO_LABEL,
  STATUS_CAMPANHA_COR,
  STATUS_CAMPANHA_LABEL,
  STATUS_CAMPANHA_ORDEM,
  fmtBRL,
  fmtNum,
} from "./labels";

type Tarefa = "sementes" | "montar";

const ETAPAS: Record<Tarefa, ConfigProgresso> = {
  sementes: {
    etapas: [
      { rotulo: "Lendo o serviço e a estratégia", quando: lendo },
      { rotulo: "Escolhendo termos com intenção de compra", quando: pensando },
      { rotulo: "Gravando a lista de termos", quando: escrevendo },
    ],
    estimativaSeg: 60,
  },
  montar: {
    etapas: [
      { rotulo: "Lendo a Pesquisa e o serviço", quando: lendo },
      { rotulo: "Agrupando palavras e escrevendo os anúncios", quando: pensando },
      { rotulo: "Gerando os CSVs do Google Ads Editor", quando: escrevendo },
    ],
    estimativaSeg: 180,
  },
};

export function CampanhaDetalhe({
  inicial,
  iniciar,
  landingPagesDisponiveis,
}: {
  inicial: CampanhaCompleta;
  iniciar: Tarefa | null;
  landingPagesDisponiveis?: LpVinculadaOption[];
}) {
  const router = useRouter();
  const { dict } = useI18n();
  const [c, setC] = useState(inicial);
  const [tarefa, setTarefa] = useState<Tarefa>("montar");
  const progresso = useProgressoIA(ETAPAS[tarefa]);
  const rodando = progresso.estado !== null;
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [lpUrl, setLpUrl] = useState(inicial.lpUrl);
  const [copiado, setCopiado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const iniciou = useRef(false);

  const [lps, setLps] = useState<LpVinculadaOption[]>(
    landingPagesDisponiveis ?? inicial.landingPagesDisponiveis ?? []
  );

  useEffect(() => {
    if (lps.length === 0) {
      fetch("/api/lp")
        .then((res) => (res.ok ? res.json() : []))
        .then((data: unknown) => {
          if (Array.isArray(data)) {
            setLps(
              data.map((item: { id: string; slug: string; titulo: string; status: string; urlPublica?: string }) => ({
                id: item.id,
                slug: item.slug,
                titulo: item.titulo,
                status: item.status,
                urlPublica: item.urlPublica || `/lp/${item.slug}`,
              }))
            );
          }
        })
        .catch(() => {});
    }
  }, [lps.length]);

  const base = `/api/ads/campanhas/${c.slug}`;

  async function recarregar() {
    const res = await fetch(base);
    if (res.ok) {
      const updated = (await res.json()) as CampanhaCompleta;
      setC(updated);
      setLpUrl(updated.lpUrl);
    }
  }

  async function rodar(tarefaExec: Tarefa) {
    setTarefa(tarefaExec);
    progresso.iniciar();
    setErro("");
    try {
      const res = await fetch(`${base}/montar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tarefa: tarefaExec }),
      });
      await lerStreamClaude(res, progresso.onEvento);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      progresso.parar();
    }
  }

  useEffect(() => {
    if (!iniciar) return;
    const t = setTimeout(() => {
      if (iniciou.current) return;
      iniciou.current = true;
      router.replace(`/leads/campanhas/${inicial.slug}`, { scroll: false });
      if (iniciar === "montar" && !inicial.montada) void rodar("montar");
      if (iniciar === "sementes" && !inicial.temSementes) void rodar("sementes");
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispara só na montagem
  }, []);

  async function enviarPesquisa(f: File | undefined) {
    if (!f) return;
    setEnviando(true);
    setErro("");
    try {
      const form = new FormData();
      form.append("arquivo", f);
      const res = await fetch(`${base}/pesquisa`, { method: "PUT", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro no upload");
      setC(json.campanha);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function salvar(m: Record<string, unknown>) {
    setErro("");
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(m),
    });
    const json = await res.json();
    if (!res.ok) setErro(json.error ?? "erro ao salvar");
    else {
      setC(json);
      if (typeof json.lpUrl === "string") setLpUrl(json.lpUrl);
    }
  }

  async function handleTrocarLp(novoId: string) {
    const selecionada = lps.find((l) => l.id === novoId);
    const novaUrl = selecionada?.urlPublica ?? (novoId ? `/lp/${selecionada?.slug}` : lpUrl);
    await salvar({
      landingPageId: novoId || null,
      ...(novaUrl ? { lpUrl: novaUrl } : {}),
    });
  }

  const topPesquisa = [...c.pesquisa]
    .sort((a, b) => (b.volumeMax ?? -1) - (a.volumeMax ?? -1))
    .slice(0, 40);
  const totalPalavras = c.grupos.reduce((n, g) => n + g.palavras.length, 0);
  const totalAnuncios = c.grupos.reduce((n, g) => n + g.anuncios.length, 0);
  const ocupado = rodando || enviando;
  const lpVinculada = lps.find((l) => l.id === c.landingPageId);
  const temLpPublicada = lpVinculada && (lpVinculada.status === "publicada" || lpVinculada.status === "PUBLISHED");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link
        href="/leads"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={15} /> {dict.nav?.leads || "Tráfego & Leads"}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-brand-soft">
            Google Ads · {SERVICO_LABEL[c.servico]} ·{" "}
            {c.regiao === "Brazil" ? "Brasil" : c.regiao}
            {c.orcamentoDiario !== null && ` · ${fmtBRL(c.orcamentoDiario)}/dia`}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{c.titulo}</h1>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
          {STATUS_CAMPANHA_ORDEM.map((s: StatusCampanha) => (
            <button
              key={s}
              onClick={() => void salvar({ status: s })}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                c.status === s
                  ? (STATUS_CAMPANHA_COR[s] ?? "bg-surface-2 text-muted") + " font-medium"
                  : "text-muted hover:text-text"
              }`}
            >
              {STATUS_CAMPANHA_LABEL[s] ?? s}
            </button>
          ))}
        </div>
      </div>

      {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt"
        className="hidden"
        onChange={(e) => void enviarPesquisa(e.target.files?.[0])}
      />

      {/* Vínculo de Landing Page em Destaque no Topo da Campanha */}
      <div className="mt-6 rounded-xl border border-brand/30 bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-soft">
              <Link2 size={14} /> {dict.ads?.linkLP || "Landing Page de Destino (Final URL dos Anúncios & Sitelinks)"}
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Ao vincular uma Landing Page do Workspace, a URL pública real (domínio customizado ou subdomínio Stage) é injetada automaticamente em{" "}
              <code>anuncios.csv</code> e <code>extensoes-sitelinks.csv</code>.
            </p>
          </div>
          {lpVinculada && (
            <Link
              href={`/site/lp/${lpVinculada.slug}`}
              className="flex items-center gap-1 text-xs font-medium text-brand-soft hover:underline"
            >
              Abrir LP: {lpVinculada.titulo} <ExternalLink size={12} />
            </Link>
          )}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block text-xs text-muted">
            Vincular Landing Page existente do Workspace
            <select
              value={c.landingPageId ?? ""}
              onChange={(e) => void handleTrocarLp(e.target.value)}
              disabled={ocupado}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-brand"
            >
              <option value="">Sem LP vinculada (definir URL manualmente)</option>
              {lps.map((lp) => (
                <option key={lp.id} value={lp.id}>
                  {lp.titulo} ({lp.status === "publicada" || lp.status === "PUBLISHED" ? "Publicada" : "Rascunho"}) — {lp.urlPublica}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-muted">
            Final URL ativa nos CSVs do Google Ads Editor
            <div className="mt-1 flex gap-2">
              <input
                value={lpUrl}
                onChange={(e) => setLpUrl(e.target.value)}
                placeholder="https://lp.suaempresa.com.br/..."
                className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-brand"
              />
              {lpUrl !== c.lpUrl && (
                <button
                  onClick={() => void salvar({ lpUrl })}
                  className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-hover"
                >
                  {dict.common?.save || "Aplicar nos CSVs"}
                </button>
              )}
            </div>
          </label>
        </div>

        {/* Alerta de ausência de Landing Page publicada vinculada */}
        {!temLpPublicada && (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
            <div>
              <strong className="font-semibold text-amber-300">
                Aviso: Nenhuma Landing Page publicada vinculada a esta campanha.
              </strong>
              <p className="mt-0.5 text-amber-200/90 leading-relaxed">
                Antes de exportar os arquivos CSV para o Google Ads Editor, vincule e publique uma Landing Page oficial. Sem uma LP publicada, os anúncios serão configurados com a URL manual ({lpUrl || "vazia"}), o que pode impactar a aprovação dos anúncios e o rastreamento de conversões no Google Ads.
              </p>
            </div>
          </div>
        )}
      </div>

      {rodando && (
        <div className="mt-6">
          <ProgressoIA
            titulo={
              tarefa === "montar"
                ? "O Claude está montando a Campanha"
                : "O Claude está sugerindo os termos para pesquisar"
            }
            progresso={progresso}
            aviso="Não saia desta página, senão a geração é cancelada."
          />
        </div>
      )}

      {/* Etapas */}
      <ol className="mt-6 grid gap-3 md:grid-cols-3">
        <Etapa
          n={1}
          titulo="Termos para pesquisar"
          feito={c.temSementes || c.temPesquisa}
          opcional
        >
          {c.sementes ? (
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(
                  c.sementes!
                    .replace(/^#+.*$/gm, "")
                    .replace(/\n{2,}/g, "\n")
                    .trim()
                );
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1500);
              }}
              className="flex items-center gap-1.5 text-xs text-brand-soft hover:underline"
            >
              {copiado ? <Check size={13} /> : <Copy size={13} />} Copiar termos para o Planejador
            </button>
          ) : (
            <button
              onClick={() => void rodar("sementes")}
              disabled={ocupado}
              className="flex items-center gap-1.5 text-xs text-brand-soft hover:underline disabled:opacity-50"
            >
              <Sparkles size={13} /> Sugerir termos
            </button>
          )}
        </Etapa>
        <Etapa n={2} titulo="Pesquisa do Planejador" feito={c.temPesquisa}>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={ocupado}
            className="flex items-center gap-1.5 text-xs text-brand-soft hover:underline disabled:opacity-50"
          >
            {enviando ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {c.temPesquisa
              ? `${c.pesquisa.length} termos · enviar outro CSV`
              : "Enviar CSV do Planejador"}
          </button>
        </Etapa>
        <Etapa n={3} titulo="Campanha montada" feito={c.montada}>
          <button
            onClick={() => void rodar("montar")}
            disabled={!c.temPesquisa || ocupado}
            className="flex items-center gap-1.5 text-xs text-brand-soft hover:underline disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Wand2 size={13} /> {c.montada ? "Montar de novo" : "Montar campanha"}
          </button>
        </Etapa>
      </ol>

      {c.montada && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <Numero label="Grupos" valor={c.grupos.length} />
              <Numero label="Palavras-chave" valor={totalPalavras} />
              <Numero
                label="Negativas"
                valor={
                  c.negativasGlobais.length +
                  c.grupos.reduce((n, g) => n + g.negativas.length, 0)
                }
              />
              <Numero label="Anúncios" valor={totalAnuncios} />
            </div>
            {c.grupos.map((g) => (
              <Grupo key={g.nome} grupo={g} />
            ))}
            {c.negativasGlobais.length > 0 && (
              <div className="rounded-xl border border-border bg-surface p-4">
                <h3 className="text-sm font-medium">Negativas da campanha</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.negativasGlobais.map((n) => (
                    <span
                      key={n}
                      className="rounded bg-danger/10 px-2 py-0.5 text-xs text-danger"
                    >
                      −{n}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
                Arquivos para o Google Ads Editor
              </h3>
              {!temLpPublicada && (
                <p className="mt-2 text-xs text-amber-400">
                  ⚠️ Aviso: Nenhuma LP vinculada publicada. Os arquivos abaixo contêm URLs genéricas/manuais.
                </p>
              )}
              <ul className="mt-2 space-y-1.5">
                {c.arquivos.map((a) => (
                  <li key={a}>
                    <a
                      href={`/api/ads/arquivo?path=${encodeURIComponent(a)}`}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs hover:border-brand/50 hover:text-brand-soft"
                    >
                      <Download size={13} /> {a.split("/").pop()}
                    </a>
                  </li>
                ))}
              </ul>
              {c.lpUrl && (
                <p className="mt-2.5 text-[11px] text-ok">
                  Final URL injetada automaticamente: <code className="break-all">{c.lpUrl}</code>
                </p>
              )}
            </div>
          </aside>
        </div>
      )}

      {c.corpo && (
        <section className="prose-chat mt-6 rounded-xl border border-border bg-surface p-5 text-sm leading-relaxed [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_table]:my-2 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_th]:border [&_th]:border-border [&_th]:px-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.corpo}</ReactMarkdown>
        </section>
      )}

      {c.temPesquisa && (
        <section className="mt-6 rounded-xl border border-border bg-surface p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <FileSpreadsheet size={16} className="text-brand-soft" /> Pesquisa ·{" "}
            {c.pesquisa.length} termos
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Palavra-chave</th>
                  <th className="py-1.5 pr-3 font-medium">Buscas/mês</th>
                  <th className="py-1.5 pr-3 font-medium">Concorrência</th>
                  <th className="py-1.5 font-medium">Lance topo (R$)</th>
                </tr>
              </thead>
              <tbody>
                {topPesquisa.map((p) => (
                  <tr key={p.palavra} className="border-t border-border">
                    <td className="py-1.5 pr-3">{p.palavra}</td>
                    <td className="py-1.5 pr-3 text-muted">
                      {p.volume || fmtNum(p.volumeMax)}
                    </td>
                    <td className="py-1.5 pr-3 text-muted">{p.concorrencia || "—"}</td>
                    <td className="py-1.5 text-muted">
                      {p.lanceMin !== null || p.lanceMax !== null
                        ? `${fmtNum(p.lanceMin)} – ${fmtNum(p.lanceMax)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {c.pesquisa.length > topPesquisa.length && (
              <p className="mt-2 text-xs text-muted">Mostrando os 40 de maior volume.</p>
            )}
          </div>
        </section>
      )}

      {c.sementes && !c.temPesquisa && (
        <section className="prose-chat mt-6 rounded-xl border border-border bg-surface p-5 text-sm [&_h2]:mt-3 [&_h2]:font-semibold">
          <p className="mb-2 text-muted">
            Cole estes termos no Planejador de palavras-chave (Google Ads → conta de administrador → Ferramentas → Planejador → &ldquo;Ver volume de pesquisa e previsões&rdquo;), baixe o resultado em CSV e envie na etapa 2.
          </p>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.sementes}</ReactMarkdown>
        </section>
      )}
    </div>
  );
}

function Etapa({
  n,
  titulo,
  feito,
  opcional,
  children,
}: {
  n: number;
  titulo: string;
  feito: boolean;
  opcional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={`rounded-xl border p-3 ${
        feito ? "border-ok/40 bg-ok/5" : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
            feito ? "bg-ok text-bg" : "bg-surface-2 text-muted"
          }`}
        >
          {feito ? <Check size={12} /> : n}
        </span>
        {titulo}
        {opcional && <span className="text-xs font-normal text-muted">(opcional)</span>}
      </div>
      <div className="mt-2 pl-7">{children}</div>
    </li>
  );
}

function Numero({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="text-lg font-semibold">{valor}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function Grupo({ grupo }: { grupo: GrupoAnuncios }) {
  const [aberto, setAberto] = useState(false);
  const anuncio = grupo.anuncios[0];
  let dominio = "stage.consulting";
  try {
    if (anuncio?.finalUrl) dominio = new URL(anuncio.finalUrl).host;
  } catch {
    // ignore URL parse error
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{grupo.nome}</h3>
        <span className="text-xs text-muted">
          {grupo.palavras.length} palavras · {grupo.anuncios.length} anúncios
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {grupo.palavras.map((p) => (
          <span
            key={p.texto + p.tipo}
            className="rounded bg-surface-2 px-2 py-0.5 text-xs"
          >
            {p.tipo === "Exact"
              ? `[${p.texto}]`
              : p.tipo === "Phrase"
                ? `"${p.texto}"`
                : p.texto}
          </span>
        ))}
      </div>

      {anuncio && (
        <div className="mt-3 rounded-lg bg-white p-3 text-[#202124]">
          <div className="text-[11px]">
            <span className="font-semibold">Patrocinado</span> · {dominio}
            {anuncio.path1 && `/${anuncio.path1}`}
            {anuncio.path2 && `/${anuncio.path2}`}
          </div>
          <div className="mt-0.5 text-[17px] leading-snug text-[#1a0dab]">
            {anuncio.headlines.slice(0, 3).join(" | ")}
          </div>
          <div className="mt-0.5 text-[13px] text-[#4d5156]">
            {anuncio.descriptions.slice(0, 2).join(" ")}
          </div>
        </div>
      )}

      <button
        onClick={() => setAberto(!aberto)}
        className="mt-2 text-xs text-brand-soft hover:underline"
      >
        {aberto ? "Esconder" : "Ver"} todos os títulos e descrições
      </button>
      {aberto && (
        <div className="mt-2 space-y-3 text-xs">
          {grupo.anuncios.map((a, i) => (
            <div key={i}>
              <div className="font-medium text-muted">Anúncio {i + 1}</div>
              <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
                {a.headlines.map((h, j) => (
                  <li
                    key={j}
                    className="flex justify-between gap-2 rounded bg-surface-2 px-2 py-0.5"
                  >
                    <span>{h}</span>
                    <span className={h.length > 30 ? "text-danger" : "text-muted"}>
                      {h.length}/30
                    </span>
                  </li>
                ))}
              </ul>
              <ul className="mt-1 space-y-0.5">
                {a.descriptions.map((d, j) => (
                  <li
                    key={j}
                    className="flex justify-between gap-2 rounded bg-surface-2 px-2 py-0.5"
                  >
                    <span>{d}</span>
                    <span className={d.length > 90 ? "text-danger" : "text-muted"}>
                      {d.length}/90
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {grupo.negativas.length > 0 && (
            <div className="text-muted">
              Negativas do grupo: {grupo.negativas.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
