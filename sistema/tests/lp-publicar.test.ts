import assert from "node:assert/strict";
import Module from "node:module";
import { afterEach, beforeEach, describe, it } from "node:test";
import { DnsStatus, LPStatus, SslStatus } from "@prisma/client";

type MockState = {
  sessao:
    | {
        id: string;
        email: string;
        role: string;
        tenantId: string;
        isSuperAdmin: boolean;
      }
    | Response;
  lpRow: Record<string, unknown> | null;
  requestedDomain: Record<string, unknown> | null;
  recheckDomain: Record<string, unknown> | null;
  recheckTenant: { id: string; isActive: boolean } | null;
  recheckLp: { id: string; editorialRevision?: number } | null;
  uploadCalls: number;
  uploadError: Error | null;
  uploadResult: { id: string; blobUrl: string };
  txThrowError: Error | null;
  updateCalls: Array<Record<string, unknown>>;
  deletedBlobUrls: string[];
  deletedAssetIds: string[];
  invalidatedHosts: string[];
  onBeforeTx?: () => void;
  onUpdate?: () => void;
};

let state: MockState;

function resetState(): void {
  const validDomain = {
    id: "dom-1",
    tenantId: "tenant-1",
    domain: "lp.cliente.com.br",
    dnsStatus: DnsStatus.VERIFIED,
    sslStatus: SslStatus.ACTIVE,
  };
  state = {
    sessao: {
      id: "user-1",
      email: "editor@cliente.com.br",
      role: "EDITOR",
      tenantId: "tenant-1",
      isSuperAdmin: false,
    },
    lpRow: {
      id: "lp-1",
      tenantId: "tenant-1",
      slug: "minha-lp",
      title: "Minha LP",
      draftHtml: "<html><head><title>LP</title></head><body><h1>Oi</h1></body></html>",
      publishedBlobUrl: "https://storage.blob.core.windows.net/assets/tenant-1/lp_asset/2026-11/anterior.html",
      trackingConfig: {},
      briefingData: { legacyStatus: "publicada", urlPublicada: "https://lp.cliente.com.br/minha-lp" },
      customDomainId: "dom-1",
      customDomain: validDomain,
      tenant: { id: "tenant-1", slug: "cliente", isActive: true },
    },
    requestedDomain: validDomain,
    recheckDomain: validDomain,
    recheckTenant: { id: "tenant-1", isActive: true },
    recheckLp: { id: "lp-1" },
    uploadError: null,
    uploadCalls: 0,
    uploadResult: {
      id: "asset-new-1",
      blobUrl: "https://storage.blob.core.windows.net/assets/tenant-1/lp_asset/2026-11/minha-lp-new.html",
    },
    txThrowError: null,
    updateCalls: [],
    deletedBlobUrls: [],
    deletedAssetIds: [],
    invalidatedHosts: [],
  };
}

class MockStorageConfigError extends Error {
  statusCode = 503;
  code = "STORAGE_CONFIG_ERROR";
}

class MockStorageOperationError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, code = "STORAGE_UPLOAD_FAILED", statusCode = 503) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

