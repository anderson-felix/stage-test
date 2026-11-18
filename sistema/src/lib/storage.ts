import { randomBytes } from "node:crypto";
import { BlobServiceClient } from "@azure/storage-blob";
import prisma from "./prisma";

export type MediaCategory =
  | "logo"
  | "reference"
  | "social_slide"
  | "lp_asset"
  | "upload";

export class StorageConfigError extends Error {
  readonly statusCode = 503;
  readonly code = "STORAGE_CONFIG_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigError";
  }
}

export class StorageOperationError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(
    message: string,
    code: string = "STORAGE_OPERATION_ERROR",
    statusCode: number = 503
  ) {
    super(message);
    this.name = "StorageOperationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type AzureStorageRuntimeConfig = {
  connectionString: string;
  containerName: string;
};

export type AzureBlobStorageAdapter = {
  uploadBlob(params: {
    containerName: string;
    blobKey: string;
    buffer: Buffer;
    mimeType: string;
  }): Promise<{ blobUrl: string }>;
  downloadBlob(params: {
    containerName: string;
    blobKey: string;
  }): Promise<{ buffer: Buffer; mimeType?: string } | null>;
  deleteBlob(params: {
    containerName: string;
    blobKey: string;
  }): Promise<void>;
};

const CONTAINER_NAME_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;
const ACCOUNT_NAME_REGEX = /^[a-z0-9]{3,24}$/;
const SAFE_SEGMENT_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Remove qualquer possível fragmento sensível (AccountKey, SharedAccessSignature, sig)
 * de mensagens de erro antes de propagar ou registrar logs.
 */
