import { randomUUID } from "node:crypto";
import { ServiceBusClient } from "@azure/service-bus";
import { DnsStatus, Prisma } from "@prisma/client";
import prisma from "./prisma";
import { normalizeHostname } from "./redis";

export const LEAD_NOTIFICATION_QUEUE = process.env.AZURE_SERVICE_BUS_LEAD_QUEUE || "lead-notifications";

export type ResendDnsRecord = {
  record: string;
  name: string;
  type: string;
  ttl: string;
  status: string;
  value: string;
  priority?: number;
};

export type TenantEmailConfigWithDiagnostics = {
  tenantId: string;
  senderDomain: string | null;
  senderEmail: string | null;
  senderName: string | null;
  leadDestinationEmails: string[];
  resendDomainId: string | null;
  dnsRecords: ResendDnsRecord[];
  verificationStatus: DnsStatus;
  useStageFallback: boolean;
  updatedAt: string;
  resendConfigured: boolean;
  diagnosticMessage?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseDnsRecords(json: Prisma.JsonValue | null): ResendDnsRecord[] {
  if (!json || !Array.isArray(json)) return [];
  return json.filter((r): r is ResendDnsRecord => Boolean(r && typeof r === "object"));
}

function serializeEmailConfig(
  row: {
    tenantId: string;
    senderDomain: string | null;
    senderEmail: string | null;
    senderName: string | null;
    leadDestinationEmails: string[];
    resendDomainId: string | null;
    dnsRecordsJson: Prisma.JsonValue | null;
    verificationStatus: DnsStatus;
    useStageFallback: boolean;
    updatedAt: Date;
  },
  diagnosticMessage?: string
): TenantEmailConfigWithDiagnostics {
  return {
    tenantId: row.tenantId,
    senderDomain: row.senderDomain,
    senderEmail: row.senderEmail,
    senderName: row.senderName,
    leadDestinationEmails: row.leadDestinationEmails,
    resendDomainId: row.resendDomainId,
    dnsRecords: parseDnsRecords(row.dnsRecordsJson),
    verificationStatus: row.verificationStatus,
    useStageFallback: row.useStageFallback,
    updatedAt: row.updatedAt.toISOString(),
    resendConfigured: Boolean(process.env.RESEND_MASTER_API_KEY),
    diagnosticMessage,
  };
}

export async function getTenantEmailConfig(
  tenantId: string
): Promise<TenantEmailConfigWithDiagnostics> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const row = await prisma.tenantEmailConfig.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      senderName: tenant?.name || "Equipe Comercial",
      senderEmail: "leads@stage.consult",
      leadDestinationEmails: [],
      verificationStatus: DnsStatus.PENDING,
      useStageFallback: true,
    },
  });

  if (row) {
    // garante tipo
  }
  const hasFallbackIdentity = Boolean(
    process.env.STAGE_FALLBACK_FROM_EMAIL &&
      EMAIL_REGEX.test(process.env.STAGE_FALLBACK_FROM_EMAIL.trim())
  );
  return serializeEmailConfig(
    row,
    hasFallbackIdentity
      ? undefined
      : "Configure e verifique seu domínio de remetente (SPF/DKIM na Resend) para enviar notificações de leads."
  );
}

export async function updateTenantEmailPreferences(
  tenantId: string,
  params: {
    senderEmail?: string;
    senderName?: string;
    leadDestinationEmails?: string[];
    useStageFallback?: boolean;
  }
): Promise<TenantEmailConfigWithDiagnostics> {
  const current = await getTenantEmailConfig(tenantId);

  let cleanDestinations = current.leadDestinationEmails;
  if (params.leadDestinationEmails !== undefined) {
    cleanDestinations = params.leadDestinationEmails
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    for (const email of cleanDestinations) {
      if (!EMAIL_REGEX.test(email)) {
        throw new Error(`E-mail de destino inválido: ${email}`);
      }
    }
  }

  let senderEmail = current.senderEmail;
  if (params.senderEmail !== undefined) {
    const trimmed = params.senderEmail.trim().toLowerCase();
    if (trimmed && !EMAIL_REGEX.test(trimmed)) {
      throw new Error("E-mail do remetente inválido");
    }
    senderEmail = trimmed || null;
  }

  const updated = await prisma.tenantEmailConfig.update({
    where: { tenantId },
    data: {
      ...(params.senderName !== undefined ? { senderName: params.senderName.trim() || null } : {}),
      senderEmail,
      leadDestinationEmails: cleanDestinations,
      ...(params.useStageFallback !== undefined
        ? { useStageFallback: params.useStageFallback }
        : {}),
    },
  });

  return serializeEmailConfig(updated);
}

