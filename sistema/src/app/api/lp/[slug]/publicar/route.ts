import { withLpTransactionRetry } from "@/lib/lp-transaction";
import { DnsStatus, LPStatus, Prisma, SslStatus } from "@prisma/client";
import { exigirEditor } from "@/lib/auth";
import {
  getAppRuntimeConfig,
  resolveTenantFallbackDomain,
} from "@/lib/config";
import { htmlAutocontido, lerLP } from "@/lib/lp";
import { prisma } from "@/lib/prisma";
import { invalidateDomainMapping } from "@/lib/redis";
import { analyzeLandingPageSeo } from "@/lib/seo-analyzer";
import {
  StorageConfigError,
  StorageOperationError,
  deleteTenantAssetBlob,
  uploadTenantAsset,
} from "@/lib/storage";

type Ctx = RouteContext<"/api/lp/[slug]/publicar">;

import { validateDomainStateForPublish, type PublishErrorCategory } from "@/lib/lp-publication";

/**
 * Remove com segurança apenas o artefato órfão recém-enviado quando a publicação
 * não pôde ser concluída, preservando integralmente qualquer publicação anterior.
 */
async function cleanupOrphanUploadedAsset(params: {
  uploadedAssetId?: string | null;
  uploadedBlobUrl?: string | null;
  previousPublishedBlobUrl?: string | null;
  tenantId: string;
}): Promise<boolean> {
  const { uploadedAssetId, uploadedBlobUrl, previousPublishedBlobUrl, tenantId } = params;
  if (!uploadedBlobUrl) return false;

  // Nunca remove o blob se por qualquer motivo coincidir com o artefato da publicação anterior
  if (previousPublishedBlobUrl && uploadedBlobUrl === previousPublishedBlobUrl) {
    return false;
  }

  // On an unknown commit outcome, never delete an artifact adopted by a LP.
  try {
    const adopted = await prisma.landingPage.findFirst({ where: { tenantId, publishedBlobUrl: uploadedBlobUrl }, select: { id: true } });
    if (adopted) return false;
  } catch { return false; } // No authoritative proof of orphanhood: retain for reconciliation.
  let cleaned = false;
  try {
    await deleteTenantAssetBlob(uploadedBlobUrl, { expectedTenantId: tenantId });
    cleaned = true;
  } catch (err) {
    console.warn(
      `[lp:publicar] Artefato órfão mantido para auditoria (falha ao limpar blob ${uploadedBlobUrl}):`,
      (err as Error).message
    );
  }

  if (uploadedAssetId) {
    try {
      await prisma.mediaAsset?.delete?.({
        where: { id: uploadedAssetId },
      });
    } catch {
      // Ignora caso o mock ou registro não exista
    }
  }

  return cleaned;
}

