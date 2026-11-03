import { Suspense } from "react";
import { connection } from "next/server";
import { AlertTriangle } from "lucide-react";
import { SocialAbas } from "@/components/social/SocialAbas";
import { listarPosts } from "@/lib/social";
import { NovaPauta } from "@/components/social/NovaPauta";
import { Quadro } from "@/components/social/Quadro";

export default function SocialPage() {
  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Social</h1>
          <p className="text-sm text-muted">Clique num Post para abrir. Arraste entre colunas para mudar o Status.</p>
        </div>
        <div className="flex gap-2">
          <SocialAbas atual="quadro" />
          <NovaPauta />
        </div>
      </div>

      <Suspense fallback={<div className="text-sm text-muted">Carregando Posts…</div>}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await connection();
  const { posts, invalidos } = await listarPosts();

  return (
    <>
      {invalidos.length > 0 && (
        <div className="rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-warn">
            <AlertTriangle size={15} /> {invalidos.length} Post(s) com frontmatter fora do padrão
          </div>
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted">
            {invalidos.map((i) => (
              <li key={i.path}>
                {i.path}: {i.problema}
              </li>
            ))}
          </ul>
        </div>
      )}

      {posts.length === 0 && invalidos.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          Nenhum Post ainda. Clique em Nova Pauta para começar.
        </div>
      )}

      {/* key remonta o Quadro quando os dados do servidor mudam (após refresh) */}
      <Quadro key={posts.map((p) => `${p.path}:${p.status}`).join("|")} posts={posts} />
    </>
  );
}
