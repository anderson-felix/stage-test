import { Suspense } from "react";
import { connection } from "next/server";
import { atualizarFeedInstagram, feedVencido, lerFeedInstagram, PERFIL_INSTAGRAM } from "@/lib/instagram";
import { codigoInstagram, listarPosts } from "@/lib/social";
import { NovaPauta } from "@/components/social/NovaPauta";
import { PerfilInstagram } from "@/components/social/PerfilInstagram";
import { SocialAbas } from "@/components/social/SocialAbas";

export default function InstagramPage() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Instagram</h1>
          <p className="text-sm text-muted">O feed atual de @{PERFIL_INSTAGRAM}. Dá para pré-visualizar por cima os Posts planejados no hub.</p>
        </div>
        <div className="flex gap-2">
          <SocialAbas atual="instagram" />
          <NovaPauta />
        </div>
      </div>
      <Suspense fallback={<div className="text-sm text-muted">Carregando o feed…</div>}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await connection();
  const [{ posts }, feed] = await Promise.all([listarPosts(), lerFeedInstagram()]);
  // Cópia com mais de um dia: atualiza em segundo plano; a página mostra a atual e a próxima visita já vem nova.
  if (feed && feedVencido(feed)) void atualizarFeedInstagram().catch(() => undefined);

  const noFeed = new Set(feed?.posts.map((p) => p.codigo));
  // Planejados = Posts de Instagram do hub que ainda não estão no perfil.
  const planejados = posts.filter((p) => {
    if (p.canal !== "instagram" || p.formato === "story" || p.status === "publicado") return false;
    const codigo = p.link ? codigoInstagram(p.link) : null;
    return !codigo || !noFeed.has(codigo);
  });

  return <PerfilInstagram feed={feed} planejados={planejados} />;
}
