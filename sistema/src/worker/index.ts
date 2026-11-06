import { ServiceBusClient, type ServiceBusReceivedMessage } from "@azure/service-bus";
import { prisma } from "../lib/prisma";
import {
  sendLeadNotificationEmail,
  verifyTenantDomain,
  LEAD_NOTIFICATION_QUEUE,
} from "../lib/email-service";
import { verifyCustomDomain } from "../lib/domains";
import {
  publishToInstagram,
  publishToLinkedIn,
  ensureValidSocialToken,
} from "../lib/social-oauth";
import { renderSocialPostHtmlToBlobs } from "../lib/render";

const AI_RENDER_QUEUE = process.env.AZURE_SERVICE_BUS_RENDER_QUEUE || "slide-renders";
const SOCIAL_PUBLISH_QUEUE = process.env.AZURE_SERVICE_BUS_SOCIAL_QUEUE || "social-publish";

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

type SocialPublishQueueMessage = {
  type: "SOCIAL_PUBLISH";
  tenantId: string;
  postId: string;
  platform?: "instagram" | "linkedin";
  baseUrl?: string;
};

function getPublicBaseUrl(customBase?: string): string {
  return (
    customBase ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.SITE_URL ||
    "https://stage.consulting"
  ).replace(/\/+$/, "");
}

function toAbsoluteUrl(u: string, baseUrl: string): string {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `${baseUrl}${u.startsWith("/") ? "" : "/"}${u}`;
}

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

  // Invoca renderSocialPostHtmlToBlobs passando tenantId para injeção da logo e ativos via resolveHtmlBrandAssets
  const uploadedUrls = await renderSocialPostHtmlToBlobs(
    body.tenantId,
    body.postId,
    post.arteHtml,
    post.format
  );

  console.log(
    `[worker:slide-renders] Post ${post.id} renderizado com sucesso (${uploadedUrls.length} slides) para tenant ${body.tenantId}`
  );
}

async function processSocialPublishMessage(msg: ServiceBusReceivedMessage) {
  const body = msg.body as SocialPublishQueueMessage;
  if (!body?.postId || !body?.tenantId) return;

  const post = await prisma.socialPost.findFirst({
    where: { id: body.postId, tenantId: body.tenantId },
    include: { pauta: true },
  });
  if (!post) {
    console.error(`[worker:social-publish] Post ${body.postId} não encontrado para tenant ${body.tenantId}`);
    return;
  }

  const platform = (body.platform || (post.platform === "linkedin" ? "linkedin" : "instagram")) as
    | "instagram"
    | "linkedin";

  // Converte URLs relativas em slidesBlobUrls (ex: /api/media/[id]) em URLs públicas absolutas
  const baseUrl = getPublicBaseUrl(body.baseUrl);
  const rawSlides = Array.isArray(post.slidesBlobUrls) ? (post.slidesBlobUrls as string[]) : [];
  const absoluteSlides = rawSlides.map((u) => toAbsoluteUrl(u, baseUrl)).filter(Boolean);

  const account = await prisma.socialAccount.findUnique({
    where: { tenantId_platform: { tenantId: body.tenantId, platform } },
  });
  if (!account?.accessTokenEnc) {
    throw new Error(`Conta de ${platform} não conectada para tenant ${body.tenantId}`);
  }

  const { accessToken, handleOrPageId } = await ensureValidSocialToken(account.id);
  const caption = (post.captionMarkdown || post.scriptMarkdown || post.pauta?.title || "").trim();

  let res: { externalPostId: string; publishedUrl?: string };
  if (platform === "instagram") {
    res = await publishToInstagram({
      handleOrPageId,
      accessToken,
      caption,
      slidesUrls: absoluteSlides,
    });
  } else {
    res = await publishToLinkedIn({
      handleOrPageId,
      accessToken,
      caption,
      slidesUrls: absoluteSlides,
    });
  }

  const publishedAt = new Date();
  await prisma.socialPost.update({
    where: { id: post.id },
    data: {
      status: "PUBLISHED",
      publishedAt,
      externalPostId: res.externalPostId,
      metricsJson: {
        ...(typeof post.metricsJson === "object" && post.metricsJson
          ? (post.metricsJson as Record<string, unknown>)
          : {}),
        publishedUrl: res.publishedUrl,
        externalPostId: res.externalPostId,
      },
    },
  });

  if (post.pautaId) {
    await prisma.socialPauta.update({
      where: { id: post.pautaId },
      data: { status: "PUBLISHED" },
    });
  }

  console.log(
    `[worker:social-publish] Post ${post.id} publicado via fila em ${platform} (ID: ${res.externalPostId}, URL: ${res.publishedUrl})`
  );
}

