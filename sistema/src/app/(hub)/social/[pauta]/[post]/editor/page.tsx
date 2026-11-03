import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { lerPost } from "@/lib/social";
import { ArteEditor } from "@/components/social/ArteEditor";

export default function EditorPage({ params }: PageProps<"/social/[pauta]/[post]/editor">) {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-sm text-muted">Abrindo o Editor de Arte…</div>}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/social/[pauta]/[post]/editor">["params"] }) {
  await connection();
  const { pauta, post } = await params;
  const completo = await lerPost(pauta, post);
  if (!completo || !completo.arte.html) notFound();
  return <ArteEditor key={`${completo.path}:${completo.arte.versao}`} post={completo} />;
}
