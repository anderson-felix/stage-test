import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { lerCampanha, resolveLandingPagePublicUrl, type LpVinculadaOption } from "@/lib/ads";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant-context";
import { CampanhaDetalhe } from "@/components/ads/CampanhaDetalhe";

export default function CampanhaPage({ params, searchParams }: PageProps<"/leads/campanhas/[slug]">) {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-sm text-muted">Carregando Campanha…</div>}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: PageProps<"/leads/campanhas/[slug]">["params"];
  searchParams: PageProps<"/leads/campanhas/[slug]">["searchParams"];
}) {
  await connection();
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");

  const { slug } = await params;
  const { iniciar } = await searchParams;

  const [campanha, dbLps, tenant] = await Promise.all([
    lerCampanha(slug, ctx.tenantId),
    prisma.landingPage.findMany({
      where: { tenantId: ctx.tenantId },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        briefingData: true,
        customDomain: { select: { domain: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { slug: true },
    }),
  ]);

  if (!campanha) notFound();

  const landingPagesDisponiveis: LpVinculadaOption[] = await Promise.all(
    dbLps.map(async (lp) => ({
      id: lp.id,
      slug: lp.slug,
      titulo: lp.title,
      status: lp.status === "PUBLISHED" ? "publicada" : "rascunho",
      urlPublica: await resolveLandingPagePublicUrl(lp, tenant?.slug ?? "cliente", null),
    }))
  );

  const acao = iniciar === "montar" || iniciar === "sementes" ? iniciar : null;
  return (
    <CampanhaDetalhe
      key={campanha.path}
      inicial={{ ...campanha, landingPagesDisponiveis }}
      iniciar={acao}
      landingPagesDisponiveis={landingPagesDisponiveis}
    />
  );
}
