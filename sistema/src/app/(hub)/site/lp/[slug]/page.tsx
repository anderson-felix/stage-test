import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { listarCampanhas } from "@/lib/ads";
import { lerLP } from "@/lib/lp";
import { listTenantDomains } from "@/lib/domains";
import { getTenantContext } from "@/lib/tenant-context";
import { LPDetalhe } from "@/components/ads/LPDetalhe";

export default function LPPage({ params, searchParams }: PageProps<"/site/lp/[slug]">) {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-sm text-muted">Carregando LP…</div>}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: PageProps<"/site/lp/[slug]">["params"];
  searchParams: PageProps<"/site/lp/[slug]">["searchParams"];
}) {
  await connection();
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");

  const { slug } = await params;
  const { gerar } = await searchParams;

  const [lp, campanhasRes, domainsData] = await Promise.all([
    lerLP(slug, ctx.tenantId),
    listarCampanhas(ctx.tenantId),
    listTenantDomains(ctx.tenantId),
  ]);

  if (!lp) notFound();

  const campanhas = campanhasRes.map((c) => ({ slug: c.slug, titulo: c.titulo }));
  return (
    <LPDetalhe
      key={lp.path}
      inicial={lp}
      campanhas={campanhas}
      gerarAoAbrir={gerar === "1"}
      dominiosIniciais={domainsData.customDomains}
      fallbackDomainInicial={domainsData.fallbackDomain}
    />
  );
}