export function sanitizeStorageErrorMessage(
  rawMessage: string,
  fallback: string
): string {
  if (!rawMessage || typeof rawMessage !== "string") return fallback;
  const redacted = rawMessage
    .replace(/AccountKey=[^;\s"']+/gi, "AccountKey=[REDACTED]")
    .replace(/SharedAccessSignature=[^;\s"']+/gi, "SharedAccessSignature=[REDACTED]")
    .replace(/([?&]sig=)[^&\s"']+/gi, "$1[REDACTED]");
  return redacted.trim() || fallback;
}

export function isValidAzureContainerName(name: string): boolean {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 63) return false;
  if (trimmed.includes("--")) return false;
  return CONTAINER_NAME_REGEX.test(trimmed);
}

/**
 * Valida AZURE_STORAGE_CONNECTION_STRING sem jamais exibir seu valor em mensagens de erro.
 */
export function validateAzureConnectionString(rawConn: string | undefined): string {
  if (typeof rawConn !== "string" || rawConn.trim().length === 0) {
    throw new StorageConfigError(
      "Configuração de storage ausente: AZURE_STORAGE_CONNECTION_STRING não está definida."
    );
  }

  const trimmed = rawConn.trim();
  if (/[\r\n\0]/.test(trimmed)) {
    throw new StorageConfigError(
      "Configuração de storage inválida: AZURE_STORAGE_CONNECTION_STRING contém caracteres de controle inválidos."
    );
  }

  const kv = new Map<string, string>();
  for (const part of trimmed.split(";")) {
    const seg = part.trim();
    if (!seg) continue;
    const eqIdx = seg.indexOf("=");
    if (eqIdx <= 0) {
      throw new StorageConfigError(
        "Configuração de storage inválida: AZURE_STORAGE_CONNECTION_STRING possui segmento malformado."
      );
    }
    const key = seg.slice(0, eqIdx).trim().toLowerCase();
    const val = seg.slice(eqIdx + 1).trim();
    kv.set(key, val);
  }

  if (kv.get("usedevelopmentstorage")?.toLowerCase() === "true") {
    return trimmed;
  }

  const protocol = kv.get("defaultendpointsprotocol")?.toLowerCase();
  const blobEndpoint = kv.get("blobendpoint");
  if (protocol && protocol !== "https" && protocol !== "http") {
    throw new StorageConfigError(
      "Configuração de storage inválida: DefaultEndpointsProtocol em AZURE_STORAGE_CONNECTION_STRING deve ser 'https' ou 'http'."
    );
  }
  if (!protocol && !blobEndpoint) {
    throw new StorageConfigError(
      "Configuração de storage inválida: AZURE_STORAGE_CONNECTION_STRING deve conter DefaultEndpointsProtocol ou BlobEndpoint."
    );
  }

  const accountName = kv.get("accountname") || "";
  if (!ACCOUNT_NAME_REGEX.test(accountName)) {
    throw new StorageConfigError(
      "Configuração de storage inválida: AccountName ausente ou inválido em AZURE_STORAGE_CONNECTION_STRING."
    );
  }

  const accountKey = kv.get("accountkey") || "";
  const sas = kv.get("sharedaccesssignature") || "";
  if (!accountKey && !sas) {
    throw new StorageConfigError(
      "Configuração de storage inválida: AZURE_STORAGE_CONNECTION_STRING deve definir AccountKey ou SharedAccessSignature."
    );
  }

  if (accountKey) {
    const cleanKey = accountKey.replace(/\s+/g, "");
    if (
      cleanKey.length < 24 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(cleanKey) ||
      Buffer.from(cleanKey, "base64").byteLength < 16
    ) {
      throw new StorageConfigError(
        "Configuração de storage inválida: AccountKey em AZURE_STORAGE_CONNECTION_STRING não é uma chave Base64 válida."
      );
    }
  }

  return trimmed;
}

/**
 * Valida AZURE_STORAGE_CONTAINER_NAME sem jamais exibir seu valor em mensagens de erro.
 */
export function validateAzureContainerName(rawContainer: string | undefined): string {
  if (typeof rawContainer !== "string" || rawContainer.trim().length === 0) {
    throw new StorageConfigError(
      "Configuração de storage ausente: AZURE_STORAGE_CONTAINER_NAME não está definida."
    );
  }

  const trimmed = rawContainer.trim();
  if (!isValidAzureContainerName(trimmed)) {
    throw new StorageConfigError(
      "Configuração de storage inválida: AZURE_STORAGE_CONTAINER_NAME deve ter entre 3 e 63 caracteres minúsculos (letras, números e hífens simples, sem '--')."
    );
  }

  return trimmed;
}

/**
 * Resolve e valida em runtime a configuração obrigatória do Azure Blob Storage.
 * Não utiliza fallback temporário em disco nem altera comportamento por NODE_ENV.
 */
export function resolveAzureStorageConfig(
  env: NodeJS.ProcessEnv = process.env
): AzureStorageRuntimeConfig {
  const connectionString = validateAzureConnectionString(
    env.AZURE_STORAGE_CONNECTION_STRING
  );
  const containerName = validateAzureContainerName(
    env.AZURE_STORAGE_CONTAINER_NAME
  );

  return {
    connectionString,
    containerName,
  };
}

function createSdkStorageAdapter(connectionString: string): AzureBlobStorageAdapter {
  let serviceClient: BlobServiceClient;
  try {
    serviceClient = BlobServiceClient.fromConnectionString(connectionString);
  } catch {
    throw new StorageConfigError(
      "Configuração de storage inválida: falha ao inicializar cliente do Azure Blob Storage a partir de AZURE_STORAGE_CONNECTION_STRING."
    );
  }

  return {
    async uploadBlob({ containerName, blobKey, buffer, mimeType }) {
      try {
        const containerClient = serviceClient.getContainerClient(containerName);
        // Preserva container privado (sem definir access: 'blob' ou 'container')
        await containerClient.createIfNotExists();
        const blockBlobClient = containerClient.getBlockBlobClient(blobKey);
        await blockBlobClient.uploadData(buffer, {
          blobHTTPHeaders: {
            blobContentType: mimeType,
            blobCacheControl: "private, max-age=31536000, immutable",
          },
        });
        return { blobUrl: blockBlobClient.url };
      } catch (err) {
        const safeMsg = sanitizeStorageErrorMessage(
          (err as Error)?.message || "",
          "Falha ao gravar objeto no Azure Blob Storage."
        );
        throw new StorageOperationError(
          `Falha no upload para o Azure Blob Storage: ${safeMsg}`,
          "STORAGE_UPLOAD_FAILED",
          503
        );
      }
    },

    async downloadBlob({ containerName, blobKey }) {
      try {
        const containerClient = serviceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(blobKey);
        const buffer = await blobClient.downloadToBuffer();
        const props = await blobClient.getProperties().catch(() => null);
        return {
          buffer,
          mimeType: props?.contentType || undefined,
        };
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        const errorCode = String(
          (err as { code?: string; details?: { errorCode?: string } })?.details
            ?.errorCode ||
            (err as { code?: string })?.code ||
            ""
        );
        if (
          statusCode === 404 ||
          errorCode === "BlobNotFound" ||
          errorCode === "ContainerNotFound"
        ) {
          return null;
        }
        const safeMsg = sanitizeStorageErrorMessage(
          (err as Error)?.message || "",
          "Serviço de armazenamento indisponível."
        );
        throw new StorageOperationError(
          `Falha na leitura do Azure Blob Storage: ${safeMsg}`,
          "STORAGE_READ_FAILED",
          503
        );
      }
    },

    async deleteBlob({ containerName, blobKey }) {
      try {
        const containerClient = serviceClient.getContainerClient(containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobKey);
        await blockBlobClient.deleteIfExists();
      } catch (err) {
        const safeMsg = sanitizeStorageErrorMessage(
          (err as Error)?.message || "",
          "Falha ao remover objeto no Azure Blob Storage."
        );
        throw new StorageOperationError(
          `Falha ao remover objeto do Azure Blob Storage: ${safeMsg}`,
          "STORAGE_DELETE_FAILED",
          503
        );
      }
    },
  };
}

function sanitizeFileName(raw: string): string {
  const cleanRaw = typeof raw === "string" ? raw.trim() : "";
  const dotIdx = cleanRaw.lastIndexOf(".");
  const rawExt = dotIdx > 0 ? cleanRaw.slice(dotIdx + 1) : "bin";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "bin";
  const rawBase = dotIdx > 0 ? cleanRaw.slice(0, dotIdx) : cleanRaw;
  const base = rawBase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const nonce = randomBytes(3).toString("hex");
  return `${base || "asset"}-${Date.now().toString(36)}-${nonce}.${ext}`;
}

export function validateTenantPrefixSegment(tenantId: string): string {
  const clean = typeof tenantId === "string" ? tenantId.trim() : "";
  if (!clean || !SAFE_SEGMENT_REGEX.test(clean) || clean.includes("..")) {
    throw new StorageOperationError(
      "Identificador de tenant inválido para prefixo de storage.",
      "INVALID_TENANT_PREFIX",
      400
    );
  }
  return clean;
}

export function validateCategorySegment(category: string): string {
  const clean = typeof category === "string" ? category.trim() : "";
  if (!clean || !SAFE_SEGMENT_REGEX.test(clean) || clean.includes("..")) {
    throw new StorageOperationError(
      "Categoria de mídia inválida para prefixo de storage.",
      "INVALID_CATEGORY_PREFIX",
      400
    );
  }
  return clean;
}

export function buildBlobKey(
  tenantId: string,
  category: string,
  fileName: string,
  now: Date = new Date()
): string {
  const cleanTenantId = validateTenantPrefixSegment(tenantId);
  const cleanCategory = validateCategorySegment(category);
  const yyyyMm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const safeName = sanitizeFileName(fileName);
  return `${cleanTenantId}/${cleanCategory}/${yyyyMm}/${safeName}`;
}

export function parseStoredBlobReference(
  blobUrl: string,
  configuredContainerName: string
): {
  containerName: string;
  blobKey: string;
  tenantPrefix: string;
} {
  if (typeof blobUrl !== "string" || !blobUrl.trim()) {
    throw new StorageOperationError(
      "Referência de objeto de storage vazia ou ausente.",
      "INVALID_BLOB_REFERENCE",
      400
    );
  }

  const trimmed = blobUrl.trim();
  // Recusa caminhos locais legados ("uploads/...") ou path traversal
  if (
    trimmed.startsWith("uploads/") ||
    trimmed.includes("..") ||
    trimmed.includes("\\")
  ) {
    throw new StorageOperationError(
      "Referência de storage inválida: apenas objetos do Azure Blob Storage são aceitos.",
      "INVALID_BLOB_REFERENCE",
      500
    );
  }

  let containerName = configuredContainerName;
  let blobKey = "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new StorageOperationError(
        "URL de blob malformada.",
        "INVALID_BLOB_REFERENCE",
        500
      );
    }
    const pathParts = parsed.pathname
      .replace(/^\/+/, "")
      .split("/")
      .map((p) => decodeURIComponent(p))
      .filter(Boolean);

    // Suporta formato padrão https://<account>.blob.core.windows.net/<container>/<tenant>/<cat>/<yyyy-mm>/<file>
    // e Azurite http://127.0.0.1:10000/<account>/<container>/<tenant>/<cat>/<yyyy-mm>/<file>
    const containerIdx = pathParts.indexOf(configuredContainerName);
    if (containerIdx !== -1 && pathParts.length > containerIdx + 1) {
      containerName = pathParts[containerIdx];
      blobKey = pathParts.slice(containerIdx + 1).join("/");
    } else if (pathParts.length >= 2) {
      containerName = pathParts[0];
      blobKey = pathParts.slice(1).join("/");
    }
  } else {
    blobKey = trimmed.replace(/^\/+/, "");
  }

  const keySegments = blobKey.split("/").filter(Boolean);
  if (keySegments.length < 2) {
    throw new StorageOperationError(
      "Chave de blob inválida: prefixo por tenant ausente.",
      "INVALID_BLOB_REFERENCE",
      500
    );
  }

  const tenantPrefix = validateTenantPrefixSegment(keySegments[0]);
  return {
    containerName,
    blobKey: keySegments.join("/"),
    tenantPrefix,
  };
}

/**
 * Faz upload de um arquivo binário para o container privado do Azure Blob Storage sob o prefixo
 * `{tenantId}/{category}/{yyyy-mm}/{filename}` e registra `MediaAsset` no PostgreSQL somente
 * após a confirmação do upload e validação da referência gerada.
 */
export async function uploadTenantAsset(
  params: {
    tenantId: string;
    category: MediaCategory | string;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
  },
  options?: {
    env?: NodeJS.ProcessEnv;
    storageAdapter?: AzureBlobStorageAdapter;
    skipDatabaseRecord?: boolean;
  }
) {
  const env = options?.env ?? process.env;
  const cfg = resolveAzureStorageConfig(env);

  if (!Buffer.isBuffer(params.buffer) || params.buffer.byteLength === 0) {
    throw new StorageOperationError(
      "O conteúdo do arquivo para upload no storage não pode ser vazio.",
      "EMPTY_UPLOAD_BUFFER",
      400
    );
  }

  const blobKey = buildBlobKey(params.tenantId, params.category, params.fileName);
  const adapter =
    options?.storageAdapter ?? createSdkStorageAdapter(cfg.connectionString);

  const { blobUrl } = await adapter.uploadBlob({
    containerName: cfg.containerName,
    blobKey,
    buffer: params.buffer,
    mimeType: params.mimeType || "application/octet-stream",
  });

  // Garante que a referência retornada é uma URL válida do Azure Blob Storage com o prefixo do tenant
  if (
    typeof blobUrl !== "string" ||
    !/^https?:\/\//i.test(blobUrl) ||
    !blobUrl.includes(encodeURIComponent(params.tenantId)) &&
      !blobUrl.includes(`/${params.tenantId}/`)
  ) {
    throw new StorageOperationError(
      "O storage retornou uma referência de blob inválida após o upload.",
      "INVALID_UPLOAD_REFERENCE",
      503
    );
  }

  if (options?.skipDatabaseRecord) {
    return {
      id: `synthetic-${Date.now()}`,
      tenantId: params.tenantId,
      category: params.category,
      fileName: params.fileName,
      mimeType: params.mimeType,
      sizeBytes: params.buffer.byteLength,
      blobUrl,
      blobKey,
      storageTier: "Hot",
      createdAt: new Date(),
    };
  }

  try {
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
  } catch (dbErr) {
    // Se a gravação no banco falhar após o upload, remove o blob órfão no Azure
    await adapter
      .deleteBlob({ containerName: cfg.containerName, blobKey })
      .catch(() => undefined);
    throw dbErr;
  }
}

/**
 * Baixa os bytes de um asset armazenado no container privado do Azure Blob Storage
 * mediado exclusivamente pelo backend, validando o prefixo por tenant.
 */
export async function downloadTenantAssetBuffer(
  blobUrl: string,
  options?: {
    expectedTenantId?: string;
    env?: NodeJS.ProcessEnv;
    storageAdapter?: AzureBlobStorageAdapter;
  }
): Promise<{ buffer: Buffer; mimeType?: string } | null> {
  const env = options?.env ?? process.env;
  const cfg = resolveAzureStorageConfig(env);
  const parsedRef = parseStoredBlobReference(blobUrl, cfg.containerName);

  if (options?.expectedTenantId) {
    const cleanExpected = validateTenantPrefixSegment(options.expectedTenantId);
    if (parsedRef.tenantPrefix !== cleanExpected) {
      throw new StorageOperationError(
        "Acesso negado ao objeto de storage: prefixo de tenant não autorizado.",
        "TENANT_PREFIX_MISMATCH",
        403
      );
    }
  }

  const adapter =
    options?.storageAdapter ?? createSdkStorageAdapter(cfg.connectionString);

  return adapter.downloadBlob({
    containerName: parsedRef.containerName,
    blobKey: parsedRef.blobKey,
  });
}

/**
 * Remove um objeto específico do Azure Blob Storage validando o prefixo por tenant.
 */
export async function deleteTenantAssetBlob(
  blobUrl: string,
  options?: {
    expectedTenantId?: string;
    env?: NodeJS.ProcessEnv;
    storageAdapter?: AzureBlobStorageAdapter;
  }
): Promise<void> {
  const env = options?.env ?? process.env;
  const cfg = resolveAzureStorageConfig(env);
  const parsedRef = parseStoredBlobReference(blobUrl, cfg.containerName);

  if (options?.expectedTenantId) {
    const cleanExpected = validateTenantPrefixSegment(options.expectedTenantId);
    if (parsedRef.tenantPrefix !== cleanExpected) {
      throw new StorageOperationError(
        "Acesso negado para remoção de objeto: prefixo de tenant não autorizado.",
        "TENANT_PREFIX_MISMATCH",
        403
      );
    }
  }

  const adapter =
    options?.storageAdapter ?? createSdkStorageAdapter(cfg.connectionString);

  await adapter.deleteBlob({
    containerName: parsedRef.containerName,
    blobKey: parsedRef.blobKey,
  });
}

/**
 * Executa um teste sintético isolado de upload, leitura e remoção de um único arquivo
 * sob o prefixo exclusivo de teste (`__stage_storage_smoke_test__`), removendo apenas
 * o objeto criado ao concluir.
 */
export async function runSyntheticStorageSmokeTest(options?: {
  env?: NodeJS.ProcessEnv;
  storageAdapter?: AzureBlobStorageAdapter;
}): Promise<{
  ok: boolean;
  blobKey: string;
  bytesVerified: number;
  cleanedUp: boolean;
}> {
  const env = options?.env ?? process.env;
  const cfg = resolveAzureStorageConfig(env);
  const adapter =
    options?.storageAdapter ?? createSdkStorageAdapter(cfg.connectionString);

  const syntheticTenantPrefix = "__stage_storage_smoke_test__";
  const payloadText = `stage-hub-storage-smoke-${Date.now()}-${randomBytes(8).toString("hex")}`;
  const payloadBuffer = Buffer.from(payloadText, "utf8");

  let uploadedBlobUrl = "";
  let uploadedBlobKey = "";
  let cleanedUp = false;

  try {
    const uploaded = await uploadTenantAsset(
      {
        tenantId: syntheticTenantPrefix,
        category: "lp_asset",
        fileName: "smoke-probe.html",
        mimeType: "text/html; charset=utf-8",
        buffer: payloadBuffer,
      },
      {
        env,
        storageAdapter: adapter,
        skipDatabaseRecord: true,
      }
    );

    uploadedBlobUrl = uploaded.blobUrl;
    uploadedBlobKey =
      "blobKey" in uploaded && typeof uploaded.blobKey === "string"
        ? uploaded.blobKey
        : parseStoredBlobReference(uploaded.blobUrl, cfg.containerName).blobKey;

    const downloaded = await downloadTenantAssetBuffer(uploadedBlobUrl, {
      expectedTenantId: syntheticTenantPrefix,
      env,
      storageAdapter: adapter,
    });

    if (!downloaded || !downloaded.buffer.equals(payloadBuffer)) {
      throw new StorageOperationError(
        "Falha na verificação de integridade do objeto sintético lido do Azure Blob Storage.",
        "SMOKE_TEST_INTEGRITY_FAILED",
        503
      );
    }

    return {
      ok: true,
      blobKey: uploadedBlobKey,
      bytesVerified: downloaded.buffer.byteLength,
      cleanedUp: true,
    };
  } finally {
    if (uploadedBlobUrl) {
      await deleteTenantAssetBlob(uploadedBlobUrl, {
        expectedTenantId: syntheticTenantPrefix,
        env,
        storageAdapter: adapter,
      });
      cleanedUp = true;
    }
    void cleanedUp;
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
