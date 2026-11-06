import prisma from "./prisma";
import { downloadTenantAssetBuffer } from "./storage";

/** Logo pública de fallback (servida de `public/`). */
export const FALLBACK_LOGO_URL = "/logo-stage.png";

const MEDIA_URL = /^\/api\/media\/([a-zA-Z0-9_-]+)/;

/**
 * Referências de logo que o HTML gerado pela IA ou legado pode conter:
 * `logo.png`, `./logo.png`, `/logo-stage.png`, `/api/ws/marca/assets/logo/Logotipo_Stage.png`, `marca/assets/logo/...`.
 * URLs `/api/media/<id>` NÃO são tocadas por este regex.
 */
export const LOGO_REF =
  /(["'(])((?:\.\/)?logo\.png|\/?logo-stage\.png|(?:\.\.\/)*(?:\/api\/ws\/)?marca\/assets\/logo\/[^"')\s]+|(?:\.\/)?Logotipo_Stage\.png)(["')])/gi;

/**
 * URL navegável da logo do tenant para uso no painel autenticado (iframe do editor/preview).
 * Prioriza `BrandProfile.logoBlobUrl`, depois um `MediaAsset` da categoria `logo`, e por fim o fallback público.
 */
export async function resolverLogoUrlTenant(tenantId: string): Promise<string> {
  const bp = await prisma.brandProfile.findUnique({
    where: { tenantId },
    select: { logoBlobUrl: true },
  });
  const raw = bp?.logoBlobUrl?.trim();
  if (raw) {
    const m = MEDIA_URL.exec(raw);
    if (m) {
      const owned = await prisma.mediaAsset.findFirst({
        where: { id: m[1], tenantId },
        select: { id: true },
      });
      if (owned) return `/api/media/${owned.id}`;
    } else if (/^https?:\/\//i.test(raw)) {
      return raw;
    } else {
      // Blob armazenado no fallback local de dev: expõe via MediaAsset correspondente, se existir
      const asset = await prisma.mediaAsset.findFirst({
        where: { tenantId, blobUrl: raw },
        select: { id: true },
      });
      if (asset) return `/api/media/${asset.id}`;
    }
  }

  const logoAsset = await prisma.mediaAsset.findFirst({
    where: { tenantId, category: "logo" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return logoAsset ? `/api/media/${logoAsset.id}` : FALLBACK_LOGO_URL;
}

/**
 * Bytes da logo do tenant como data URI (para renderização headless no Playwright, onde URLs relativas
 * do hub não são resolvíveis). Retorna `null` se o tenant não possui logo.
 */
export async function resolverLogoDataUriTenant(tenantId: string): Promise<string | null> {
  const bp = await prisma.brandProfile.findUnique({
    where: { tenantId },
    select: { logoBlobUrl: true },
  });

  let blobUrl: string | null = null;
  let mime = "image/png";
  const raw = bp?.logoBlobUrl?.trim();
  if (raw) {
    const m = MEDIA_URL.exec(raw);
    if (m) {
      const asset = await prisma.mediaAsset.findFirst({ where: { id: m[1], tenantId } });
      if (asset) {
        blobUrl = asset.blobUrl;
        mime = asset.mimeType || mime;
      }
    } else {
      blobUrl = raw;
    }
  }
  if (!blobUrl) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { tenantId, category: "logo" },
      orderBy: { createdAt: "desc" },
    });
    if (asset) {
      blobUrl = asset.blobUrl;
      mime = asset.mimeType || mime;
    }
  }
  if (!blobUrl) return null;

  const dl = await downloadTenantAssetBuffer(blobUrl).catch(() => null);
  if (!dl) return null;
  return `data:${dl.mimeType || mime};base64,${dl.buffer.toString("base64")}`;
}

/** Substitui as referências relativas/legadas de logo no HTML pela URL informada. */
export function substituirReferenciasLogo(html: string, logoUrl: string): string {
  return html.replace(LOGO_REF, (_m, abre: string, _ref: string, fecha: string) => `${abre}${logoUrl}${fecha}`);
}

