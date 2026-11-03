import { ServiceBusClient } from "@azure/service-bus";
import { DnsStatus, Prisma } from "@prisma/client";
import prisma from "./prisma";
import { normalizeHostname } from "./redis";

export const LEAD_NOTIFICATION_QUEUE = "lead-notifications";

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

  return serializeEmailConfig(row);
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
      "Domínio salvo. Configure RESEND_MASTER_API_KEY no servidor para provisionar chaves DKIM reais na Resend. Enquanto isso, seus leads serão entregues pelo remetente seguro leads@stage.consult."
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
      "Verificação DNS na Resend requer RESEND_MASTER_API_KEY configurada no ambiente. O fallback leads@stage.consult permanece ativo."
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

/**
 * Envia o e-mail de notificação de um lead capturado com lógica de fallback automática
 * e retentativa controlada.
 */
export async function sendLeadNotificationEmail(leadId: string): Promise<{
  status: "sent_custom" | "sent_fallback" | "failed" | "skipped_no_recipients";
  detail?: string;
}> {
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

  const emailCfg = lead.tenant.emailConfig;
  let recipients = emailCfg?.leadDestinationEmails?.filter((e) => EMAIL_REGEX.test(e)) ?? [];
  if (recipients.length === 0) {
    const ownerEmail = lead.tenant.members[0]?.user.email;
    if (ownerEmail && EMAIL_REGEX.test(ownerEmail)) {
      recipients = [ownerEmail];
    }
  }

  if (recipients.length === 0) {
    await prisma.lpLead.update({
      where: { id: lead.id },
      data: { emailDeliveryStatus: "failed" },
    });
    return { status: "skipped_no_recipients", detail: "Sem destinatários configurados" };
  }

  const useCustomSender =
    emailCfg &&
    emailCfg.verificationStatus === DnsStatus.VERIFIED &&
    emailCfg.useStageFallback === false &&
    Boolean(emailCfg.senderEmail && EMAIL_REGEX.test(emailCfg.senderEmail));

  const senderName = emailCfg?.senderName || lead.tenant.name || "Stage Consulting";
  const fromAddress = useCustomSender
    ? `${senderName} <${emailCfg!.senderEmail!}>`
    : `${senderName} via Stage <${process.env.STAGE_FALLBACK_FROM_EMAIL || "leads@stage.consult"}>`;

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

  const resendApiKey = process.env.RESEND_MASTER_API_KEY;
  if (!resendApiKey) {
    const statusTarget = useCustomSender ? "sent_custom" : "sent_fallback";
    await prisma.lpLead.update({
      where: { id: lead.id },
      data: { emailDeliveryStatus: statusTarget },
    });
    return {
      status: statusTarget,
      detail:
        "Simulado localmente (RESEND_MASTER_API_KEY ausente no ambiente de desenvolvimento).",
    };
  }

  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: recipients,
          ...(replyTo ? { reply_to: replyTo } : {}),
          subject,
          html: htmlBody,
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        const deliveryStatus = useCustomSender ? "sent_custom" : "sent_fallback";
        await prisma.lpLead.update({
          where: { id: lead.id },
          data: { emailDeliveryStatus: deliveryStatus },
        });
        return { status: deliveryStatus };
      }

      const errData = (await res.json().catch(() => ({}))) as { message?: string };
      lastError = errData.message || `HTTP ${res.status}`;
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = (err as Error).message;
    }
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }

  await prisma.lpLead.update({
    where: { id: lead.id },
    data: { emailDeliveryStatus: "failed" },
  });
  return { status: "failed", detail: lastError };
}

/**
 * Enfileira o processamento da notificação do lead no Azure Service Bus (`lead-notifications`)
 * ou processa assincronamente em background no ambiente local quando a fila não está configurada.
 */
export async function enqueueLeadNotification(leadId: string): Promise<void> {
  const sbConn = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
  if (sbConn) {
    const sbClient = new ServiceBusClient(sbConn);
    const sender = sbClient.createSender(LEAD_NOTIFICATION_QUEUE);
    try {
      await sender.sendMessages({
        body: {
          type: "lead-notification",
          leadId,
          enqueuedAt: new Date().toISOString(),
        },
        contentType: "application/json",
      });
      return;
    } finally {
      await sender.close().catch(() => undefined);
      await sbClient.close().catch(() => undefined);
    }
  }

  // Fallback assíncrono em desenvolvimento quando AZURE_SERVICE_BUS_CONNECTION_STRING não está definido
  void sendLeadNotificationEmail(leadId).catch((err) => {
    console.warn("[LeadNotification] Falha no envio local assíncrono:", err);
  });
}

