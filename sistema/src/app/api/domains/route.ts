import { exigirAdmin, exigirEditor, exigirSessao } from "@/lib/auth";
import {
  DomainConcurrencyError,
  DomainConflictError,
  DomainRateLimitError,
  DomainValidationError,
  deleteCustomDomain,
  listTenantDomains,
  reassociateLandingPageDomain,
  registerCustomDomain,
  setCustomDomainHomeLandingPage,
  verifyCustomDomain,
} from "@/lib/domains";

export async function GET(request?: Request) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const zoneApex = request
    ? new URL(request.url).searchParams.get("zoneApex")?.trim() || undefined
    : undefined;

  const data = await listTenantDomains(sessao.tenantId, { zoneApex });
  return Response.json(data);
}

export async function POST(request: Request) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === "verify" && typeof body.domainId === "string") {
    try {
      const result = await verifyCustomDomain(sessao.tenantId, body.domainId, {
        trigger: "manual",
      });
      return Response.json(result);
    } catch (err) {
      if (err instanceof DomainRateLimitError) {
        return Response.json(
          { error: err.message, retryAfterSeconds: err.retryAfterSeconds },
          {
            status: err.statusCode,
            headers: { "Retry-After": String(err.retryAfterSeconds) },
          }
        );
      }
      if (err instanceof DomainConcurrencyError) {
        return Response.json({ error: err.message }, { status: err.statusCode });
      }
      return Response.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  if (body.action === "setHome" && typeof body.domainId === "string") {
    try {
      const updated = await setCustomDomainHomeLandingPage(sessao.tenantId, {
        domainId: body.domainId,
        landingPageId:
          body.landingPageId === null
            ? null
            : typeof body.landingPageId === "string"
              ? body.landingPageId
              : undefined,
        slug:
          body.slug === null
            ? null
            : typeof body.slug === "string"
              ? body.slug
              : undefined,
      });
      return Response.json({ ok: true, home: updated });
    } catch (err) {
      const status =
        err instanceof DomainValidationError ? err.statusCode : 400;
      return Response.json({ error: (err as Error).message }, { status });
    }
  }

  if (
    body.action === "reassociate" &&
    typeof body.slug === "string" &&
    typeof body.customDomainId === "string"
  ) {
    try {
      const reassociated = await reassociateLandingPageDomain(sessao.tenantId, {
        slug: body.slug,
        customDomainId: body.customDomainId,
      });
      return Response.json({ ok: true, reassociated });
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  const domain = typeof body.domain === "string" ? body.domain.trim() : "";
  const dnsProviderHint =
    typeof body.dnsProviderHint === "string" ? body.dnsProviderHint.trim() : undefined;
  const isDefault = typeof body.isDefault === "boolean" ? body.isDefault : undefined;
  const zoneApex =
    typeof body.zoneApex === "string" && body.zoneApex.trim()
      ? body.zoneApex.trim()
      : undefined;

  if (!domain) {
    return Response.json({ error: "Informe o domínio customizado" }, { status: 400 });
  }

  try {
    const created = await registerCustomDomain(sessao.tenantId, {
      domain,
      dnsProviderHint,
      isDefault,
      zoneApex,
    });
    return Response.json({ domain: created });
  } catch (err) {
    const status =
      err instanceof DomainConflictError
        ? err.statusCode
        : err instanceof DomainValidationError
          ? err.statusCode
          : 400;
    return Response.json({ error: (err as Error).message }, { status });
  }
}

export async function DELETE(request: Request) {
  const admin = await exigirAdmin();
  if (admin instanceof Response) return admin;

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) {
    return Response.json({ error: "Informe o id do domínio" }, { status: 400 });
  }

  try {
    await deleteCustomDomain(admin.tenantId, id);
    return Response.json({ ok: true });
  } catch (err) {
    const status =
      err instanceof DomainConflictError ||
      err instanceof DomainConcurrencyError ||
      err instanceof DomainValidationError
        ? err.statusCode
        : 400;
    return Response.json({ error: (err as Error).message }, { status });
  }
}
