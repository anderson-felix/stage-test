import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Globe, PanelsTopLeft } from "lucide-react";
import { listarCampanhas } from "@/lib/ads";
import { listarLPs } from "@/lib/lp";
import { SitePreview } from "@/components/SitePreview";
import { NovaLP } from "@/components/ads/NovaLP";
import { SERVICO_LABEL } from "@/components/ads/labels";

export default function SitePage() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold">Site & LPs</h1>
        <p className="text-sm text-muted">O site da Stage ao vivo e as landing pages geradas pela IA.</p>
      </div>

      <section id="landing-pages">
        <Suspense fallback={<div className="text-sm text-muted">Carregando Landing Pages…</div>}>
          <LandingPages />
        </Suspense>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Globe size={16} className="text-brand-soft" /> Site ao vivo
        </h2>
        <SitePreview url={process.env.SITE_URL || "https://stage.consulting"} />
      </section>
    </div>
  );
}

const STATUS_LP_COR = {
  rascunho: "bg-surface-2 text-muted",
  aprovada: "bg-brand/15 text-brand-soft",
  publicada: "bg-ok/15 text-ok",
};

async function LandingPages() {
  await connection();
  const [lps, campanhas] = await Promise.all([listarLPs(), listarCampanhas()]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <PanelsTopLeft size={16} className="text-brand-soft" /> Landing Pages
        </h2>
        <NovaLP
          campanhas={campanhas.map((c) => ({
            slug: c.slug,
            titulo: c.titulo,
            servico: c.servico,
          }))}
        />
      </div>
      {lps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          Nenhuma LP ainda. A IA gera a página do serviço com formulário; a publicação vem depois do levantamento sobre o site.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {lps.map((lp) => (
            <Link key={lp.slug} href={`/site/lp/${lp.slug}`} className="rounded-xl border border-border bg-surface p-4 transition hover:border-brand/50">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[11px] font-medium uppercase tracking-wider text-brand-soft">{SERVICO_LABEL[lp.servico]}</div>
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_LP_COR[lp.status]}`}>{lp.status}</span>
              </div>
              <h3 className="mt-1 font-medium">{lp.titulo}</h3>
              <div className="mt-2 text-xs text-muted">
                {lp.finalidade === "site" ? "Página do site" : lp.campanha ? "Ads · ligada a uma Campanha" : "Ads · sem Campanha"} · /{lp.slug} ·{" "}
                {lp.versao ? "gerada" : "ainda não gerada"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