/**
 * Registra o domínio de envio do tenant na API da Resend (POST https://api.resend.com/domains)
 * e armazena `resendDomainId` e `dnsRecordsJson` (SPF / DKIM / MX) em `TenantEmailConfig`.
 */
export async function registerTenantDomain(
  tenantId: string,
  params: {
    senderDomain: string;
    senderEmail?: string;
    senderName?: string;
    leadDestinationEmails?: string[];
  }
): Promise<TenantEmailConfigWithDiagnostics> {
  const cleanDomain = normalizeHostname(params.senderDomain);
  if (!cleanDomain || !cleanDomain.includes(".")) {
    throw new Error("Informe um domínio de e-mail válido (ex.: suaempresa.com.br)");
  }

  if (params.leadDestinationEmails) {
    await updateTenantEmailPreferences(tenantId, {
      leadDestinationEmails: params.leadDestinationEmails,
      senderName: params.senderName,
      senderEmail: params.senderEmail,
    });
  }

  const resendApiKey = process.env.RESEND_MASTER_API_KEY;
  if (!resendApiKey) {
    const fallbackRecords: ResendDnsRecord[] = [
      {
        record: "SPF",
        name: `send.${cleanDomain}`,
        type: "MX",
        ttl: "Auto",
        status: "not_started",
        value: "feedback-smtp.us-east-1.amazonses.com",
        priority: 10,
      },
      {
        record: "SPF",
        name: `send.${cleanDomain}`,
        type: "TXT",
        ttl: "Auto",
        status: "not_started",
        value: "v=spf1 include:amazonses.com ~all",
      },
      {
        record: "DKIM",
        name: `resend._domainkey.${cleanDomain}`,
        type: "TXT",
        ttl: "Auto",
        status: "not_started",
        value: "p=AGUARDANDO_RESEND_MASTER_API_KEY_NO_SERVIDOR",
      },
    ];

    const updated = await prisma.tenantEmailConfig.upsert({
      where: { tenantId },
      update: {
        senderDomain: cleanDomain,
        senderEmail: params.senderEmail?.trim().toLowerCase() || `contato@${cleanDomain}`,
        ...(params.senderName ? { senderName: params.senderName.trim() } : {}),
        dnsRecordsJson: fallbackRecords as unknown as Prisma.InputJsonValue,
        verificationStatus: DnsStatus.PENDING,
        useStageFallback: true,
      },
      create: {
        tenantId,
        senderDomain: cleanDomain,
        senderEmail: params.senderEmail?.trim().toLowerCase() || `contato@${cleanDomain}`,
        senderName: params.senderName?.trim() || cleanDomain,
        leadDestinationEmails: params.leadDestinationEmails ?? [],
        dnsRecordsJson: fallbackRecords as unknown as Prisma.InputJsonValue,
        verificationStatus: DnsStatus.PENDING,
        useStageFallback: true,
      },
    });

    return serializeEmailConfig(
      updated,
      "Domínio de remetente salvo (SPF/DKIM de e-mail, independente dos registros A/TXT da LP). Configure RESEND_MASTER_API_KEY no servidor para provisionar chaves DKIM reais na Resend."
    );
  }

  const res = await fetch("https://api.resend.com/domains", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: cleanDomain }),
    signal: AbortSignal.timeout(15000),
  });

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    records?: ResendDnsRecord[];
    message?: string;
  };

  if (!res.ok || !data.id) {
    throw new Error(data.message || `Erro ao cadastrar domínio na Resend (HTTP ${res.status})`);
  }

  const updated = await prisma.tenantEmailConfig.upsert({
    where: { tenantId },
    update: {
      senderDomain: cleanDomain,
      senderEmail: params.senderEmail?.trim().toLowerCase() || `contato@${cleanDomain}`,
      ...(params.senderName ? { senderName: params.senderName.trim() } : {}),
      resendDomainId: data.id,
      dnsRecordsJson: (data.records ?? []) as unknown as Prisma.InputJsonValue,
      verificationStatus: DnsStatus.PENDING,
    },
    create: {
      tenantId,
      senderDomain: cleanDomain,
      senderEmail: params.senderEmail?.trim().toLowerCase() || `contato@${cleanDomain}`,
      senderName: params.senderName?.trim() || cleanDomain,
      leadDestinationEmails: params.leadDestinationEmails ?? [],
      resendDomainId: data.id,
      dnsRecordsJson: (data.records ?? []) as unknown as Prisma.InputJsonValue,
      verificationStatus: DnsStatus.PENDING,
      useStageFallback: true,
    },
  });

  return serializeEmailConfig(
    updated,
    "Domínio registrado na Resend! Adicione os registros SPF e DKIM abaixo no seu DNS e clique em Verificar."
  );
}