const mockPrisma: {
  landingPage: {
    findUnique: () => Promise<Record<string, unknown> | null>;
    findFirst: (args: { where?: { publishedBlobUrl?: string } }) => Promise<{ id: string; editorialRevision?: number } | null>;
    update: (args: Record<string, unknown>) => Promise<{ id: string }>;
  };
  customDomain: {
    findFirst: (args: { where?: { id?: string; tenantId?: string } }) => Promise<Record<string, unknown> | null>;
  };
  tenant: {
    findUnique: () => Promise<{ id: string; isActive: boolean } | null>;
  };
  mediaAsset: {
    delete: (args: { where: { id: string } }) => Promise<{ id: string }>;
  };
  $transaction: <T>(fn: (tx: typeof mockPrisma) => Promise<T>) => Promise<T>;
} = {
  landingPage: {
    findUnique: async () => structuredClone(state.lpRow),
    findFirst: async (args) => args.where?.publishedBlobUrl
      ? (state.lpRow?.publishedBlobUrl === args.where.publishedBlobUrl ? { id: "adopted" } : null)
      : state.recheckLp,
    update: async (args: Record<string, unknown>) => {
      const where = args.where as { editorialRevision?: number };
      if (where.editorialRevision !== undefined && where.editorialRevision !== state.recheckLp?.editorialRevision) throw Object.assign(new Error("CAS conflict"), { code: "P2025" });
      state.updateCalls.push(args);
      state.onUpdate?.();
      return { id: "lp-1" };
    },
  },
  customDomain: {
    findFirst: async (args: { where?: { id?: string; tenantId?: string } }) => {
      // Primeira chamada (body.customDomainId) vs rechecagem dentro de $transaction
      if (inTx) return state.recheckDomain;
      if (args?.where?.tenantId && state.requestedDomain && state.requestedDomain.tenantId !== args.where.tenantId) {
        return null;
      }
      return state.requestedDomain;
    },
  },
  tenant: {
    findUnique: async () => state.recheckTenant,
  },
  mediaAsset: {
    delete: async (args: { where: { id: string } }) => {
      state.deletedAssetIds.push(args.where.id);
      return { id: args.where.id };
    },
  },
  $transaction: async <T>(fn: (tx: typeof mockPrisma) => Promise<T>): Promise<T> => {
    state.onBeforeTx?.();
    if (state.txThrowError) {
      throw state.txThrowError;
    }
    inTx = true;
    try {
      return await fn(mockPrisma);
    } finally {
      inTx = false;
    }
  },
};

let inTx = false;

const originalLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;

(Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "@/lib/auth") {
    return {
      exigirEditor: async () => state.sessao,
    };
  }
  if (request === "@/lib/prisma") {
    return { prisma: mockPrisma };
  }
  if (request === "@/lib/lp") {
    return {
      htmlAutocontido: async () => "<html><body><h1>Final</h1></body></html>",
      lerLP: async () => ({ slug: "minha-lp", status: "publicada" }),
    };
  }
  if (request === "@/lib/redis") {
    return {
      invalidateDomainMapping: async (host: string) => {
        state.invalidatedHosts.push(host);
      },
    };
  }
  if (request === "@/lib/seo-analyzer") {
    return {
      analyzeLandingPageSeo: () => ({
        score: 90,
        grade: "A",
        extracted: { title: "LP", metaDescription: "Desc" },
      }),
    };
  }
  if (request === "@/lib/storage") {
    return {
      StorageConfigError: MockStorageConfigError,
      StorageOperationError: MockStorageOperationError,
      uploadTenantAsset: async () => {
        state.uploadCalls++;
        if (state.uploadError) throw state.uploadError;
        return state.uploadResult;
      },
      deleteTenantAssetBlob: async (blobUrl: string) => {
        state.deletedBlobUrls.push(blobUrl);
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST, DELETE } = require("../src/app/api/lp/[slug]/publicar/route") as {
  POST: (req: Request, ctx: { params: Promise<{ slug: string }> }) => Promise<Response>;
  DELETE: (req: Request, ctx: { params: Promise<{ slug: string }> }) => Promise<Response>;
};

function makeRequest(body: unknown = { customDomainId: "dom-1" }): Request {
  return new Request("http://172.212.145.134/api/lp/minha-lp/publicar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeCtx(slug = "minha-lp") {
  return { params: Promise.resolve({ slug }) };
}

describe("POST /api/lp/[slug]/publicar (Prompt 13)", () => {
  beforeEach(() => {
    process.env.APP_PANEL_HOST = "172.212.145.134";
    process.env.APP_BASE_URL = "http://172.212.145.134";
    process.env.LP_FALLBACK_ENABLED = "false";
    resetState();
  });

  afterEach(() => {
    inTx = false;
  });

  it("publica LP válida com domínio VERIFIED e SSL ACTIVE, gerando URL HTTPS e invalidando cache", async () => {
    const res = await POST(makeRequest(), makeCtx());
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.publicUrl, "https://lp.cliente.com.br/minha-lp");
    assert.equal(data.publishedBlobUrl, state.uploadResult.blobUrl);
    assert.equal(state.updateCalls.length, 1);
    const updateData = (state.updateCalls[0] as { data: Record<string, unknown> }).data;
    assert.equal(updateData.status, LPStatus.PUBLISHED);
    assert.equal(updateData.publishedBlobUrl, state.uploadResult.blobUrl);
    assert.deepEqual(state.invalidatedHosts, ["lp.cliente.com.br"]);
    assert.equal(state.deletedBlobUrls.length, 0);
  });

  it("rejeita domínio de outro tenant com 403 e categoria auth sem upload ou update", async () => {
    state.requestedDomain = null;
    const res = await POST(makeRequest({ customDomainId: "dom-outro-tenant" }), makeCtx());
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.category, "auth");
    assert.equal(data.code, "DOMAIN_NOT_AUTHORIZED");
    assert.equal(state.updateCalls.length, 0);
  });

  it("rejeita publicação sem domínio próprio quando fallback está desativado", async () => {
    const res = await POST(makeRequest({ customDomainId: null }), makeCtx());
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.category, "dns");
    assert.equal(data.code, "CUSTOM_DOMAIN_REQUIRED");
    assert.equal(state.updateCalls.length, 0);
  });

  it("rejeita domínio com DNS pendente com 400 e categoria dns", async () => {
    const pendingDns = {
      id: "dom-1",
      tenantId: "tenant-1",
      domain: "lp.cliente.com.br",
      dnsStatus: DnsStatus.PENDING,
      sslStatus: SslStatus.PENDING,
    };
    state.requestedDomain = pendingDns;
    const res = await POST(makeRequest(), makeCtx());
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.category, "dns");
    assert.equal(data.code, "DNS_NOT_VERIFIED");
    assert.equal(state.updateCalls.length, 0);
  });

  it("rejeita domínio com DNS VERIFIED mas TLS pendente com 400 e categoria tls", async () => {
    const pendingTls = {
      id: "dom-1",
      tenantId: "tenant-1",
      domain: "lp.cliente.com.br",
      dnsStatus: DnsStatus.VERIFIED,
      sslStatus: SslStatus.PROVISIONING,
    };
    state.requestedDomain = pendingTls;
    const res = await POST(makeRequest(), makeCtx());
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.category, "tls");
    assert.equal(data.code, "SSL_NOT_ACTIVE");
    assert.equal(state.updateCalls.length, 0);
  });

  it("aborta publicação em falha de upload com 503 storage e preserva publicação anterior", async () => {
    state.uploadError = new MockStorageOperationError("Azure timeout", "STORAGE_UPLOAD_FAILED", 503);
    const res = await POST(makeRequest(), makeCtx());
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.category, "storage");
    assert.equal(data.code, "STORAGE_UPLOAD_FAILED");
    assert.equal(state.updateCalls.length, 0);
  });

  it("cancela publicação e limpa somente o novo artefato órfão se domínio for invalidado durante o upload", async () => {
    state.recheckDomain = {
      id: "dom-1",
      tenantId: "tenant-1",
      domain: "lp.cliente.com.br",
      dnsStatus: DnsStatus.FAILED,
      sslStatus: SslStatus.PENDING,
    };
    const res = await POST(makeRequest(), makeCtx());
    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.category, "dns");
    assert.equal(data.code, "DNS_NOT_VERIFIED");
    assert.equal(state.updateCalls.length, 0);
    assert.deepEqual(state.deletedBlobUrls, [state.uploadResult.blobUrl]);
    assert.deepEqual(state.deletedAssetIds, [state.uploadResult.id]);
  });

  it("cancela publicação e limpa somente o novo artefato órfão se domínio for removido durante o upload", async () => {
    state.recheckDomain = null;
    const res = await POST(makeRequest(), makeCtx());
    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.category, "dns");
    assert.equal(data.code, "DOMAIN_REMOVED_DURING_PUBLISH");
    assert.equal(state.updateCalls.length, 0);
    assert.deepEqual(state.deletedBlobUrls, [state.uploadResult.blobUrl]);
    assert.deepEqual(state.deletedAssetIds, [state.uploadResult.id]);
  });

  it("cancela publicação e limpa somente o novo artefato órfão se tenant for desativado durante o upload", async () => {
    state.recheckTenant = { id: "tenant-1", isActive: false };
    const res = await POST(makeRequest(), makeCtx());
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.category, "auth");
    assert.equal(data.code, "TENANT_INACTIVE");
    assert.equal(state.updateCalls.length, 0);
    assert.deepEqual(state.deletedBlobUrls, [state.uploadResult.blobUrl]);
    assert.deepEqual(state.deletedAssetIds, [state.uploadResult.id]);
  });

  it("limpa somente o novo artefato órfão em conflito de concorrência (P2034) na transação final", async () => {
    const err = new Error("Serialization failure") as Error & { code?: string };
    err.code = "P2034";
    state.txThrowError = err;
    const res = await POST(makeRequest(), makeCtx());
    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.code, "PUBLISH_CONFLICT");
    assert.equal(state.updateCalls.length, 0);
    assert.deepEqual(state.deletedBlobUrls, [state.uploadResult.blobUrl]);
    assert.deepEqual(state.deletedAssetIds, [state.uploadResult.id]);
  });
});

