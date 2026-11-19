import { LPStatus } from "@prisma/client";
import { exigirEditor, usuarioAtual } from "@/lib/auth";
import { extractRequestHost, isAppPanelHost } from "@/lib/config";
import prisma from "@/lib/prisma";
import { getDomainMapping, normalizeHostname } from "@/lib/redis";
import {
  StorageConfigError,
  StorageOperationError,
  deleteTenantAssetBlob,
  downloadTenantAssetBuffer,
  isHtmlLpSnapshotAsset,
  verifySignedMediaToken,
} from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

async function authorizeMediaRead(
  request: Request,
  asset: {
    id: string;
    tenantId: string;
    category: string;
    mimeType: string;
    fileName: string;
  }
): Promise<{ authorized: true; cacheControl: string } | { authorized: false; status: number; error: string }> {
  const url = new URL(request.url);
  const sig = url.searchParams.get("sig");
  const exp = url.searchParams.get("exp");

  // 1. URL assinada válida (ex.: integrações sociais do worker Instagram/LinkedIn)
  //    Nunca libera snapshot HTML de LP (`lp_asset` text/html) por esta rota.
  if (sig && exp) {
    if (!isHtmlLpSnapshotAsset(asset) && verifySignedMediaToken(asset.id, asset.tenantId, sig, exp)) {
      const tenant = await prisma.tenant.findUnique({ where: { id: asset.tenantId }, select: { isActive: true } });
      if (!tenant?.isActive) return { authorized: false, status: 403, error: "Empresa desativada ou indisponível." };
      return { authorized: true, cacheControl: "private, no-cache, must-revalidate" };
    }
    return {
      authorized: false,
      status: 403,
      error: "Assinatura de mídia inválida ou expirada.",
    };
  }

  // 2. Sessão autenticada autorizada do mesmo tenant (ou Super Admin)
  const sessao = await usuarioAtual();
  if (sessao && (sessao.isSuperAdmin || sessao.tenantId === asset.tenantId)) {
    return { authorized: true, cacheControl: "private, no-cache, must-revalidate" };
  }

  // 3. Acesso anônimo: estritamente proibido para snapshots HTML (`lp_asset`) e para o host do painel
  if (isHtmlLpSnapshotAsset(asset)) {
    return {
      authorized: false,
      status: 403,
      error: "Acesso direto a snapshots HTML publicados não é permitido por esta rota.",
    };
  }

  const { rawHost, cleanHost, isValid } = extractRequestHost(request);
  const trustedHost = isValid ? normalizeHostname(cleanHost) : "";
  if (!trustedHost || isAppPanelHost(rawHost, trustedHost)) {
    return {
      authorized: false,
      status: sessao ? 403 : 401,
      error: "Acesso não autorizado a este arquivo de mídia.",
    };
  }

  const domainMap = await getDomainMapping(trustedHost);
  if (!domainMap || !domainMap.customDomainId || domainMap.tenantId !== asset.tenantId) {
    return {
      authorized: false,
      status: 403,
      error: "Domínio não autorizado para acessar esta mídia.",
    };
  }

  // Categoria `lp_asset` ou `logo` isoladamente não torna o objeto público:
  // exige vínculo explícito a uma LP PUBLISHED no mesmo tenant e domínio.
  const linkedPublishedLp = await prisma.landingPage.findFirst({
    where: {
      tenantId: domainMap.tenantId,
      customDomainId: domainMap.customDomainId,
      status: LPStatus.PUBLISHED,
      publishedBlobUrl: { not: null },
      publishedAssetIds: { has: asset.id },
    },
    select: { id: true },
  });

  if (!linkedPublishedLp) {
    return {
      authorized: false,
      status: 403,
      error: "Mídia não vinculada a nenhuma Landing Page publicada neste domínio.",
    };
  }

  return { authorized: true, cacheControl: "private, no-cache, must-revalidate" };
}

async function handleMediaRead(request: Request, ctx: Ctx, isHead: boolean): Promise<Response> {
  const { id } = await ctx.params;

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
  });
  if (!asset) {
    return Response.json({ error: "Mídia não encontrada" }, { status: 404 });
  }

  const authz = await authorizeMediaRead(request, asset);
  if (!authz.authorized) {
    return Response.json(
      { error: authz.error },
      {
        status: authz.status,
        headers: {
          "Cache-Control": "no-store",
          Vary: "Host, Cookie",
        },
      }
    );
  }

  let downloaded: Awaited<ReturnType<typeof downloadTenantAssetBuffer>>;
  try {
    downloaded = await downloadTenantAssetBuffer(asset.blobUrl, {
      expectedTenantId: asset.tenantId,
    });
  } catch (err) {
    const status =
      err instanceof StorageConfigError || err instanceof StorageOperationError
        ? err.statusCode
        : 503;
    const code =
      err instanceof StorageConfigError || err instanceof StorageOperationError
        ? err.code
        : "STORAGE_READ_FAILED";
    return Response.json(
      { error: (err as Error).message, code },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          Vary: "Host, Cookie",
        },
      }
    );
  }

  if (!downloaded) {
    return Response.json({ error: "Arquivo binário não encontrado no storage" }, { status: 404 });
  }

  const headers = {
    "Content-Type": downloaded.mimeType || asset.mimeType || "application/octet-stream",
    "Content-Length": String(downloaded.buffer.byteLength),
    "Cache-Control": authz.cacheControl,
    Vary: "Host, Cookie",
  };

  if (isHead) {
    return new Response(null, { status: 200, headers });
  }

  return new Response(new Uint8Array(downloaded.buffer), { status: 200, headers });
}

// GET /api/media/[id] serve o conteúdo binário autorizado de um MediaAsset
// mediado exclusivamente pelo backend a partir do container privado do Azure Blob Storage.
export async function GET(request: Request, ctx: Ctx) {
  return handleMediaRead(request, ctx, false);
}

// HEAD /api/media/[id] valida autorização e metadados do MediaAsset sem retornar o corpo.
export async function HEAD(request: Request, ctx: Ctx) {
  return handleMediaRead(request, ctx, true);
}

// DELETE /api/media/[id] exclui o objeto no Azure Blob Storage e o registro de mídia do tenant autenticado
export async function DELETE(_request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { id } = await ctx.params;
  const asset = await prisma.mediaAsset.findFirst({
    where: { id, tenantId: sessao.tenantId },
  });
  if (!asset) {
    return Response.json({ error: "Mídia não encontrada" }, { status: 404 });
  }

  await deleteTenantAssetBlob(asset.blobUrl, {
    expectedTenantId: sessao.tenantId,
  }).catch(() => undefined);

  await prisma.mediaAsset.delete({ where: { id: asset.id } });
  return Response.json({ ok: true });
}