/**
 * Solicita verificação DNS na Resend (POST /domains/{id}/verify + GET /domains/{id})
 * e atualiza `verificationStatus` no banco.
 */
export async function verifyTenantDomain(
  tenantId: string
): Promise<TenantEmailConfigWithDiagnostics> {
  const row = await prisma.tenantEmailConfig.findUnique({ where: { tenantId } });
  if (!row || !row.senderDomain) {
    throw new Error("Cadastre um domínio de remetente antes de verificar");
  }

  const resendApiKey = process.env.RESEND_MASTER_API_KEY;
  if (!resendApiKey || !row.resendDomainId) {
    return serializeEmailConfig(
      row,
      "Verificação DNS de remetente (SPF/DKIM) na Resend requer RESEND_MASTER_API_KEY configurada no ambiente."
    );
  }

  await fetch(`https://api.resend.com/domains/${encodeURIComponent(row.resendDomainId)}/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}` },
    signal: AbortSignal.timeout(10000),
  }).catch(() => undefined);

  const getRes = await fetch(
    `https://api.resend.com/domains/${encodeURIComponent(row.resendDomainId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${resendApiKey}` },
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!getRes.ok) {
    throw new Error(`Falha ao consultar status do domínio na Resend (HTTP ${getRes.status})`);
  }

  const domainData = (await getRes.json()) as {
    status?: string;
    records?: ResendDnsRecord[];
  };

  const rawStatus = (domainData.status || "").toLowerCase();
  let verificationStatus: DnsStatus = DnsStatus.PENDING;
  if (rawStatus === "verified") {
    verificationStatus = DnsStatus.VERIFIED;
  } else if (rawStatus === "failed" || rawStatus === "temporary_failure") {
    verificationStatus = DnsStatus.FAILED;
  }

  const updated = await prisma.tenantEmailConfig.update({
    where: { tenantId },
    data: {
      verificationStatus,
      dnsRecordsJson: (domainData.records ?? row.dnsRecordsJson ?? []) as Prisma.InputJsonValue,
      useStageFallback: verificationStatus !== DnsStatus.VERIFIED,
    },
  });

  const msg =
    verificationStatus === DnsStatus.VERIFIED
      ? "Domínio verificado com sucesso! Os e-mails de leads agora saem com o seu próprio remetente."
      : `Status na Resend: ${domainData.status || "pending"}. Aguarde a propagação DNS (SPF/DKIM) e tente novamente.`;

  return serializeEmailConfig(updated, msg);
}

