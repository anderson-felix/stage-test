import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SocialAbas } from "@/components/social/SocialAbas";
import { listarPosts, type PostResumo } from "@/lib/social";
import { CANAL_LABEL, FORMATO_LABEL, STATUS_DOT, STATUS_LABEL } from "@/components/social/labels";
import { NovaPauta } from "@/components/social/NovaPauta";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const pad = (n: number) => String(n).padStart(2, "0");

export default function CalendarioPage({ searchParams }: PageProps<"/social/calendario">) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-6">
      <Suspense fallback={<div className="text-sm text-muted">Carregando Calendário…</div>}>
        <Calendario searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Calendario({ searchParams }: { searchParams: PageProps<"/social/calendario">["searchParams"] }) {
  await connection();
  const { mes } = await searchParams;
  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;

  const m = typeof mes === "string" && /^\d{4}-\d{2}$/.test(mes) ? mes : hojeIso.slice(0, 7);
  const [ano, mesNum] = m.split("-").map(Number);
  const primeiro = new Date(ano, mesNum - 1, 1);
  const diasNoMes = new Date(ano, mesNum, 0).getDate();
  const inicioSemana = (primeiro.getDay() + 6) % 7; // segunda = 0
  const anterior = new Date(ano, mesNum - 2, 1);
  const proximo = new Date(ano, mesNum, 1);
  const mesParam = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

  const { posts } = await listarPosts();
  const porDia = new Map<string, PostResumo[]>();
  for (const p of posts) {
    if (!p.dataPlanejada?.startsWith(m)) continue;
    porDia.set(p.dataPlanejada, [...(porDia.get(p.dataPlanejada) ?? []), p]);
  }
  const semData = posts.filter((p) => !p.dataPlanejada && p.status !== "publicado");

  const celulas: (number | null)[] = [
    ...Array<null>(inicioSemana).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ];
  while (celulas.length % 7) celulas.push(null);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendário editorial</h1>
          <p className="text-sm text-muted">Posts pela data planejada. Um Post pronto com data é um Post agendado.</p>
        </div>
        <div className="flex gap-2">
          <SocialAbas atual="calendario" />
          <NovaPauta />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link href={`/social/calendario?mes=${mesParam(anterior)}`} className="rounded-lg border border-border p-1.5 text-muted hover:text-text" aria-label="Mês anterior">
          <ChevronLeft size={16} />
        </Link>
        <h2 className="min-w-44 text-center text-lg font-semibold">
          {MESES[mesNum - 1]} {ano}
        </h2>
        <Link href={`/social/calendario?mes=${mesParam(proximo)}`} className="rounded-lg border border-border p-1.5 text-muted hover:text-text" aria-label="Próximo mês">
          <ChevronRight size={16} />
        </Link>
        {m !== hojeIso.slice(0, 7) && (
          <Link href="/social/calendario" className="ml-2 text-sm text-brand-soft hover:underline">
            Hoje
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-xl border border-border">
            {DIAS.map((d) => (
              <div key={d} className="border-b border-border bg-surface px-2 py-2 text-xs font-medium text-muted">
                {d}
              </div>
            ))}
            {celulas.map((dia, i) => {
              const iso = dia ? `${m}-${pad(dia)}` : "";
              const items = dia ? (porDia.get(iso) ?? []) : [];
              return (
                <div
                  key={i}
                  className={`min-h-28 border-b border-r border-border p-1.5 ${dia ? "bg-bg" : "bg-surface/40"} ${(i + 1) % 7 === 0 ? "border-r-0" : ""}`}
                >
                  {dia && (
                    <div
                      className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        iso === hojeIso ? "bg-brand font-semibold text-white" : "text-muted"
                      }`}
                    >
                      {dia}
                    </div>
                  )}
                  <div className="space-y-1">
                    {items.map((p) => (
                      <PostChip key={p.path} post={p} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="rounded-xl border border-border bg-surface p-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Sem data planejada</h3>
          {semData.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Todos os Posts têm data.</p>
          ) : (
            <div className="mt-2 space-y-1">
              {semData.map((p) => (
                <PostChip key={p.path} post={p} />
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function PostChip({ post }: { post: PostResumo }) {
  return (
    <Link
      href={`/social/${post.pauta.slug}/${post.slug}`}
      title={`${post.pauta.titulo} · ${STATUS_LABEL[post.status]}`}
      className={`block rounded-md border border-border bg-surface-2 px-1.5 py-1 text-[11px] leading-tight hover:border-brand/50 ${
        post.status === "publicado" ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-1 text-brand-soft">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[post.status]}`} />
        {CANAL_LABEL[post.canal]} · {FORMATO_LABEL[post.formato]}
      </div>
      <div className="mt-0.5 line-clamp-2 text-text">{post.pauta.titulo}</div>
    </Link>
  );
}
