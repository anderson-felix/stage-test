import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { lerCampanha } from "@/lib/ads";
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
  const { slug } = await params;
  const { iniciar } = await searchParams;
  const campanha = await lerCampanha(slug);
  if (!campanha) notFound();
  const acao = iniciar === "montar" || iniciar === "sementes" ? iniciar : null;
  return <CampanhaDetalhe key={campanha.path} inicial={campanha} iniciar={acao} />;
}
