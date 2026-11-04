import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Eye, Globe, PanelsTopLeft } from "lucide-react";
import { listarCampanhas } from "@/lib/ads";
import { listarLPs } from "@/lib/lp";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenant-context";
import { SitePreview } from "@/components/SitePreview";
import { NovaLP } from "@/components/ads/NovaLP";
import { DomainSetupModal } from "@/components/site/DomainSetupModal";
import { SERVICO_LABEL } from "@/components/ads/labels";

export default function SitePage() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Site & LPs</h1>
          <p className="text-sm text-muted">O site da marca ao vivo, domÃ­nios customizados e landing pages geradas pela IA.</p>
        </div>
        <DomainSetupModal />
      </div>

      <section id="landing-pages">
        <Suspense fallback={<div className="text-sm text-muted">Carregando Landing Pagesâ€¦</div>}>
          <LandingPages />
        </Suspense>
      </section>

      <Suspense fallback={null}>
        <LiveSiteSection />
      </Suspense>
    </div>
  );
}

const STATUS_LP_COR = {
  rascunho: "bg-surface-2 text-muted",
  aprovada: "bg-brand/15 text-brand-soft",
  publicada: "bg-ok/15 text-ok",
};

async function LiveSiteSection() {
  await connection();
  const { tenantId } = await requireTenantContext();
  const brand = await prisma.brandProfile.findUnique({ where: { tenantId }, select: { websiteUrl: true } });
  const siteUrl = brand?.websiteUrl || process.env.SITE_URL || "https://stage.consulting";

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <Globe size={16} className="text-brand-soft" /> Site ao vivo ({siteUrl})
      </h2>
      <SitePreview url={siteUrl} />
    </section>
  );
}

async function LandingPages() {
  await connection();
  const { tenantId } = await requireTenantContext();
  const [lps, campanhas, dbLps, customDomain] = await Promise.all([
    listarLPs(tenantId),
    listarCampanhas(tenantId),
    prisma.landingPage.findMany({
      where: { tenantId },
      select: { slug: true, viewsCount: true, _count: { select: { leads: true } } },
    }),
    prisma.customDomain.findFirst({
      where: { tenantId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const statsBySlug = new Map(
    dbLps.map((d) => [d.slug, { views: d.viewsCount, leads: d._count.leads }])
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <PanelsTopLeft size={16} className="text-brand-soft" /> Landing Pages
          </h2>
          {customDomain && (
            <span
              className={`rounded-md px-2 py-0.5 font-mono text-[11px] ${
                customDomain.dnsStatus === "VERIFIED" ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn"
              }`}
            >
              {customDomain.domain} ({customDomain.dnsStatus === "VERIFIED" ? "DNS OK" : "DNS Pendente"})
            </span>
          )}
        </div>
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
          Nenhuma LP ainda. A IA gera a pÃ¡gina do serviÃ§o com formulÃ¡rio e captura automÃ¡tica de leads.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {lps.map((lp) => {
            const st = statsBySlug.get(lp.slug) ?? { views: 0, leads: 0 };
            return (
              <Link
                key={lp.slug}
                href={`/site/lp/${lp.slug}`}
                className="rounded-xl border border-border bg-surface p-4 transition hover:border-brand/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-brand-soft">
                    {SERVICO_LABEL[lp.servico]}
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_LP_COR[lp.status]}`}>
                    {lp.status}
                  </span>
                </div>
                <h3 className="mt-1 font-medium">{lp.titulo}</h3>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {lp.finalidade === "site" ? "PÃ¡gina do site" : lp.campanha ? "Ads Â· com Campanha" : "Ads Â· sem Campanha"} Â· /{lp.slug}
                  </span>
                  <span className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="flex items-center gap-1" title="VisualizaÃ§Ãµes pÃºblicas">
                      <Eye size={12} /> {st.views}
                    </span>
                    <span>Â· {st.leads} leads</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
