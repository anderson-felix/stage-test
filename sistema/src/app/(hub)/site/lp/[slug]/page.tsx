import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { listarCampanhas } from "@/lib/ads";
import { lerLP } from "@/lib/lp";
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
  const { slug } = await params;
  const { gerar } = await searchParams;
  const lp = await lerLP(slug);
  if (!lp) notFound();
  const campanhas = (await listarCampanhas()).map((c) => ({ slug: c.slug, titulo: c.titulo }));
  return <LPDetalhe key={lp.path} inicial={lp} campanhas={campanhas} gerarAoAbrir={gerar === "1"} />;
}
