import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { lerPost } from "@/lib/social";
import { getTenantContext } from "@/lib/tenant-context";
import { PostDetalhe } from "@/components/social/PostDetalhe";

export default function PostPage({ params }: PageProps<"/social/[pauta]/[post]">) {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-sm text-muted">Carregando Post…</div>}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/social/[pauta]/[post]">["params"] }) {
  await connection();
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");

  const { pauta, post } = await params;
  const completo = await lerPost(pauta, post, ctx.tenantId);
  if (!completo) notFound();
  return <PostDetalhe key={completo.path} inicial={completo} />;
}
