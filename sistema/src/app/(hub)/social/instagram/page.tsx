import { Suspense } from "react";
import { connection } from "next/server";
import { atualizarFeedInstagram, feedVencido, lerFeedInstagram, PERFIL_INSTAGRAM } from "@/lib/instagram";
import { prisma } from "@/lib/prisma";
import { codigoInstagram, listarPosts } from "@/lib/social";
import { resolverTenantId } from "@/lib/tenant-context";
import { NovaPauta } from "@/components/social/NovaPauta";
import { OAuthConnectButton } from "@/components/social/OAuthConnectButton";
import { PerfilInstagram } from "@/components/social/PerfilInstagram";
import { SocialAbas } from "@/components/social/SocialAbas";

export default function InstagramPage() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Instagram</h1>
          <p className="text-sm text-muted">
            O feed atual de @{PERFIL_INSTAGRAM}. Conecte via OAuth para autopublicação ou pré-visualize os Posts planejados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SocialAbas atual="instagram" />
          <Suspense fallback={null}>
            <InstagramOAuthStatus />
          </Suspense>
          <NovaPauta />
        </div>
      </div>
      <Suspense fallback={<div className="text-sm text-muted">Carregando o feed…</div>}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function InstagramOAuthStatus() {
  await connection();
  const tenantId = await resolverTenantId();
  const account = await prisma.socialAccount.findUnique({
    where: { tenantId_platform: { tenantId, platform: "instagram" } },
  });
  return (
    <OAuthConnectButton
      platform="instagram"
      connected={Boolean(account?.accessTokenEnc)}
      handle={account?.handleOrPageId}
    />
  );
}

async function Conteudo() {
  await connection();
  const tenantId = await resolverTenantId();
  const [{ posts }, feed] = await Promise.all([listarPosts(tenantId), lerFeedInstagram(tenantId)]);
  if (feed && feedVencido(feed)) void atualizarFeedInstagram().catch(() => undefined);

  const noFeed = new Set(feed?.posts.map((p) => p.codigo));
  const planejados = posts.filter((p) => {
    if (p.canal !== "instagram" || p.formato === "story" || p.status === "publicado") return false;
    const codigo = p.link ? codigoInstagram(p.link) : null;
    return !codigo || !noFeed.has(codigo);
  });

  return <PerfilInstagram feed={feed} planejados={planejados} />;
}