async function processScheduledSocialPosts() {
  const duePosts = await prisma.socialPost.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: new Date() },
    },
    include: { pauta: true },
    take: 10,
  });

  if (duePosts.length === 0) return;

  const baseUrl = getPublicBaseUrl();

  for (const post of duePosts) {
    try {
      const platform = (post.platform === "linkedin" ? "linkedin" : "instagram") as
        | "instagram"
        | "linkedin";

      // Converte URLs relativas em slidesBlobUrls em URLs públicas absolutas prefixadas por NEXT_PUBLIC_APP_URL
      const rawSlides = Array.isArray(post.slidesBlobUrls) ? (post.slidesBlobUrls as string[]) : [];
      const absoluteSlides = rawSlides.map((u) => toAbsoluteUrl(u, baseUrl)).filter(Boolean);

      const account = await prisma.socialAccount.findUnique({
        where: { tenantId_platform: { tenantId: post.tenantId, platform } },
      });
      if (!account?.accessTokenEnc) {
        console.warn(
          `[worker:scheduler] Conta ${platform} não conectada para tenant ${post.tenantId}. Pulando post ${post.id}.`
        );
        continue;
      }

      const { accessToken, handleOrPageId } = await ensureValidSocialToken(account.id);
      const caption = (post.captionMarkdown || post.scriptMarkdown || post.pauta?.title || "").trim();

      let res: { externalPostId: string; publishedUrl?: string };
      if (platform === "instagram") {
        res = await publishToInstagram({
          handleOrPageId,
          accessToken,
          caption,
          slidesUrls: absoluteSlides,
        });
      } else {
        res = await publishToLinkedIn({
          handleOrPageId,
          accessToken,
          caption,
          slidesUrls: absoluteSlides,
        });
      }

      const publishedAt = new Date();
      await prisma.socialPost.update({
        where: { id: post.id },
        data: {
          status: "PUBLISHED",
          publishedAt,
          externalPostId: res.externalPostId,
          metricsJson: {
            ...(typeof post.metricsJson === "object" && post.metricsJson
              ? (post.metricsJson as Record<string, unknown>)
              : {}),
            publishedUrl: res.publishedUrl,
            externalPostId: res.externalPostId,
          },
        },
      });

      if (post.pautaId) {
        await prisma.socialPauta.update({
          where: { id: post.pautaId },
          data: { status: "PUBLISHED" },
        });
      }

      console.log(
        `[worker:scheduler] Post agendado ${post.id} publicado automaticamente em ${platform} (ID: ${res.externalPostId}, URL: ${res.publishedUrl})`
      );
    } catch (err) {
      console.error(
        `[worker:scheduler] Falha ao publicar post agendado ${post.id}:`,
        (err as Error).message
      );
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
      console.log(
        `[worker:domains] Domínio ${d.domain} (tenant ${d.tenantId}) verificado: ${
          res.verified ? "OK" : "Pendente/Falha"
        }`
      );
    } catch (err) {
      console.error(
        `[worker:domains] Falha ao verificar domínio ${d.domain}:`,
        (err as Error).message
      );
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
      console.error(
        `[worker:emails] Falha ao verificar e-mail do tenant ${e.tenantId}:`,
        (err as Error).message
      );
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

    const socialReceiver = sbClient.createReceiver(SOCIAL_PUBLISH_QUEUE);
    socialReceiver.subscribe({
      processMessage: processSocialPublishMessage,
      processError: async (args) => {
        console.error("[worker:social-publish] Erro no Service Bus:", args.error.message);
      },
    });

    console.log(
      `[Stage Worker] Conectado ao Azure Service Bus (filas: ${LEAD_NOTIFICATION_QUEUE}, ${AI_RENDER_QUEUE}, ${SOCIAL_PUBLISH_QUEUE})`
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
