import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BlobServiceClient } from "@azure/storage-blob";
import prisma from "./prisma";

function resolveDevBlobPath(rel: string): string {
  const root = path.resolve(
    /*turbopackIgnore: true*/ process.env.LOCAL_BLOB_STORAGE_DIR ||
      path.join(os.tmpdir(), "stage-hub-blobs")
  );
  const full = path.resolve(/*turbopackIgnore: true*/ root, rel.replace(/^\/+/, ""));
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Caminho de blob inválido");
  }
  return full;
}

export const DEFAULT_BLOB_CONTAINER =
  process.env.AZURE_STORAGE_CONTAINER_NAME || "stage-media";

export type MediaCategory =
  | "logo"
  | "reference"
  | "social_slide"
  | "lp_asset"
  | "upload";

function getBlobServiceClient(): BlobServiceClient | null {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Erro de configuração em produção: AZURE_STORAGE_CONNECTION_STRING é obrigatório em ambiente de produção."
      );
    }
    return null;
  }
  return BlobServiceClient.fromConnectionString(conn);
}

function sanitizeFileName(raw: string): string {
  const ext = raw.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const base = raw
    .slice(0, -(ext.length + 1))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "asset"}-${Date.now().toString(36)}.${ext}`;
}

export function buildBlobKey(
  tenantId: string,
  category: string,
  fileName: string
): string {
  const now = new Date();
  const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const safeName = sanitizeFileName(fileName);
  return `${tenantId}/${category}/${yyyyMm}/${safeName}`;
}

/**
 * Faz upload de um arquivo binário para o Azure Blob Storage organizado como
 * `{tenantId}/{category}/{yyyy-mm}/{filename}` e registra `MediaAsset` no PostgreSQL.
 * Em desenvolvimento sem AZURE_STORAGE_CONNECTION_STRING, usa fallback em disco local.
 */
export async function uploadTenantAsset(params: {
  tenantId: string;
  category: MediaCategory | string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const blobKey = buildBlobKey(params.tenantId, params.category, params.fileName);
  const serviceClient = getBlobServiceClient();

  let blobUrl = "";

  if (serviceClient) {
    const containerClient = serviceClient.getContainerClient(DEFAULT_BLOB_CONTAINER);
    await containerClient.createIfNotExists();
    const blockBlobClient = containerClient.getBlockBlobClient(blobKey);
    await blockBlobClient.uploadData(params.buffer, {
      blobHTTPHeaders: {
        blobContentType: params.mimeType,
        blobCacheControl: "public, max-age=31536000, immutable",
      },
    });
    blobUrl = blockBlobClient.url;
  } else {
    // Fallback local apenas em desenvolvimento (NODE_ENV !== "production")
    const localRel = `uploads/${blobKey}`;
    const fullPath = resolveDevBlobPath(localRel);
    await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(fullPath), { recursive: true });
    await fs.writeFile(/*turbopackIgnore: true*/ fullPath, params.buffer);
    blobUrl = localRel;
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      tenantId: params.tenantId,
      category: params.category,
      fileName: params.fileName,
      mimeType: params.mimeType,
      sizeBytes: params.buffer.byteLength,
      blobUrl,
      storageTier: "Hot",
    },
  });

  return asset;
}

/**
 * Baixa os bytes de um asset armazenado no Azure Blob Storage ou no fallback local de dev.
 */
export async function downloadTenantAssetBuffer(
  blobUrl: string
): Promise<{ buffer: Buffer; mimeType?: string } | null> {
  if (blobUrl.startsWith("http://") || blobUrl.startsWith("https://")) {
    const serviceClient = getBlobServiceClient();
    if (serviceClient) {
      try {
        const parsed = new URL(blobUrl);
        const pathParts = parsed.pathname.replace(/^\/+/, "").split("/");
        const containerName = pathParts[0] || DEFAULT_BLOB_CONTAINER;
        const blobName = pathParts.slice(1).join("/");
        const containerClient = serviceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(blobName);
        const buf = await blobClient.downloadToBuffer();
        const props = await blobClient.getProperties().catch(() => null);
        return { buffer: buf, mimeType: props?.contentType };
      } catch {
        // Tenta fetch direto se for URL pública
      }
    }
    try {
      const res = await fetch(blobUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      return {
        buffer: Buffer.from(await res.arrayBuffer()),
        mimeType: res.headers.get("content-type") || undefined,
      };
    } catch {
      return null;
    }
  }

  try {
    const full = resolveDevBlobPath(blobUrl);
    const buf = await fs.readFile(/*turbopackIgnore: true*/ full);
    return { buffer: buf };
  } catch {
    return null;
  }
}

/**
 * Lista os MediaAssets pertencentes ao tenant no banco, opcionalmente filtrados por categoria.
 */
export async function listTenantAssets(tenantId: string, category?: string) {
  return prisma.mediaAsset.findMany({
    where: {
      tenantId,
      ...(category && category !== "all" ? { category } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