function formatLeadHtmlEmail(params: {
  lpTitle: string;
  lpSlug: string;
  tenantName: string;
  payload: Record<string, unknown>;
  utmData: Record<string, unknown>;
  createdAt: Date;
  usedFallback: boolean;
}): string {
  const rowsHtml = Object.entries(params.payload)
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;font-weight:600;color:#333;width:35%;">${k}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;color:#111;">${String(v ?? "")}</td>
      </tr>`
    )
    .join("");

  const utmEntries = Object.entries(params.utmData).filter(([, v]) => Boolean(v));
  const utmHtml =
    utmEntries.length > 0
      ? `<h3 style="margin-top:24px;font-size:14px;color:#555;">Origem / UTMs</h3>
         <table style="width:100%;border-collapse:collapse;font-size:13px;">
           ${utmEntries
             .map(
               ([k, v]) => `
             <tr>
               <td style="padding:6px 12px;border-bottom:1px solid #eee;color:#666;width:35%;">${k}</td>
               <td style="padding:6px 12px;border-bottom:1px solid #eee;color:#222;">${String(v)}</td>
             </tr>`
             )
             .join("")}
         </table>`
      : "";

  return `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#b08d28;font-weight:700;">
      ${params.tenantName} · Novo Lead Capturado
    </div>
    <h2 style="margin:8px 0 4px;font-size:20px;color:#111;">${params.lpTitle}</h2>
    <p style="margin:0 0 20px;font-size:13px;color:#666;">
      Página: <code>/${params.lpSlug}</code> · Data: ${params.createdAt.toLocaleString("pt-BR")}
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${rowsHtml}
    </table>
    ${utmHtml}
    ${
      params.usedFallback
        ? `<p style="margin-top:24px;font-size:11px;color:#888;border-top:1px solid #eee;padding-top:12px;">
             Enviado via infraestrutura segura Stage (<code>leads@stage.consult</code>). Para enviar com seu próprio domínio, conclua a verificação SPF/DKIM em Conta &gt; E-mail.
           </p>`
        : ""
    }
  </div>`;
}

export type LeadEmailTransportPayload = {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  html: string;
};

export type LeadEmailTransport = (
  payload: LeadEmailTransportPayload,
  apiKey: string,
  idempotencyKey: string
) => Promise<{ ok: boolean; status: number; errorMessage?: string; errorCode?: string; providerId?: string }>;

function isSenderDomainMatched(senderEmail: string, senderDomain: string | null | undefined): boolean {
  if (!senderDomain) return false;
  const emailDomain = senderEmail.split("@")[1]?.trim().toLowerCase() || "";
  const cleanSenderDomain = normalizeHostname(senderDomain);
  if (!emailDomain || !cleanSenderDomain) return false;
  return emailDomain === cleanSenderDomain || emailDomain.endsWith(`.${cleanSenderDomain}`);
}

/**
 * Envia o e-mail de notificação de um lead capturado com validação estrita de configuração
 * (Resend, destinatários e remetente autorizado), idempotência e retentativa controlada.
 * Falhas de e-mail nunca apagam o lead nem produzem sucesso falso.
 */
export async function sendLeadNotificationEmail(
  leadId: string,
  options?: {
    now?: Date;
    transport?: LeadEmailTransport;
    env?: NodeJS.ProcessEnv;
  }
): Promise<{
  status: "sent_custom" | "sent_fallback" | "already_sent" | "failed" | "skipped_no_recipients" | "queued" | "processing" | "retry_scheduled" | "config_pending" | "failed_final" | "ambiguous";
  detail?: string;
}> {
  const env = options?.env ?? process.env;
  const lead = await prisma.lpLead.findUnique({
    where: { id: leadId },
    include: {
      landingPage: true,
      tenant: {
        include: {
          emailConfig: true,
          members: {
            include: { user: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!lead) {
    throw new Error(`Lead ${leadId} não encontrado`);
  }

  // Idempotência: nunca reenvia lead já entregue
  if (
    lead.emailDeliveryStatus === "sent_custom" ||
    lead.emailDeliveryStatus === "sent_fallback"
  ) {
    return { status: "already_sent", detail: "Notificação já enviada anteriormente." };
  }

  const now = options?.now ?? new Date();
  const owner = randomUUID();
  // Final abandoned attempt cannot be claimed indefinitely.
  await prisma.lpLead.updateMany({
    where: { id: lead.id, emailDeliveryStatus: "sending", emailLeaseUntil: { lte: now }, emailAttemptCount: { gte: 8 } },
    data: { emailDeliveryStatus: "ambiguous", emailLastError: "ATTEMPTS_EXHAUSTED_RECONCILE", emailLeaseOwner: null, emailLeaseUntil: null },
  });
  const claimed = await prisma.lpLead.updateMany({
    where: { id: lead.id, emailAttemptCount: { lt: 8 },
      OR: [
        { emailDeliveryStatus: { in: ["queued", "retry_scheduled"] },
          OR: [{ emailNextAttemptAt: null }, { emailNextAttemptAt: { lte: now } }] },
        { emailDeliveryStatus: "sending", emailLeaseUntil: { lte: now } },
      ] },
    data: { emailDeliveryStatus: "sending", emailLeaseOwner: owner,
      emailLeaseUntil: new Date(now.getTime() + 60000), emailAttemptCount: { increment: 1 } },
  });
  if (!claimed.count) {
    const current = await prisma.lpLead.findUnique({ where: { id: lead.id }, select: { emailDeliveryStatus: true } });
    const status = current?.emailDeliveryStatus;
    if (status === "sent_custom" || status === "sent_fallback") return { status: "already_sent" };
    if (status === "config_pending" || status === "failed_final" || status === "ambiguous" || status === "retry_scheduled") return { status };
    if (status === "queued") return { status: "queued" };
    if (status === "sending") return { status: "processing", detail: "Lease pertence a outra execução." };
    return { status: "failed_final", detail: "Estado legado ou não reconhecido exige revisão operacional." };
  }
  const finish = async (status: string, error?: string, retryAt?: Date, providerId?: string) => {
    const result = await prisma.lpLead.updateMany({
      where: { id: lead.id, emailLeaseOwner: owner, emailLeaseUntil: { gt: options?.now ?? new Date() } },
      data: { emailDeliveryStatus: status, emailLeaseOwner: null, emailLeaseUntil: null,
        emailNextAttemptAt: retryAt ?? null, emailLastError: error ?? null, ...(providerId ? { emailProviderId: providerId } : {}) },
    });
    return result.count > 0;
  };

  // Resend retains keys for 24h; stop at 23h, leaving margin for request duration.
  if (lead.emailFirstAttemptAt && now.getTime() - lead.emailFirstAttemptAt.getTime() >= 23 * 3600000) {
    await finish("ambiguous", "IDEMPOTENCY_WINDOW_EXPIRED_RECONCILE");
    return { status: "ambiguous" };
  }
  const emailCfg = lead.tenant.emailConfig;
  let recipients = emailCfg?.leadDestinationEmails?.filter((e) => EMAIL_REGEX.test(e)) ?? [];
  if (recipients.length === 0) {
    const ownerEmail = lead.tenant.members[0]?.user.email;
    if (ownerEmail && EMAIL_REGEX.test(ownerEmail)) {
      recipients = [ownerEmail];
    }
  }

  if (recipients.length === 0) {
    await finish("config_pending", "EMAIL_CONFIGURATION_REQUIRED");
    return { status: "config_pending", detail: "Sem destinatários configurados" };
  }

  const useCustomSender = Boolean(
    emailCfg &&
      emailCfg.verificationStatus === DnsStatus.VERIFIED &&
      emailCfg.useStageFallback === false &&
      emailCfg.senderEmail &&
      EMAIL_REGEX.test(emailCfg.senderEmail) &&
      isSenderDomainMatched(emailCfg.senderEmail, emailCfg.senderDomain)
  );

  const configuredFallbackFrom = env.STAGE_FALLBACK_FROM_EMAIL?.trim().toLowerCase() || "";
  const hasAuthorizedFallback =
    Boolean(configuredFallbackFrom) && EMAIL_REGEX.test(configuredFallbackFrom);

  if (!useCustomSender && !hasAuthorizedFallback) {
    await finish("config_pending", "EMAIL_CONFIGURATION_REQUIRED");
    return {
      status: "config_pending",
      detail:
        "Remetente não autorizado: verifique o domínio de e-mail da empresa (SPF/DKIM na Resend) ou configure STAGE_FALLBACK_FROM_EMAIL válido.",
    };
  }

  const senderName = emailCfg?.senderName || lead.tenant.name || "Stage Consulting";
  const fromAddress = useCustomSender
    ? `${senderName} <${emailCfg!.senderEmail!}>`
    : `${senderName} via Stage <${configuredFallbackFrom}>`;

  const payloadObj =
    lead.payload && typeof lead.payload === "object" && !Array.isArray(lead.payload)
      ? (lead.payload as Record<string, unknown>)
      : {};
  const utmObj =
    lead.utmData && typeof lead.utmData === "object" && !Array.isArray(lead.utmData)
      ? (lead.utmData as Record<string, unknown>)
      : {};

  // Extrai possível e-mail do próprio lead para Reply-To
  let replyTo: string | undefined;
  for (const [k, v] of Object.entries(payloadObj)) {
    if (
      /email|e-mail/i.test(k) &&
      typeof v === "string" &&
      EMAIL_REGEX.test(v.trim())
    ) {
      replyTo = v.trim();
      break;
    }
  }
  if (!replyTo && emailCfg?.senderEmail && EMAIL_REGEX.test(emailCfg.senderEmail)) {
    replyTo = emailCfg.senderEmail;
  }

  const subject = `[Novo Lead - ${lead.landingPage.title}] ${lead.tenant.name}`;
  const htmlBody = formatLeadHtmlEmail({
    lpTitle: lead.landingPage.title,
    lpSlug: lead.landingPage.slug,
    tenantName: lead.tenant.name,
    payload: payloadObj,
    utmData: utmObj,
    createdAt: lead.createdAt,
    usedFallback: !useCustomSender,
  });

  const resendApiKey = env.RESEND_MASTER_API_KEY?.trim() || "";
  if (!resendApiKey && !options?.transport) {
    await finish("config_pending", "EMAIL_CONFIGURATION_REQUIRED");
    return {
      status: "config_pending",
      detail: "RESEND_MASTER_API_KEY não configurada no servidor.",
    };
  }

  const sendEmail: LeadEmailTransport =
    options?.transport ??
    (async (emailPayload, apiKey, idempotencyKey) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(emailPayload),
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const data = await res.json() as { id?: string };
        return { ok: true, status: res.status, providerId: data.id };
      }
      const errData = (await res.json().catch(() => ({}))) as { message?: string; name?: string };
      return {
        ok: false,
        errorCode: errData.name,
        status: res.status,
        errorMessage: errData.message || `HTTP ${res.status}`,
      };
    });

  const frozen = lead.emailPayload as { payload: LeadEmailTransportPayload; deliveryStatus: "sent_custom" | "sent_fallback" } | null;
  const envelope = frozen ?? { payload: { from: fromAddress, to: recipients, ...(replyTo ? { reply_to: replyTo } : {}), subject, html: htmlBody }, deliveryStatus: useCustomSender ? "sent_custom" as const : "sent_fallback" as const };
  const prepared = await prisma.lpLead.updateMany({
    where: { id: lead.id, emailLeaseOwner: owner, emailLeaseUntil: { gt: options?.now ?? new Date() } },
    data: { emailPayload: envelope as unknown as Prisma.InputJsonValue, emailFirstAttemptAt: lead.emailFirstAttemptAt ?? now },
  });
  if (!prepared.count) return { status: "processing" };
  const key = 'lead-notification/' + lead.id;
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      sendEmail(envelope.payload, resendApiKey, key),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("PROVIDER_TIMEOUT")), 15000); }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    if (result.ok) {
      const status = envelope.deliveryStatus;
      return await finish(status, undefined, undefined, result.providerId) ? { status } : { status: "processing" };
    }
    const retryable = result.status === 429 || result.status >= 500 || (result.status === 409 && result.errorCode === "concurrent_idempotent_requests");
    const attempt = (lead.emailAttemptCount ?? 0) + 1;
    const status = retryable && attempt < 8 ? "retry_scheduled" : "failed_final";
    await finish(status, 'PROVIDER_HTTP_' + result.status,
      status === "retry_scheduled" ? new Date(now.getTime() + Math.min(3600000, 30000 * 2 ** (attempt - 1))) : undefined);
    return { status };
  } catch {
    const attempt = (lead.emailAttemptCount ?? 0) + 1;
    const status = attempt < 8 ? "retry_scheduled" : "ambiguous";
    await finish(status, "PROVIDER_RESULT_UNKNOWN",
      status === "retry_scheduled" ? new Date(now.getTime() + Math.min(3600000, 30000 * 2 ** (attempt - 1))) : undefined);
    return { status };
  }
}

/** Reprocessamento administrativo após corrigir configuração/reconciliar o provedor. */
export async function requeueLeadNotification(
  leadId: string, acknowledgePossibleDuplicate = false, options?: { tenantId?: string; now?: Date }
): Promise<boolean> {
  const cutoff = new Date((options?.now ?? new Date()).getTime() - 23 * 3600000);
  const result = await prisma.lpLead.updateMany({
    where: { id: leadId, emailDeliveryStatus: { in: acknowledgePossibleDuplicate ? ["config_pending", "failed_final", "ambiguous"] : ["config_pending"] },
      ...(options?.tenantId ? { tenantId: options.tenantId } : {}),
      ...(!acknowledgePossibleDuplicate ? { emailAttemptCount: { lt: 8 },
        OR: [{ emailFirstAttemptAt: null }, { emailFirstAttemptAt: { gt: cutoff } }] } : {}) },
    data: { emailDeliveryStatus: "queued", emailNextAttemptAt: null, emailLastError: null,
      ...(acknowledgePossibleDuplicate ? { emailFirstAttemptAt: null, emailAttemptCount: 0 } : {}) },
  });
  return result.count === 1;
}

/** Tenant-scoped recovery. It never authorizes a blind resend of uncertain/final work. */
export async function recoverLeadNotification(
  leadId: string, tenantId: string, options?: Parameters<typeof sendLeadNotificationEmail>[1]
): Promise<Awaited<ReturnType<typeof sendLeadNotificationEmail>> | null> {
  const lead = await prisma.lpLead.findFirst({ where: { id: leadId, tenantId } });
  if (!lead) return null;
  if (lead.emailDeliveryStatus === "config_pending") {
    const now = options?.now ?? new Date();
    const cutoff = new Date(now.getTime() - 23 * 3600000);
    await prisma.lpLead.updateMany({
      where: { id: leadId, tenantId, emailDeliveryStatus: "config_pending", emailFirstAttemptAt: { lte: cutoff } },
      data: { emailDeliveryStatus: "ambiguous", emailLastError: "IDEMPOTENCY_WINDOW_EXPIRED_RECONCILE" },
    });
    await prisma.lpLead.updateMany({
      where: { id: leadId, tenantId, emailDeliveryStatus: "config_pending", emailAttemptCount: { gte: 8 } },
      data: { emailDeliveryStatus: "failed_final", emailLastError: "ATTEMPTS_EXHAUSTED_REVIEW_REQUIRED" },
    });
    await requeueLeadNotification(leadId, false, { tenantId, now });
  }
  return sendLeadNotificationEmail(leadId, options);
}

/**
 * Enfileira a sinalização do lead no Azure Service Bus (`lead-notifications`) quando configurado.
 * O registro durável no PostgreSQL (`emailDeliveryStatus: "queued"`) é preservado;
 * falha no Service Bus não impede a captura e permite processamento pelo polling do worker.
 */
export async function enqueueLeadNotification(leadId: string): Promise<void> {
  const sbConn = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
  if (sbConn) {
    let sbClient: ServiceBusClient | undefined;
    let sender: ReturnType<ServiceBusClient["createSender"]> | undefined;
    try {
      sbClient = new ServiceBusClient(sbConn);
      sender = sbClient.createSender(LEAD_NOTIFICATION_QUEUE);
      await sender.sendMessages({
        body: {
          type: "lead-notification",
          leadId,
          enqueuedAt: new Date().toISOString(),
        },
        contentType: "application/json",
      });
      return;
    } catch (err) {
      console.warn(
        `[LeadNotification] Falha ao sinalizar Service Bus para lead ${leadId} (mantido em fila durável no PostgreSQL):`,
        (err as Error).message
      );
      return;
    } finally {
      await sender?.close().catch(() => undefined);
      await sbClient?.close().catch(() => undefined);
    }
  }

  // Sem Service Bus: dispara tentativa assíncrona local; se falhar/reiniciar, o polling do worker retoma
  void sendLeadNotificationEmail(leadId).catch((err) => {
    console.warn("[LeadNotification] Falha no envio local assíncrono:", err);
  });
}

