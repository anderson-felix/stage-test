import { Suspense } from "react";
import { connection } from "next/server";
import { atualizarFeedLinkedIn, feedLinkedInVencido, lerFeedLinkedIn } from "@/lib/linkedin";
import { prisma } from "@/lib/prisma";
import { listarPosts } from "@/lib/social";
import { resolverTenantId } from "@/lib/tenant-context";
import { NovaPauta } from "@/components/social/NovaPauta";
import { OAuthConnectButton } from "@/components/social/OAuthConnectButton";
import { PerfilLinkedIn } from "@/components/social/PerfilLinkedIn";
import { SocialAbas } from "@/components/social/SocialAbas";

export default function LinkedInPage() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">LinkedIn</h1>
          <p className="text-sm text-muted">A página da marca no LinkedIn e os Posts planejados ou agendados no hub.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SocialAbas atual="linkedin" />
          <Suspense fallback={null}>
            <LinkedInOAuthStatus />
          </Suspense>
          <NovaPauta />
        </div>
      </div>
      <Suspense fallback={<div className="text-sm text-muted">Carregando a página do LinkedIn…</div>}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function LinkedInOAuthStatus() {
  await connection();
  const tenantId = await resolverTenantId();
  const account = await prisma.socialAccount.findUnique({
    where: { tenantId_platform: { tenantId, platform: "linkedin" } },
  });
  return (
    <OAuthConnectButton
      platform="linkedin"
      connected={Boolean(account?.accessTokenEnc)}
      handle={account?.handleOrPageId}
    />
  );
}

async function Conteudo() {
  await connection();
  const tenantId = await resolverTenantId();
  const [{ posts }, salvo] = await Promise.all([listarPosts(tenantId), lerFeedLinkedIn(tenantId)]);
  let feed = salvo;
  if (!feed) feed = await atualizarFeedLinkedIn().catch(() => null);
  else if (feedLinkedInVencido(feed)) void atualizarFeedLinkedIn().catch(() => undefined);

  const planejados = posts.filter((p) => p.canal === "linkedin" && p.status !== "publicado");
  return <PerfilLinkedIn feed={feed} planejados={planejados} />;
}
