import { Suspense } from "react";
import { connection } from "next/server";
import { atualizarFeedLinkedIn, feedLinkedInVencido, lerFeedLinkedIn } from "@/lib/linkedin";
import { listarPosts } from "@/lib/social";
import { NovaPauta } from "@/components/social/NovaPauta";
import { PerfilLinkedIn } from "@/components/social/PerfilLinkedIn";
import { SocialAbas } from "@/components/social/SocialAbas";

export default function LinkedInPage() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">LinkedIn</h1>
          <p className="text-sm text-muted">A página da Stage no LinkedIn e os Posts planejados no hub para ela.</p>
        </div>
        <div className="flex gap-2">
          <SocialAbas atual="linkedin" />
          <NovaPauta />
        </div>
      </div>
      <Suspense fallback={<div className="text-sm text-muted">Carregando a página do LinkedIn…</div>}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await connection();
  const [{ posts }, salvo] = await Promise.all([listarPosts(), lerFeedLinkedIn()]);
  let feed = salvo;
  // Primeira visita: lê agora (leva poucos segundos). Cópia com mais de um dia: atualiza em segundo plano.
  if (!feed) feed = await atualizarFeedLinkedIn().catch(() => null);
  else if (feedLinkedInVencido(feed)) void atualizarFeedLinkedIn().catch(() => undefined);

  const planejados = posts.filter((p) => p.canal === "linkedin" && p.status !== "publicado");
  return <PerfilLinkedIn feed={feed} planejados={planejados} />;
}
