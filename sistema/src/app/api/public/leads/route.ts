import { LPStatus, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { checkRateLimit, getDomainMapping, normalizeHostname } from "@/lib/redis";
import { enqueueLeadNotification } from "@/lib/email-service";

function extractClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "local";
}

export async function POST(request: Request) {
  const ip = extractClientIp(request);
  const rate = await checkRateLimit(`public_leads:${ip}`, 15, 60);
  if (!rate.allowed) {
    return Response.json(
      { error: "Muitas tentativas em sequência. Aguarde um minuto e tente novamente." },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Payload inválido" }, { status: 400 });
  }

  // Honeypot anti-spam: se preenchido por bot, responde 200 silenciosamente sem gravar
  const rawPayloadObj =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};
  const honeypot =
    (typeof body._gotcha === "string" ? body._gotcha : "") ||
    (typeof rawPayloadObj._gotcha === "string" ? rawPayloadObj._gotcha : "") ||
    (typeof body.honeypot === "string" ? body.honeypot : "") ||
    (typeof body._stage_hp === "string" ? body._stage_hp : "");
  if (honeypot.trim().length > 0) {
    return Response.json({ ok: true });
  }

  const landingPageId =
    typeof body.landingPageId === "string" ? body.landingPageId.trim() : "";
  const lpSlug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";

  // Resolve o host da requisição ou o host informado pelo interceptador
  const headerHost = normalizeHostname(
    request.headers.get("x-forwarded-host")?.split(",")[0] ||
      request.headers.get("host") ||
      ""
  );
  const bodyHost = typeof body.host === "string" ? normalizeHostname(body.host) : "";

  let resolvedTenantId: string | null = null;
  const domainMap =
    (bodyHost ? await getDomainMapping(bodyHost) : null) ??
    (headerHost ? await getDomainMapping(headerHost) : null);

  if (domainMap) {
    resolvedTenantId = domainMap.tenantId;
  }

  // Busca a LP publicada e confirma a qual tenant ela pertence no servidor
  const lp = await prisma.landingPage.findFirst({
    where: {
      ...(landingPageId ? { id: landingPageId } : {}),
      ...(lpSlug && !landingPageId ? { slug: lpSlug } : {}),
      ...(resolvedTenantId ? { tenantId: resolvedTenantId } : {}),
      status: LPStatus.PUBLISHED,
    },
    include: {
      tenant: { select: { id: true, isActive: true } },
    },
  });

  if (!lp || !lp.tenant.isActive) {
    return Response.json(
      { error: "Landing Page não encontrada ou não publicada para este domínio" },
      { status: 404 }
    );
  }

  // Se veio de um domínio customizado/subdomínio público, garante que a LP pertence a esse tenant
  if (resolvedTenantId && lp.tenantId !== resolvedTenantId) {
    return Response.json(
      { error: "Violação de isolamento: a Landing Page não pertence a este domínio" },
      { status: 403 }
    );
  }

  const rawPayload =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};

  const sanitizedPayload: Record<string, string> = {};
  const entries = Object.entries(rawPayload).slice(0, 30);
  for (const [key, val] of entries) {
    const cleanKey = key.trim().slice(0, 80);
    if (!cleanKey || cleanKey === "_stage_hp") continue;
    const cleanVal =
      typeof val === "string"
        ? val.trim().slice(0, 2000)
        : String(val ?? "").trim().slice(0, 2000);
    if (cleanVal) {
      sanitizedPayload[cleanKey] = cleanVal;
    }
  }

  // Compatibilidade com envio direto de campos de lead
  if (typeof body.name === "string" && body.name.trim() && !sanitizedPayload.name && !sanitizedPayload.nome) {
    sanitizedPayload.name = body.name.trim();
  }
  if (typeof body.email === "string" && body.email.trim() && !sanitizedPayload.email) {
    sanitizedPayload.email = body.email.trim();
  }
  if (typeof body.phone === "string" && body.phone.trim() && !sanitizedPayload.phone && !sanitizedPayload.telefone) {
    sanitizedPayload.phone = body.phone.trim();
  }
  if (body.customFields && typeof body.customFields === "object" && !Array.isArray(body.customFields)) {
    for (const [ck, cv] of Object.entries(body.customFields as Record<string, unknown>)) {
      if (cv && typeof cv === "string") sanitizedPayload[ck] = cv.trim().slice(0, 2000);
    }
  }

  if (Object.keys(sanitizedPayload).length === 0) {
    return Response.json(
      { error: "Preencha ao menos um campo do formulário" },
      { status: 400 }
    );
  }

  const rawUtm =
    body.utmData && typeof body.utmData === "object" && !Array.isArray(body.utmData)
      ? (body.utmData as Record<string, unknown>)
      : {};

  const utmData = {
    utm_source:
      typeof rawUtm.utm_source === "string"
        ? rawUtm.utm_source.slice(0, 200)
        : typeof body.utmSource === "string"
          ? body.utmSource.slice(0, 200)
          : "",
    utm_medium:
      typeof rawUtm.utm_medium === "string"
        ? rawUtm.utm_medium.slice(0, 200)
        : typeof body.utmMedium === "string"
          ? body.utmMedium.slice(0, 200)
          : "",
    utm_campaign:
      typeof rawUtm.utm_campaign === "string"
        ? rawUtm.utm_campaign.slice(0, 200)
        : typeof body.utmCampaign === "string"
          ? body.utmCampaign.slice(0, 200)
          : "",
    utm_term: typeof rawUtm.utm_term === "string" ? rawUtm.utm_term.slice(0, 200) : "",
    utm_content: typeof rawUtm.utm_content === "string" ? rawUtm.utm_content.slice(0, 200) : "",
    referrer: typeof rawUtm.referrer === "string" ? rawUtm.referrer.slice(0, 500) : "",
    page_url: typeof rawUtm.page_url === "string" ? rawUtm.page_url.slice(0, 500) : "",
  };

  const createdLead = await prisma.lpLead.create({
    data: {
      tenantId: lp.tenantId,
      landingPageId: lp.id,
      payload: sanitizedPayload as Prisma.InputJsonValue,
      utmData: utmData as Prisma.InputJsonValue,
      emailDeliveryStatus: "queued",
    },
  });

  await enqueueLeadNotification(createdLead.id);

  return Response.json({
    ok: true,
    leadId: createdLead.id,
    status: "queued",
  });
}