export async function POST(request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  if (!sessao.tenantId) {
    return Response.json(
      { error: "Sessão inválida: empresa não identificada.", category: "auth", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { slug } = await ctx.params;
  const rawBody = await request.json().catch(() => ({}));
  const body = (
    rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody : {}
  ) as {
    customDomainId?: unknown;
    trackingConfig?: {
      gtmId?: string | null;
      hotjarId?: string | null;
      metaPixelId?: string | null;
    };
    seoMetadata?: Record<string, unknown>;
  };

  if (
    body.customDomainId !== undefined &&
    body.customDomainId !== null &&
    typeof body.customDomainId !== "string"
  ) {
    return Response.json(
      {
        error: "Identificador de domínio customizado inválido.",
        category: "validation",
        code: "INVALID_CUSTOM_DOMAIN_ID",
      },
      { status: 400 }
    );
  }

  // 1. Consulta inicial curta (FORA de transação) para validar LP e tenant ativo
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

  if (!lpRow || lpRow.tenantId !== sessao.tenantId) {
    return Response.json(
      { error: "LP não encontrada", category: "validation", code: "LP_NOT_FOUND" },
      { status: 404 }
    );
  }

  if (!lpRow.tenant || !lpRow.tenant.isActive) {
    return Response.json(
      {
        error: "A conta da empresa está inativa e não está autorizada a publicar Landing Pages.",
        category: "auth",
        code: "TENANT_INACTIVE",
      },
      { status: 403 }
    );
  }

  if (!lpRow.draftHtml || !lpRow.draftHtml.trim()) {
    return Response.json(
      {
        error: "A Landing Page ainda não possui HTML gerado para publicação.",
        category: "validation",
        code: "EMPTY_DRAFT_HTML",
      },
      { status: 400 }
    );
  }

  // 2. Resolução e validação do domínio do mesmo tenant (exige DNS VERIFIED e SSL ACTIVE)
  let selectedDomain = lpRow.customDomain;
  if (body.customDomainId !== undefined) {
    if (body.customDomainId === null || body.customDomainId === "") {
      selectedDomain = null;
    } else {
      const requestedDomainId = body.customDomainId.trim();
      const found = await prisma.customDomain.findFirst({
        where: {
          id: requestedDomainId,
          tenantId: sessao.tenantId,
        },
      });
      if (!found || found.tenantId !== sessao.tenantId) {
        return Response.json(
          {
            error: "Domínio customizado inválido ou não pertence a esta empresa.",
            category: "auth",
            code: "DOMAIN_NOT_AUTHORIZED",
          },
          { status: 403 }
        );
      }
      selectedDomain = found;
    }
  }

  const cfg = getAppRuntimeConfig();

  if (!selectedDomain) {
    return Response.json(
      {
        error:
          "Publicação bloqueada: é obrigatório selecionar um domínio próprio verificado e com certificado HTTPS ativo para publicar a Landing Page.",
        category: "dns",
        code: "CUSTOM_DOMAIN_REQUIRED",
        lpFallbackEnabled: cfg.lpFallbackEnabled,
      },
      { status: 400 }
    );
  }

  const preCheck = validateDomainStateForPublish(selectedDomain, sessao.tenantId);
  if (!preCheck.ok) {
    return Response.json(
      {
        error: preCheck.error,
        category: preCheck.category,
        code: preCheck.code,
        dnsStatus: selectedDomain.dnsStatus,
        sslStatus: selectedDomain.sslStatus,
        lpFallbackEnabled: cfg.lpFallbackEnabled,
      },
      { status: preCheck.status }
    );
  }

  const seoReport = analyzeLandingPageSeo(lpRow.draftHtml);
  const seoMetadata = {
    title: seoReport.extracted.title || lpRow.title,
    description: seoReport.extracted.metaDescription || "",
    score: seoReport.score,
    grade: seoReport.grade,
    ...(lpRow.seoMetadata && typeof lpRow.seoMetadata === "object" && !Array.isArray(lpRow.seoMetadata) ? lpRow.seoMetadata : {}),
    ...(body.seoMetadata ?? {}),
  };

  const currentTracking =
    lpRow.trackingConfig &&
    typeof lpRow.trackingConfig === "object" &&
    !Array.isArray(lpRow.trackingConfig)
      ? (lpRow.trackingConfig as Record<string, unknown>)
      : {};

  const trackingConfig = body.trackingConfig
    ? {
        gtmId: body.trackingConfig.gtmId?.trim() || null,
        hotjarId: body.trackingConfig.hotjarId?.trim() || null,
        metaPixelId: body.trackingConfig.metaPixelId?.trim() || null,
      }
    : currentTracking;

  let finalHtml: string;
  try {
    finalHtml = await htmlAutocontido(slug, sessao.tenantId, { draftHtml: lpRow.draftHtml });
  } catch (error) {
    const code = (error as { code?: string }).code;
    const forbidden = code === "MEDIA_REFERENCE_FORBIDDEN" || code === "TENANT_PREFIX_MISMATCH";
    return Response.json({ error: forbidden ? "Referência de mídia não autorizada. Publicação anterior preservada." : "Falha na conversão do snapshot. Publicação anterior preservada.",
      category: forbidden ? "auth" : "storage", code: code ?? "SNAPSHOT_CONVERSION_FAILED" }, { status: forbidden ? 403 : 503 });
  }

  const candidateAssetIds = Array.from(
    new Set(
      [
        ...finalHtml.matchAll(/\/api\/media\/([a-zA-Z0-9_-]+)/g),
        ...String((seoMetadata as Record<string, unknown>).ogImage ?? "").matchAll(
          /\/api\/media\/([a-zA-Z0-9_-]+)/g
        ),
      ].map((m) => m[1])
    )
  );
  const ownedNonHtmlAssets =
    candidateAssetIds.length > 0 && prisma.mediaAsset?.findMany
      ? await prisma.mediaAsset.findMany({
          where: {
            id: { in: candidateAssetIds },
            tenantId: sessao.tenantId,
            NOT: {
              AND: [{ category: "lp_asset" }, { mimeType: { startsWith: "text/html" } }],
            },
          },
          select: { id: true },
        })
      : [];
  const publishedAssetIds = ownedNonHtmlAssets.map((a) => a.id);

  // 3. Upload externo no Azure Blob Storage (executado FORA de qualquer transação de banco)
  let uploaded: Awaited<ReturnType<typeof uploadTenantAsset>>;
  try {
    uploaded = await uploadTenantAsset({
      tenantId: sessao.tenantId,
      category: "lp_asset",
      fileName: `${slug}.html`,
      mimeType: "text/html; charset=utf-8",
      buffer: Buffer.from(finalHtml, "utf8"),
    });
  } catch (err) {
    const status =
      err instanceof StorageConfigError || err instanceof StorageOperationError
        ? err.statusCode
        : 503;
    const code =
      err instanceof StorageConfigError || err instanceof StorageOperationError
        ? err.code
        : "STORAGE_UPLOAD_FAILED";
    return Response.json(
      {
        error:
          (err as Error)?.message ||
          "Falha ao armazenar o HTML publicado no Azure Blob Storage. A publicação anterior foi preservada.",
        category: "storage",
        code,
      },
      { status }
    );
  }

  if (
    !uploaded ||
    typeof uploaded.blobUrl !== "string" ||
    !/^https?:\/\//i.test(uploaded.blobUrl)
  ) {
    await cleanupOrphanUploadedAsset({
      uploadedAssetId: uploaded?.id,
      uploadedBlobUrl: typeof uploaded?.blobUrl === "string" ? uploaded.blobUrl : null,
      previousPublishedBlobUrl: lpRow.publishedBlobUrl,
      tenantId: sessao.tenantId,
    });
    return Response.json(
      {
        error:
          "O serviço de storage não retornou uma URL válida do Azure Blob Storage. A publicação foi abortada para evitar referência inválida.",
        category: "storage",
        code: "INVALID_UPLOAD_REFERENCE",
      },
      { status: 503 }
    );
  }

  // 4. Rechecagem atômica + persistência em transação curta (SEM I/O de rede dentro da transação)
  //    para eliminar intervalo entre rechecagem e update sob concorrência com remoção/invalidação
  //    de domínio ou desativação de tenant.
  const bdBase =
    lpRow.briefingData &&
    typeof lpRow.briefingData === "object" &&
    !Array.isArray(lpRow.briefingData)
      ? { ...(lpRow.briefingData as Record<string, unknown>) }
      : {};

  type PersistTxResult =
    | { ok: true; canonicalHost: string; publicUrl: string }
    | {
        ok: false;
        status: number;
        category: PublishErrorCategory;
        code: string;
        error: string;
        dnsStatus?: DnsStatus | string;
        sslStatus?: SslStatus | string;
      };

  let txResult: PersistTxResult;
  try {
    txResult = await withLpTransactionRetry(() => prisma.$transaction(
      async (tx): Promise<PersistTxResult> => {
        const [recheckedDomain, recheckedTenant, recheckedLp] = await Promise.all([
          tx.customDomain.findFirst({
            where: {
              id: selectedDomain.id,
              tenantId: sessao.tenantId,
            },
          }),
          tx.tenant.findUnique({
            where: { id: sessao.tenantId },
            select: { id: true, isActive: true },
          }),
          tx.landingPage.findFirst({
            where: {
              id: lpRow.id,
              tenantId: sessao.tenantId,
            },
            select: { id: true, editorialRevision: true },
          }),
        ]);

        if (!recheckedTenant || !recheckedTenant.isActive) {
          return {
            ok: false,
            status: 403,
            category: "auth",
            code: "TENANT_INACTIVE",
            error:
              "A conta da empresa foi desativada durante o processo de publicação. A operação foi cancelada.",
          };
        }

        if (!recheckedLp) {
          return {
            ok: false,
            status: 409,
            category: "validation",
            code: "LP_REMOVED_DURING_PUBLISH",
            error:
              "A Landing Page foi removida durante o processo de publicação. O estado anterior foi preservado.",
          };
        }

        if (recheckedLp.editorialRevision !== lpRow.editorialRevision) {
          return { ok: false, status: 409, category: "validation", code: "LP_EDIT_CONFLICT",
            error: "A Landing Page foi editada ou publicada durante o upload. Recarregue e tente novamente." };
        }

        if (!recheckedDomain) {
          return {
            ok: false,
            status: 409,
            category: "dns",
            code: "DOMAIN_REMOVED_DURING_PUBLISH",
            error:
              "O domínio selecionado foi removido durante o processo de upload. A publicação foi cancelada e o estado anterior foi preservado.",
          };
        }

        const postUploadCheck = validateDomainStateForPublish(
          recheckedDomain,
          sessao.tenantId
        );
        if (!postUploadCheck.ok) {
          return {
            ok: false,
            status: 409,
            category: postUploadCheck.category,
            code: postUploadCheck.code,
            error: postUploadCheck.error,
            dnsStatus: recheckedDomain.dnsStatus,
            sslStatus: recheckedDomain.sslStatus,
          };
        }

        // 5. Gera URL canônica HTTPS usando exclusivamente o domínio selecionado validado e o slug
        const canonicalHost = postUploadCheck.canonicalDomain;
        const publicUrl = `https://${canonicalHost}/${slug}`;

        const bd = {
          ...bdBase,
          legacyStatus: "publicada",
          urlPublicada: publicUrl,
        };

        await tx.landingPage.update({
          where: { id: recheckedLp.id, editorialRevision: lpRow.editorialRevision },
          data: {
            editorialRevision: { increment: 1 },
            status: LPStatus.PUBLISHED,
            publishedAt: new Date(),
            customDomainId: recheckedDomain.id,
            trackingConfig: trackingConfig as Prisma.InputJsonValue,
            seoMetadata: seoMetadata as Prisma.InputJsonValue,
            publishedBlobUrl: uploaded.blobUrl,
            publishedMetadata: { version: 1, title: lpRow.title, seoMetadata, trackingConfig } as Prisma.InputJsonValue,
            publishedAssetIds,
            briefingData: bd as Prisma.InputJsonValue,
          },
        });

        // Se a LP foi movida para outro domínio, limpa eventual associação de página inicial no domínio anterior
        await tx.customDomain.updateMany?.({
          where: {
            tenantId: sessao.tenantId,
            homeLandingPageId: recheckedLp.id,
            id: { not: recheckedDomain.id },
          },
          data: { homeLandingPageId: null },
        });

        return { ok: true, canonicalHost, publicUrl };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    ));
  } catch (dbErr) {
    // Falha ou conflito de concorrência após o upload: preserva a publicação anterior e limpa somente o novo artefato órfão
    await cleanupOrphanUploadedAsset({
      uploadedAssetId: uploaded.id,
      uploadedBlobUrl: uploaded.blobUrl,
      previousPublishedBlobUrl: lpRow.publishedBlobUrl,
      tenantId: sessao.tenantId,
    });
    const prismaCode = (dbErr as { code?: string })?.code;
    const isConcurrencyConflict = prismaCode === "P2034" || prismaCode === "P2003" || prismaCode === "P2025";
    return Response.json(
      {
        error: isConcurrencyConflict
          ? "Conflito de concorrência com alteração de domínio ou empresa durante a publicação. A publicação anterior foi preservada."
          : (dbErr as Error)?.message ||
            "Falha ao persistir o estado publicado da Landing Page. A publicação anterior foi preservada.",
        category: "validation",
        code: isConcurrencyConflict ? "PUBLISH_CONFLICT" : "PUBLISH_PERSIST_FAILED",
      },
      { status: isConcurrencyConflict ? 409 : 500 }
    );
  }

  if (!txResult.ok) {
    await cleanupOrphanUploadedAsset({
      uploadedAssetId: uploaded.id,
      uploadedBlobUrl: uploaded.blobUrl,
      previousPublishedBlobUrl: lpRow.publishedBlobUrl,
      tenantId: sessao.tenantId,
    });
    return Response.json(
      {
        error: txResult.error,
        category: txResult.category,
        code: txResult.code,
        ...(txResult.dnsStatus !== undefined ? { dnsStatus: txResult.dnsStatus } : {}),
        ...(txResult.sslStatus !== undefined ? { sslStatus: txResult.sslStatus } : {}),
      },
      { status: txResult.status }
    );
  }

  const { canonicalHost, publicUrl } = txResult;

  await invalidateDomainMapping(canonicalHost);
  if (lpRow.customDomain && lpRow.customDomain.domain !== canonicalHost) {
    await invalidateDomainMapping(lpRow.customDomain.domain);
  }

  const updatedLp = await lerLP(slug, sessao.tenantId).catch(() => null);
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
    lpRow.briefingData &&
    typeof lpRow.briefingData === "object" &&
    !Array.isArray(lpRow.briefingData)
      ? { ...(lpRow.briefingData as Record<string, unknown>) }
      : {};
  bd.legacyStatus = "rascunho";
  bd.urlPublicada = "";

  try {
  await withLpTransactionRetry(() => prisma.$transaction(async (tx) => {
    await tx.landingPage.update({
      where: { id: lpRow.id, editorialRevision: lpRow.editorialRevision },
      data: {
        editorialRevision: { increment: 1 },
        status: LPStatus.DRAFT,
        briefingData: bd as Prisma.InputJsonValue,
      },
    });
    await tx.customDomain.updateMany?.({
      where: {
        tenantId: sessao.tenantId,
        homeLandingPageId: lpRow.id,
      },
      data: { homeLandingPageId: null },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  } catch (err) {
    if (["P2025", "P2034"].includes((err as { code?: string }).code ?? "")) {
      return Response.json({ error: "LP alterada simultaneamente. Recarregue e tente novamente." }, { status: 409 });
    }
    throw err;
  }

  if (lpRow.customDomain) {
    await invalidateDomainMapping(lpRow.customDomain.domain);
  }
  const fallbackHost = resolveTenantFallbackDomain(lpRow.tenant.slug);
  if (fallbackHost) {
    await invalidateDomainMapping(fallbackHost);
  }

  const updatedLp = await lerLP(slug, sessao.tenantId);
  return Response.json({
    ok: true,
    lp: updatedLp,
  });
}
