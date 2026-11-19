import { exigirEditor, exigirSessao } from "@/lib/auth";
import {
  getTenantEmailConfig,
  registerTenantDomain,
  updateTenantEmailPreferences,
  verifyTenantDomain,
} from "@/lib/email-service";

export async function GET() {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const config = await getTenantEmailConfig(sessao.tenantId);
  return Response.json(config);
}

export async function POST(request: Request) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === "verify") {
    try {
      const result = await verifyTenantDomain(sessao.tenantId);
      return Response.json(result);
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  const senderDomain = typeof body.senderDomain === "string" ? body.senderDomain.trim() : "";
  const senderEmail = typeof body.senderEmail === "string" ? body.senderEmail.trim() : undefined;
  const senderName = typeof body.senderName === "string" ? body.senderName.trim() : undefined;
  const leadDestinationEmails = Array.isArray(body.leadDestinationEmails)
    ? body.leadDestinationEmails.filter((e): e is string => typeof e === "string")
    : undefined;

  if (!senderDomain) {
    return Response.json({ error: "Informe o domínio de envio" }, { status: 400 });
  }

  try {
    const result = await registerTenantDomain(sessao.tenantId, {
      senderDomain,
      senderEmail,
      senderName,
      leadDestinationEmails,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const senderEmail = typeof body.senderEmail === "string" ? body.senderEmail : undefined;
  const senderName = typeof body.senderName === "string" ? body.senderName : undefined;
  const leadDestinationEmails = Array.isArray(body.leadDestinationEmails)
    ? body.leadDestinationEmails.filter((e): e is string => typeof e === "string")
    : undefined;
  const useStageFallback =
    typeof body.useStageFallback === "boolean" ? body.useStageFallback : undefined;

  try {
    const updated = await updateTenantEmailPreferences(sessao.tenantId, {
      senderEmail,
      senderName,
      leadDestinationEmails,
      useStageFallback,
    });
    return Response.json(updated);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

