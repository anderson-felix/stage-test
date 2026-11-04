import { ServiceBusClient, type ServiceBusReceivedMessage } from "@azure/service-bus";
import { prisma } from "../lib/prisma";
import {
  sendLeadNotificationEmail,
  verifyTenantDomain,
  LEAD_NOTIFICATION_QUEUE,
} from "../lib/email-service";
import { verifyCustomDomain } from "../lib/domains";
import { publishOrScheduleSocialPost } from "../lib/social-oauth";
import { DIMENSOES, novaPagina } from "../lib/render";
import { uploadTenantAsset } from "../lib/storage";
import type { Formato } from "../lib/social";

const AI_RENDER_QUEUE = process.env.AZURE_SERVICE_BUS_RENDER_QUEUE || "slide-renders";

type LeadQueueMessage = {
  type: "LEAD_CAPTURED";
  leadId: string;
  tenantId: string;
};

type SlideRenderQueueMessage = {
  type: "RENDER_SLIDES";
  tenantId: string;
  postId: string;
};

async function processLeadMessage(msg: ServiceBusReceivedMessage) {
  const body = msg.body as LeadQueueMessage;
  if (!body?.leadId) return;
  const res = await sendLeadNotificationEmail(body.leadId);
  console.log(`[worker:lead-notifications] Lead ${body.leadId} processado -> status=${res.status}`);
}

async function processSlideRenderMessage(msg: ServiceBusReceivedMessage) {
  const body = msg.body as SlideRenderQueueMessage;
  if (!body?.postId || !body?.tenantId) return;

  const post = await prisma.socialPost.findFirst({
    where: { id: body.postId, tenantId: body.tenantId },
  });
  if (!post || !post.arteHtml) return;

  const formato: Formato =
    post.format === "post-unico" || post.format === "story" ? post.format : "carrossel";
  const { width, height } = DIMENSOES[formato];

  const page = await novaPagina({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await page.setContent(post.arteHtml, { waitUntil: "networkidle", timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);

    const slides = page.locator(".slide");
    const total = await slides.count();
    const uploadedUrls: string[] = [];

    for (let i = 0; i < total; i++) {
      const buffer = await slides.nth(i).screenshot({ type: "png" });
      const fileName = `${post.id}-slide-${String(i + 1).padStart(2, "0")}.png`;
      const uploaded = await uploadTenantAsset({
        tenantId: post.tenantId,
        category: "generated_slide",
        fileName,
        mimeType: "image/png",
        buffer,
      });
      uploadedUrls.push(`/api/media/${uploaded.id}`);
    }

    await prisma.socialPost.update({
      where: { id: post.id },
      data: { slidesBlobUrls: uploadedUrls },
    });
    console.log(`[worker:slide-renders] Post ${post.id} renderizado (${uploadedUrls.length} slides)`);
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function processScheduledSocialPosts() {
  const duePosts = await prisma.socialPost.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: new Date() },
    },
    include: { pauta: { select: { slug: true } } },
    take: 10,
  });

  for (const post of duePosts) {
    try {
      const platform = post.platform === "linkedin" ? "linkedin" : "instagram";
      await publishOrScheduleSocialPost({
        tenantId: post.tenantId,
        pautaSlug: post.pauta.slug,
        platform,
        scheduledAt: null,
      });
      console.log(`[worker:scheduler] Post agendado ${post.id} publicado com sucesso em ${platform}`);
    } catch (err) {
      console.error(`[worker:scheduler] Falha ao publicar post agendado ${post.id}:`, (err as Error).message);
    }
  }
}

async function processPendingCustomDomains() {
  const pendingDomains = await prisma.customDomain.findMany({
    where: { dnsStatus: "PENDING" },
    take: 10,
  });

  for (const d of pendingDomains) {
    try {
      const res = await verifyCustomDomain(d.tenantId, d.id);
      console.log(`[worker:domains] Domínio ${d.domain} (tenant ${d.tenantId}) verificado: ${res.verified ? "OK" : "Pendente/Falha"}`);
    } catch (err) {
      console.error(`[worker:domains] Falha ao verificar domínio ${d.domain}:`, (err as Error).message);
    }
  }
}

async function processPendingEmailConfigs() {
  const pendingEmails = await prisma.tenantEmailConfig.findMany({
    where: {
      verificationStatus: "PENDING",
      senderDomain: { not: null },
      resendDomainId: { not: null },
    },
    take: 10,
  });

  for (const e of pendingEmails) {
    try {
      await verifyTenantDomain(e.tenantId);
      console.log(`[worker:emails] Configuração de e-mail do tenant ${e.tenantId} verificada.`);
    } catch (err) {
      console.error(`[worker:emails] Falha ao verificar e-mail do tenant ${e.tenantId}:`, (err as Error).message);
    }
  }
}

async function runPeriodicJobs() {
  await Promise.allSettled([
    processScheduledSocialPosts(),
    processPendingCustomDomains(),
    processPendingEmailConfigs(),
  ]);
}

async function main() {
  console.log("[Stage Worker] Inicializando worker de background...");
  const sbConn = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
  let sbClient: ServiceBusClient | null = null;

  if (sbConn) {
    sbClient = new ServiceBusClient(sbConn);

    const leadReceiver = sbClient.createReceiver(LEAD_NOTIFICATION_QUEUE);
    leadReceiver.subscribe({
      processMessage: processLeadMessage,
      processError: async (args) => {
        console.error("[worker:lead-notifications] Erro no Service Bus:", args.error.message);
      },
    });

    const renderReceiver = sbClient.createReceiver(AI_RENDER_QUEUE);
    renderReceiver.subscribe({
      processMessage: processSlideRenderMessage,
      processError: async (args) => {
        console.error("[worker:slide-renders] Erro no Service Bus:", args.error.message);
      },
    });

    console.log(
      `[Stage Worker] Conectado ao Azure Service Bus (filas: ${LEAD_NOTIFICATION_QUEUE}, ${AI_RENDER_QUEUE})`
    );
  } else {
    console.log(
      "[Stage Worker] AZURE_SERVICE_BUS_CONNECTION_STRING ausente — executando em modo scheduler periódico."
    );
  }

  // Executa uma rodada inicial
  void runPeriodicJobs().catch((err) =>
    console.error("[worker:scheduler] Erro na rodada inicial:", (err as Error).message)
  );

  const schedulerTimer = setInterval(() => {
    void runPeriodicJobs().catch((err) =>
      console.error("[worker:scheduler] Erro no ciclo:", (err as Error).message)
    );
  }, 60_000);

  const shutdown = async (signal: string) => {
    console.log(`[Stage Worker] Recebido ${signal}. Encerrando conexões graciosamente...`);
    clearInterval(schedulerTimer);
    if (sbClient) {
      await sbClient.close().catch(() => undefined);
    }
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
