import { LPStatus, Prisma } from "@prisma/client";
import { exigirEditor } from "@/lib/auth";
import { htmlAutocontido, lerLP } from "@/lib/lp";
import { prisma } from "@/lib/prisma";
import { invalidateDomainMapping } from "@/lib/redis";
import { analyzeLandingPageSeo } from "@/lib/seo-analyzer";
import { uploadTenantAsset } from "@/lib/storage";

type Ctx = RouteContext<"/api/lp/[slug]/publicar">;

export async function POST(request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { slug } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    customDomainId?: string | null;
    trackingConfig?: {
      gtmId?: string | null;
      hotjarId?: string | null;
      metaPixelId?: string | null;
    };
    seoMetadata?: Record<string, unknown>;
  };

  const lpRow = await prisma.landingPage.findUnique({
    where: {
      tenantId_slug: {
        tenantId: sessao.tenantId,
        slug,
      },
    },
    include: {
      tenant: true,
      customDomain: true,
    },
  });

  if (!lpRow) {
    return Response.json({ error: "LP não encontrada" }, { status: 404 });
  }

  if (!lpRow.draftHtml || !lpRow.draftHtml.trim()) {
    return Response.json(
      { error: "A Landing Page ainda não possui HTML gerado para publicação." },
      { status: 400 }
    );
  }

  let selectedDomain = lpRow.customDomain;
  if (body.customDomainId !== undefined) {
    if (body.customDomainId === null || body.customDomainId === "") {
      selectedDomain = null;
    } else {
      const found = await prisma.customDomain.findFirst({
        where: {
          id: body.customDomainId,
          tenantId: sessao.tenantId,
        },
      });
      if (!found) {
        return Response.json(
          { error: "Domínio customizado inválido ou não pertence a esta empresa." },
          { status: 400 }
        );
      }
      selectedDomain = found;
    }
  }

  const seoReport = analyzeLandingPageSeo(lpRow.draftHtml);
  const seoMetadata = {
    title: seoReport.extracted.title || lpRow.title,
    description: seoReport.extracted.metaDescription || "",
    score: seoReport.score,
    grade: seoReport.grade,
    ...(body.seoMetadata ?? {}),
  };

  const currentTracking =
    lpRow.trackingConfig && typeof lpRow.trackingConfig === "object" && !Array.isArray(lpRow.trackingConfig)
      ? (lpRow.trackingConfig as Record<string, unknown>)
      : {};

  const trackingConfig = body.trackingConfig
    ? {
        gtmId: body.trackingConfig.gtmId?.trim() || null,
        hotjarId: body.trackingConfig.hotjarId?.trim() || null,
        metaPixelId: body.trackingConfig.metaPixelId?.trim() || null,
      }
    : currentTracking;

  const finalHtml = await htmlAutocontido(slug, sessao.tenantId);

  const uploaded = await uploadTenantAsset({
    tenantId: sessao.tenantId,
    category: "lp_asset",
    fileName: `${slug}.html`,
    mimeType: "text/html; charset=utf-8",
    buffer: Buffer.from(finalHtml, "utf8"),
  });

  const publicUrl = selectedDomain
    ? `https://${selectedDomain.domain}/${slug}`
    : `https://${lpRow.tenant.slug}.lp.stage.consult/${slug}`;

  const bd =
    lpRow.briefingData && typeof lpRow.briefingData === "object" && !Array.isArray(lpRow.briefingData)
      ? { ...(lpRow.briefingData as Record<string, unknown>) }
      : {};
  bd.legacyStatus = "publicada";
  bd.urlPublicada = publicUrl;

  await prisma.landingPage.update({
    where: { id: lpRow.id },
    data: {
      status: LPStatus.PUBLISHED,
      publishedAt: new Date(),
      customDomainId: selectedDomain ? selectedDomain.id : null,
      trackingConfig: trackingConfig as Prisma.InputJsonValue,
      seoMetadata: seoMetadata as Prisma.InputJsonValue,
      publishedBlobUrl: uploaded.blobUrl,
      briefingData: bd as Prisma.InputJsonValue,
    },
  });

  if (selectedDomain) {
    await invalidateDomainMapping(selectedDomain.domain);
  }
  if (lpRow.customDomain && lpRow.customDomain.domain !== selectedDomain?.domain) {
    await invalidateDomainMapping(lpRow.customDomain.domain);
  }
  await invalidateDomainMapping(`${lpRow.tenant.slug}.lp.stage.consult`);

  const updatedLp = await lerLP(slug, sessao.tenantId);
  return Response.json({
    ok: true,
    publicUrl,
    publishedBlobUrl: uploaded.blobUrl,
    seoReport,
    lp: updatedLp,
  });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { slug } = await ctx.params;
  const lpRow = await prisma.landingPage.findUnique({
    where: {
      tenantId_slug: {
        tenantId: sessao.tenantId,
        slug,
      },
    },
    include: {
      tenant: true,
      customDomain: true,
    },
  });

  if (!lpRow) {
    return Response.json({ error: "LP não encontrada" }, { status: 404 });
  }

  const bd =
    lpRow.briefingData && typeof lpRow.briefingData === "object" && !Array.isArray(lpRow.briefingData)
      ? { ...(lpRow.briefingData as Record<string, unknown>) }
      : {};
  bd.legacyStatus = "rascunho";

  await prisma.landingPage.update({
    where: { id: lpRow.id },
    data: {
      status: LPStatus.DRAFT,
      briefingData: bd as Prisma.InputJsonValue,
    },
  });

  if (lpRow.customDomain) {
    await invalidateDomainMapping(lpRow.customDomain.domain);
  }
  await invalidateDomainMapping(`${lpRow.tenant.slug}.lp.stage.consult`);

  const updatedLp = await lerLP(slug, sessao.tenantId);
  return Response.json({
    ok: true,
    lp: updatedLp,
  });
}