/**
 * Converte todas as referências a `/api/media/[id]` no HTML em Data URIs inline (`data:${mimeType};base64,...`)
 * para que o Playwright renderize os slides perfeitamente em about:blank sem depender de requests de rede.
 */
export async function inlineMediaAssetsAsDataUris(html: string): Promise<string> {
  const matches = [...html.matchAll(/\/api\/media\/([a-zA-Z0-9_-]+)/g)];
  if (matches.length === 0) return html;

  const ids = Array.from(new Set(matches.map((m) => m[1])));
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: ids } },
  });

  let result = html;
  for (const asset of assets) {
    try {
      const dl = await downloadTenantAssetBuffer(asset.blobUrl);
      if (dl) {
        const mime = dl.mimeType || asset.mimeType || "image/png";
        const dataUri = `data:${mime};base64,${dl.buffer.toString("base64")}`;
        result = result.replaceAll(`/api/media/${asset.id}`, dataUri);
      }
    } catch {
      // se falhar o download individual, mantém o link relativo
    }
  }
  return result;
}

export type ResolveLpHtmlOptions = {
  embedAsDataUri?: boolean;
};

/**
 * Resolve e substitui referências à logo e imagens da marca no HTML de uma Landing Page.
 * - Busca o BrandProfile (logoBlobUrl, websiteUrl) e dados do tenant (companyName);
 * - Substitui `src="logo.png"`, `src="./logo.png"`, `src="/logo-stage.png"`, `src="/api/ws/.../Logotipo_Stage.png"`
 *   pela `logoUrl` real do tenant (ou Data URI base64 quando `embedAsDataUri: true`);
 * - Quando `embedAsDataUri: true`, converte também todos os `/api/media/[id]` em Data URIs inline para arquivo autônomo offline.
 */
export async function resolveLpHtmlAssets(
  html: string,
  tenantId: string,
  options?: ResolveLpHtmlOptions
): Promise<string> {
  if (!html) return html;

  const brandProfile = await prisma.brandProfile.findUnique({
    where: { tenantId },
    include: {
      tenant: {
        select: { name: true, slug: true },
      },
    },
  });

  let logoUrl: string;
  if (options?.embedAsDataUri) {
    const dataUri = await resolverLogoDataUriTenant(tenantId);
    if (dataUri) {
      logoUrl = dataUri;
    } else {
      try {
        const fs = await import("fs/promises");
        const path = await import("path");
        const publicLogoPath = path.join(process.cwd(), "public", "logo-stage.png");
        const buf = await fs.readFile(publicLogoPath);
        logoUrl = `data:image/png;base64,${buf.toString("base64")}`;
      } catch {
        logoUrl = FALLBACK_LOGO_URL;
      }
    }
  } else {
    logoUrl = await resolverLogoUrlTenant(tenantId);
  }

  let processed = substituirReferenciasLogo(html, logoUrl);

  const companyName = brandProfile?.tenant?.name?.trim() || "";
  if (companyName) {
    processed = processed.replace(/\{\{\s*company(?:Name|_name)\s*\}\}/gi, companyName);
  }

  // Se embedAsDataUri estiver ativo, inlines também quaisquer `/api/media/[id]`
  if (options?.embedAsDataUri) {
    processed = await inlineMediaAssetsAsDataUris(processed);
  }

  return processed;
}

/**
 * Injeta a logo e ativos do tenant no HTML antes da renderização no Playwright.
 */
export async function resolveHtmlBrandAssets(html: string, tenantId: string): Promise<string> {
  const logoDataUri = await resolverLogoDataUriTenant(tenantId).catch(() => null);
  let result = html;
  if (logoDataUri) {
    result = substituirReferenciasLogo(result, logoDataUri);
  }
  result = await inlineMediaAssetsAsDataUris(result).catch(() => result);
  return result;
}



