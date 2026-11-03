import { exigirAdmin, exigirEditor, exigirSessao } from "@/lib/auth";
import {
  deleteCustomDomain,
  listTenantDomains,
  registerCustomDomain,
  verifyCustomDomain,
} from "@/lib/domains";

export async function GET() {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const data = await listTenantDomains(sessao.tenantId);
  return Response.json(data);
}

export async function POST(request: Request) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === "verify" && typeof body.domainId === "string") {
    try {
      const result = await verifyCustomDomain(sessao.tenantId, body.domainId);
      return Response.json(result);
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  const domain = typeof body.domain === "string" ? body.domain.trim() : "";
  const dnsProviderHint =
    typeof body.dnsProviderHint === "string" ? body.dnsProviderHint.trim() : undefined;
  const isDefault = typeof body.isDefault === "boolean" ? body.isDefault : undefined;

  if (!domain) {
    return Response.json({ error: "Informe o domínio customizado" }, { status: 400 });
  }

  try {
    const created = await registerCustomDomain(sessao.tenantId, {
      domain,
      dnsProviderHint,
      isDefault,
    });
    return Response.json({ domain: created });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
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
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