it("visita durante upload e durante DELETE não altera a revisão editorial", async () => {
  resetState(); state.lpRow!.editorialRevision = 4; state.recheckLp = { id: "lp-1", editorialRevision: 4 };
  state.onBeforeTx = () => { state.lpRow!.updatedAt = new Date(); state.lpRow!.viewsCount = 100; };
  assert.equal((await POST(makeRequest(), makeCtx())).status, 200);
  assert.equal((state.updateCalls[0].where as Record<string, unknown>).editorialRevision, 4);
  assert.equal((await DELETE(makeRequest(), makeCtx())).status, 200);
  const where = state.updateCalls[1].where as Record<string, unknown>;
  assert.equal(where.editorialRevision, 4); assert.equal(where.updatedAt, undefined);
});
it("edição ou publicação concorrente tem mensagem distinta de remoção e não sobrescreve", async () => {
  resetState(); state.lpRow!.editorialRevision = 4; state.recheckLp = { id: "lp-1", editorialRevision: 5 };
  const response = await POST(makeRequest(), makeCtx());
  assert.equal(response.status, 409); assert.equal((await response.json()).code, "LP_EDIT_CONFLICT");
  assert.equal(state.updateCalls.length, 0); assert.deepEqual(state.deletedBlobUrls, [state.uploadResult.blobUrl]);
});
it("retry de serialização revalida domínio sem repetir upload", async () => {
  resetState(); let calls = 0;
  state.onBeforeTx = () => { calls++; state.txThrowError = calls === 1 ? Object.assign(new Error("metrics race"), { code: "P2034" }) : null; };
  assert.equal((await POST(makeRequest(), makeCtx())).status, 200);
  assert.equal(calls, 2); assert.equal(state.uploadCalls, 1); assert.deepEqual(state.deletedBlobUrls, []);
});
it("resultado desconhecido de commit nunca remove Blob já adotado", async () => {
  resetState();
  state.txThrowError = new Error("Commit acknowledgement lost");
  state.onBeforeTx = () => { state.lpRow!.publishedBlobUrl = state.uploadResult.blobUrl; };
  assert.equal((await POST(makeRequest(), makeCtx())).status, 500);
  assert.deepEqual(state.deletedBlobUrls, []); assert.deepEqual(state.deletedAssetIds, []);
});

it("duas publicações concorrentes usam comparação atômica da revisão", async () => {
  resetState(); state.lpRow!.editorialRevision = 0; state.recheckLp = { id: "lp-1", editorialRevision: 0 };
  state.onUpdate = () => { state.recheckLp!.editorialRevision = 1; state.lpRow!.publishedBlobUrl = state.uploadResult.blobUrl; };
  const responses = await Promise.all([POST(makeRequest(), makeCtx()), POST(makeRequest(), makeCtx())]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(state.updateCalls.length, 1);
  assert.deepEqual(state.deletedBlobUrls, []);
});
it("DELETE preserva proteção contra revisão editorial concorrente", async () => {
  resetState(); state.lpRow!.editorialRevision = 0; state.recheckLp = { id: "lp-1", editorialRevision: 0 };
  state.onBeforeTx = () => { state.recheckLp!.editorialRevision = 1; };
  assert.equal((await DELETE(makeRequest(), makeCtx())).status, 409);
  assert.equal(state.updateCalls.length, 0);
});
