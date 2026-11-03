import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { BarChart3, FileSpreadsheet, Lock, Megaphone, Users } from "lucide-react";
import { listarCampanhas } from "@/lib/ads";
import { NovaCampanha } from "@/components/ads/NovaCampanha";
import { SERVICO_LABEL, STATUS_CAMPANHA_COR, STATUS_CAMPANHA_LABEL, fmtBRL } from "@/components/ads/labels";

export default function LeadsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tráfego & Leads</h1>
          <p className="text-sm text-muted">
            Da palavra-chave ao lead: campanhas e funil. As landing pages ficam em{" "}
            <Link href="/site#landing-pages" className="text-brand-soft hover:underline">
              Site & LPs
            </Link>
            .
          </p>
        </div>
        <NovaCampanha />
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Megaphone size={16} className="text-brand-soft" /> Campanhas Google Ads
        </h2>
        <Suspense fallback={<div className="text-sm text-muted">Carregando Campanhas…</div>}>
          <Campanhas />
        </Suspense>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Próximas etapas</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            {
              icon: Users,
              titulo: "Leads e funil",
              texto: "Leads do formulário com origem da campanha e funil novo → em contato → reunião → proposta → ganho/perdido.",
              selo: "aguardando decisão do CRM",
            },
            {
              icon: BarChart3,
              titulo: "Relatórios de Ads",
              texto: "Relatório semanal a partir do CSV exportado do Google Ads, com alertas e recomendações.",
              selo: "quando a campanha rodar",
            },
          ].map(({ icon: Icon, titulo, texto, selo }) => (
            <div key={titulo} className="rounded-xl border border-border bg-surface p-4 opacity-75">
              <div className="flex items-center justify-between">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-muted">
                  <Icon size={16} />
                </div>
                <span className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  <Lock size={10} /> {selo}
                </span>
              </div>
              <div className="mt-3 font-medium">{titulo}</div>
              <p className="mt-1 text-sm text-muted">{texto}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

async function Campanhas() {
  await connection();
  const campanhas = await listarCampanhas();

  if (campanhas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
        <FileSpreadsheet size={22} />
        Nenhuma Campanha ainda. Crie a primeira: com o CSV do Planejador de palavras-chave, o Claude monta tudo para o Google Ads Editor.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {campanhas.map((c) => (
        <Link key={c.slug} href={`/leads/campanhas/${c.slug}`} className="rounded-xl border border-border bg-surface p-4 transition hover:border-brand/50">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[11px] font-medium uppercase tracking-wider text-brand-soft">{SERVICO_LABEL[c.servico]}</div>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_CAMPANHA_COR[c.status]}`}>{STATUS_CAMPANHA_LABEL[c.status]}</span>
          </div>
          <h3 className="mt-1 font-medium">{c.titulo}</h3>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span>{c.montada ? "Campanha montada" : c.temPesquisa ? "Pesquisa enviada" : c.temSementes ? "Termos sugeridos" : "Sem pesquisa"}</span>
            {c.orcamentoDiario !== null && <span>{fmtBRL(c.orcamentoDiario)}/dia</span>}
            <span>{c.regiao === "Brazil" ? "Brasil" : c.regiao}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
