import prisma from "./prisma";
import { downloadTenantAssetBuffer } from "./storage";

/** Logo pública de fallback (servida de `public/`). */
export const FALLBACK_LOGO_URL = "/logo-stage.png";

const MEDIA_URL = /^\/api\/media\/([a-zA-Z0-9_-]+)/;

/**
 * Referências de logo que o HTML gerado pela IA ou legado pode conter:
 * `logo.png`, `./logo.png` e caminhos antigos do workspace (`/api/ws/marca/assets/logo/...`, `marca/assets/logo/...`).
 * URLs `/api/media/<id>` NÃO são tocadas.
 */
const LOGO_REF =
  /(["'(])((?:\.\/)?logo\.png|(?:\.\.\/)*(?:\/api\/ws\/)?marca\/assets\/logo\/[^"')\s]+)(["')])/g;

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

