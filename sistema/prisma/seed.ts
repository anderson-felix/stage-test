import fs from "node:fs/promises";
import path from "node:path";
import {
  PrismaClient,
  Role,
  ThemePreference,
  DnsStatus,
  SslStatus,
  LPStatus,
  PautaStatus,
} from "@prisma/client";
import { splitFrontmatter } from "../src/lib/frontmatter";
import { parseCsv } from "../src/lib/csv";
import { hashSenha } from "../src/lib/usuarios";

const prisma = new PrismaClient();

const TENANT_SLUG = "stage-consulting";
const TENANT_NAME = "Stage Consulting";

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function statMtimeMs(filePath: string): Promise<number> {
  try {
    const st = await fs.stat(filePath);
    return Math.round(st.mtimeMs);
  } catch {
    return 0;
  }
}

async function listSubdirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function parseCsvTable(text: string | null): Record<string, string>[] {
  if (!text) return [];
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = parseCsv(clean);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function toDateOrNull(val: unknown): Date | null {
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === "string" && val.trim()) {
    const d = new Date(val.trim());
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function toIsoDateString(val: unknown): string | null {
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().slice(0, 10);
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val.trim())) {
    return val.trim().slice(0, 10);
  }
  return null;
}

function mapLegacyPostStatusToEnum(status: string): PautaStatus {
  switch (status) {
    case "publicado":
      return PautaStatus.PUBLISHED;
    case "pronto":
      return PautaStatus.SCHEDULED;
    case "em-design":
      return PautaStatus.DESIGN;
    case "aprovado":
      return PautaStatus.APPROVED;
    default:
      return PautaStatus.SCRIPT_REVIEW;
  }
}

async function upsertMediaAsset(params: {
  tenantId: string;
  fileName: string;
  category: string;
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const existing = await prisma.mediaAsset.findFirst({
    where: {
      tenantId: params.tenantId,
      blobUrl: params.blobUrl,
    },
  });

  if (existing) {
    return prisma.mediaAsset.update({
      where: { id: existing.id },
      data: {
        fileName: params.fileName,
        category: params.category,
        mimeType: params.mimeType,
        sizeBytes: params.sizeBytes,
      },
    });
  }

  return prisma.mediaAsset.create({
    data: params,
  });
}

async function main() {
  const cerebroRoot = path.resolve(process.cwd(), process.env.WORKSPACE_DIR || "../cerebro");
  console.log(`[Seed] Iniciando migração idempotente a partir de: ${cerebroRoot}`);

  const counts = {
    tenants: 0,
    users: 0,
    tenantMembers: 0,
    brandProfiles: 0,
    customDomains: 0,
    emailConfigs: 0,
    adCampaigns: 0,
    landingPages: 0,
    socialPautas: 0,
    socialPosts: 0,
    socialAccounts: 0,
    mediaAssets: 0,
  };

  // 1. Tenant inicial "stage-consulting"
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {
      name: TENANT_NAME,
      isActive: true,
    },
    create: {
      name: TENANT_NAME,
      slug: TENANT_SLUG,
      planTier: "enterprise",
      tokenCreditBalance: 100000,
      defaultLocale: "pt-BR",
      themePreference: ThemePreference.DARK,
      isActive: true,
    },
  });
  counts.tenants = 1;

  // 2. User inicial Super Admin + migração de data/usuarios.json se existir
  const defaultAdminEmail = "admin@stage.consulting";
  const defaultPasswordHash = await hashSenha(process.env.HUB_PASSWORD || "admin123", {
    trocarSenha: false,
    ativo: true,
    sessoesDesde: 0,
  });

  const adminUser = await prisma.user.upsert({
    where: { email: defaultAdminEmail },
    update: {
      isSuperAdmin: true,
    },
    create: {
      email: defaultAdminEmail,
      fullName: "Admin Stage",
      passwordHash: defaultPasswordHash,
      preferredLocale: "pt-BR",
      themePreference: ThemePreference.DARK,
      isSuperAdmin: true,
      completedTour: false,
    },
  });
  counts.users++;

  await prisma.tenantMember.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: adminUser.id,
      },
    },
    update: {
      role: Role.OWNER,
    },
    create: {
      tenantId: tenant.id,
      userId: adminUser.id,
      role: Role.OWNER,
    },
  });
  counts.tenantMembers++;

  // Importar data/usuarios.json legado se existir
  const legacyUsersPath = path.resolve(process.cwd(), process.env.DATA_DIR || "data", "usuarios.json");
  const legacyUsersRaw = await readIfExists(legacyUsersPath);
  if (legacyUsersRaw) {
    try {
      const legacyUsers = JSON.parse(legacyUsersRaw) as Array<{
        id: string;
        nome: string;
        email: string;
        papel: "admin" | "membro";
        ativo: boolean;
        trocarSenha: boolean;
        criadoEm: string;
        sessoesDesde: number;
        senhaHash: string;
      }>;
      for (const lu of legacyUsers) {
        const email = lu.email.trim().toLowerCase();
        const role = lu.papel === "admin" ? Role.OWNER : Role.EDITOR;
        const isSuperAdmin = lu.papel === "admin";
        const [alg, sal, chave] = lu.senhaHash.split(":");
        const encodedHash = `${alg}:${sal}:${chave}:${lu.trocarSenha ? "1" : "0"}:${lu.ativo !== false ? "1" : "0"}:${lu.sessoesDesde || 0}`;

        const u = await prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            email,
            fullName: lu.nome.trim() || email,
            passwordHash: encodedHash,
            isSuperAdmin,
            preferredLocale: "pt-BR",
            themePreference: ThemePreference.DARK,
          },
        });
        counts.users++;

        await prisma.tenantMember.upsert({
          where: {
            tenantId_userId: {
              tenantId: tenant.id,
              userId: u.id,
            },
          },
          update: {},
          create: {
            tenantId: tenant.id,
            userId: u.id,
            role,
          },
        });
        counts.tenantMembers++;
      }
    } catch (err) {
      console.warn("[Seed] Aviso ao ler usuarios.json legado:", err);
    }
  }

  // 3. BrandProfile a partir de cerebro/contexto/* e cerebro/marca/*
  const negocioMd = await readIfExists(path.join(cerebroRoot, "contexto/negocio.md"));
  const vozMd = await readIfExists(path.join(cerebroRoot, "contexto/voz.md"));
  const regrasMd = await readIfExists(path.join(cerebroRoot, "contexto/regras.md"));
  const focoMd = await readIfExists(path.join(cerebroRoot, "contexto/foco.md"));
  const glossarioMd = await readIfExists(path.join(cerebroRoot, "contexto/glossario.md"));
  const guiaVisualMd = await readIfExists(path.join(cerebroRoot, "marca/guia-visual.md"));
  const canaisMd = await readIfExists(path.join(cerebroRoot, "marca/canais.md"));

  const glossaryJson = {
    rawMarkdown: glossarioMd ?? "",
    preferredTerms: [
      { term: "transformação empresarial", context: "Descrever a jornada completa" },
      { term: "inteligência artificial aplicada", context: "Soluções de IA com foco em resultado" },
      { term: "diagnóstico estratégico", context: "Primeira etapa de projetos" },
      { term: "parceiro de negócios", context: "Como nos posicionamos" },
      { term: "implementação ponta a ponta", context: "Diferencial competitivo" },
    ],
    avoidedTerms: [
      { term: "disruptivo / disrupção", replacement: "transformação concreta" },
      { term: "sinergia", replacement: "integração entre áreas" },
      { term: "solução mágica / bala de prata", replacement: "abordagem estruturada" },
      { term: "revolucionário", replacement: "com impacto mensurável" },
    ],
  };

  const visualGuideJson = {
    rawGuiaVisual: guiaVisualMd ?? "",
    rawCanais: canaisMd ?? "",
    colors: {
      backgroundPrimary: "#0A0A0A",
      backgroundSecondary: "#141414",
      accentPrimary: "#C9A84C",
      accentHover: "#DFC06E",
      textPrimary: "#F5F5F0",
      textSecondary: "#A3A39E",
    },
    fonts: {
      display: "Cormorant Garamond",
      sans: "Plus Jakarta Sans",
      mono: "JetBrains Mono",
    },
    styleSummary: "Dark luxury editorial B2B (preto profundo #0A0A0A, dourado sóbrio #C9A84C, branco quente #F5F5F0).",
  };

  await prisma.brandProfile.upsert({
    where: { tenantId: tenant.id },
    update: {
      businessContext: negocioMd,
      toneOfVoice: vozMd,
      brandRules: regrasMd,
      currentFocus: focoMd,
      glossaryJson,
      visualGuideJson,
      logoBlobUrl: "marca/assets/logo/Logotipo_Stage.png",
      websiteUrl: "https://stage.consulting",
      onboardingCompleted: true,
    },
    create: {
      tenantId: tenant.id,
      businessContext: negocioMd,
      toneOfVoice: vozMd,
      brandRules: regrasMd,
      currentFocus: focoMd,
      glossaryJson,
      visualGuideJson,
      logoBlobUrl: "marca/assets/logo/Logotipo_Stage.png",
      websiteUrl: "https://stage.consulting",
      onboardingCompleted: true,
    },
  });
  counts.brandProfiles = 1;

  // 4. CustomDomain & TenantEmailConfig iniciais
  await prisma.customDomain.upsert({
    where: { domain: "lp.stage.consulting" },
    update: {
      tenantId: tenant.id,
      dnsStatus: DnsStatus.VERIFIED,
      sslStatus: SslStatus.ACTIVE,
      isDefault: true,
    },
    create: {
      tenantId: tenant.id,
      domain: "lp.stage.consulting",
      isSubdomain: true,
      dnsProviderHint: "Cloudflare",
      verificationToken: "stage-consulting-verified-token",
      cnameTarget: process.env.CNAME_TARGET || "domains.stage.consult",
      dnsStatus: DnsStatus.VERIFIED,
      sslStatus: SslStatus.ACTIVE,
      isDefault: true,
      lastCheckedAt: new Date(),
    },
  });
  counts.customDomains = 1;

  await prisma.tenantEmailConfig.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      senderDomain: "stage.consulting",
      senderEmail: "leads@stage.consult",
      senderName: "Stage Consulting",
      leadDestinationEmails: ["contato@stage.consulting"],
      verificationStatus: DnsStatus.PENDING,
      useStageFallback: true,
    },
  });
  counts.emailConfigs = 1;

  // 5. MediaAssets de marca (logo e referências)
  const logoFull = path.join(cerebroRoot, "marca/assets/logo/Logotipo_Stage.png");
  try {
    const st = await fs.stat(logoFull);
    await upsertMediaAsset({
      tenantId: tenant.id,
      fileName: "Logotipo_Stage.png",
      category: "logo",
      blobUrl: "marca/assets/logo/Logotipo_Stage.png",
      mimeType: "image/png",
      sizeBytes: st.size,
    });
    counts.mediaAssets++;
  } catch {
    // ignore if missing
  }

  const refDir = path.join(cerebroRoot, "marca/referencias");
  try {
    const refFiles = await fs.readdir(refDir);
    for (const f of refFiles) {
      if (/\.(png|jpe?g|webp|svg)$/i.test(f)) {
        const st = await fs.stat(path.join(refDir, f));
        await upsertMediaAsset({
          tenantId: tenant.id,
          fileName: f,
          category: "reference",
          blobUrl: `marca/referencias/${f}`,
          mimeType: f.endsWith(".png") ? "image/png" : "image/jpeg",
          sizeBytes: st.size,
        });
        counts.mediaAssets++;
      }
    }
  } catch {
    // ignore
  }

  // 6. AdCampaigns (marketing/ads/campanhas/*)
  const adsDir = path.join(cerebroRoot, "marketing/ads/campanhas");
  const campaignSlugs = await listSubdirs(adsDir);
  const campaignMap = new Map<string, string>(); // slug -> id

  for (const cSlug of campaignSlugs) {
    const cDir = path.join(adsDir, cSlug);
    const campMd = await readIfExists(path.join(cDir, "campanha.md"));
    if (!campMd) continue;

    const { data, body } = splitFrontmatter(campMd);
    const sementesMd = await readIfExists(path.join(cDir, "pesquisa/sementes.md"));
    const palavrasCsv = await readIfExists(path.join(cDir, "pesquisa/palavras-chave.csv"));

    const adsEditorDir = path.join(cDir, "ads-editor");
    const csvFiles: Record<string, string> = {};
    try {
      const files = await fs.readdir(adsEditorDir);
      for (const f of files) {
        if (/\.(csv|md)$/i.test(f)) {
          const content = await readIfExists(path.join(adsEditorDir, f));
          if (content !== null) {
            csvFiles[f] = content;
          }
        }
      }
    } catch {
      // sem ads-editor
    }

    const adsEditorData = {
      objetivo: typeof data.objetivo === "string" ? data.objetivo : "formulario",
      regiao: typeof data.regiao === "string" ? data.regiao : "Brazil",
      lpUrl: typeof data.lp_url === "string" ? data.lp_url : "",
      criadaEm: toIsoDateString(data.criada_em),
      csvFiles,
      gruposCsv: parseCsvTable(csvFiles["grupos.csv"] ?? null),
      keywordsCsv: parseCsvTable(csvFiles["keywords.csv"] ?? null),
      negativasCsv: parseCsvTable(csvFiles["keywords-negativas.csv"] ?? null),
      anunciosCsv: parseCsvTable(csvFiles["anuncios.csv"] ?? null),
      campanhasCsv: parseCsvTable(csvFiles["campanhas.csv"] ?? null),
      sitelinksCsv: parseCsvTable(csvFiles["extensoes-sitelinks.csv"] ?? null),
    };

    const budgetVal =
      typeof data.orcamento_diario === "number"
        ? data.orcamento_diario
        : typeof data.orcamento_diario === "string" && data.orcamento_diario.trim()
          ? Number(data.orcamento_diario)
          : null;

    const seedKeywordsJson = sementesMd
      ? {
          rawMarkdown: sementesMd,
          terms: sementesMd
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith("#")),
        }
      : undefined;

    const campaign = await prisma.adCampaign.upsert({
      where: {
        tenantId_slug: {
          tenantId: tenant.id,
          slug: cSlug,
        },
      },
      update: {
        name: typeof data.titulo === "string" ? data.titulo : cSlug,
        serviceType: typeof data.servico === "string" ? data.servico : "institucional",
        status: typeof data.status === "string" ? data.status : "rascunho",
        budget: budgetVal !== null && !isNaN(budgetVal) ? budgetVal : null,
        strategyMarkdown: body.trim(),
        seedKeywords: seedKeywordsJson,
        keywordResearchCsv: palavrasCsv,
        adsEditorData,
      },
      create: {
        tenantId: tenant.id,
        slug: cSlug,
        name: typeof data.titulo === "string" ? data.titulo : cSlug,
        serviceType: typeof data.servico === "string" ? data.servico : "institucional",
        status: typeof data.status === "string" ? data.status : "rascunho",
        budget: budgetVal !== null && !isNaN(budgetVal) ? budgetVal : null,
        strategyMarkdown: body.trim(),
        seedKeywords: seedKeywordsJson,
        keywordResearchCsv: palavrasCsv,
        adsEditorData,
      },
    });

    campaignMap.set(cSlug, campaign.id);
    counts.adCampaigns++;
  }

  // 7. LandingPages (marketing/landing-pages/*)
  const lpsDir = path.join(cerebroRoot, "marketing/landing-pages");
  const lpSlugs = await listSubdirs(lpsDir);

  for (const lpSlug of lpSlugs) {
    const lpDir = path.join(lpsDir, lpSlug);
    const lpMd = await readIfExists(path.join(lpDir, "lp.md"));
    if (!lpMd) continue;

    const { data, body } = splitFrontmatter(lpMd);
    const indexHtml = await readIfExists(path.join(lpDir, "index.html"));
    const versao = await statMtimeMs(path.join(lpDir, "index.html"));
    const legacyStatus = typeof data.status === "string" ? data.status : "rascunho";
    const statusEnum =
      legacyStatus === "publicada" ? LPStatus.PUBLISHED : LPStatus.DRAFT;

    const campanhaSlug =
      typeof data.campanha === "string" && data.campanha.trim()
        ? data.campanha.trim()
        : null;
    const finalidade = data.finalidade === "site" ? "site" : "campanha";
    const briefingText = body.replace(/^## Briefing\s*/i, "").trim();

    const briefingData = {
      briefing: briefingText,
      legacyStatus,
      urlPublicada: typeof data.url_publicada === "string" ? data.url_publicada : "",
      criadaEm: toIsoDateString(data.criada_em),
      campanhaSlug: finalidade === "campanha" ? campanhaSlug : null,
      versao,
    };

    const gtmMatch = indexHtml?.match(/GTM-[A-Z0-9]+/);
    const trackingConfig = {
      gtmId: gtmMatch ? gtmMatch[0] : "GTM-5NDZ8J6",
      hotjarId: null,
      metaPixelId: null,
    };

    const titleMatch = indexHtml?.match(/<title>([\s\S]*?)<\/title>/i);
    const descMatch = indexHtml?.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
    const seoMetadata = {
      title: titleMatch?.[1]?.trim() || (typeof data.titulo === "string" ? data.titulo : lpSlug),
      description: descMatch?.[1]?.trim() || "",
    };

    const lp = await prisma.landingPage.upsert({
      where: {
        tenantId_slug: {
          tenantId: tenant.id,
          slug: lpSlug,
        },
      },
      update: {
        title: typeof data.titulo === "string" ? data.titulo : lpSlug,
        purpose: finalidade,
        serviceType: typeof data.servico === "string" ? data.servico : "institucional",
        status: statusEnum,
        briefingData,
        draftHtml: indexHtml,
        publishedBlobUrl:
          statusEnum === LPStatus.PUBLISHED
            ? `marketing/landing-pages/${lpSlug}/index.html`
            : null,
        seoMetadata,
        trackingConfig,
        publishedAt: statusEnum === LPStatus.PUBLISHED ? new Date() : null,
      },
      create: {
        tenantId: tenant.id,
        slug: lpSlug,
        title: typeof data.titulo === "string" ? data.titulo : lpSlug,
        purpose: finalidade,
        serviceType: typeof data.servico === "string" ? data.servico : "institucional",
        status: statusEnum,
        briefingData,
        draftHtml: indexHtml,
        publishedBlobUrl:
          statusEnum === LPStatus.PUBLISHED
            ? `marketing/landing-pages/${lpSlug}/index.html`
            : null,
        seoMetadata,
        trackingConfig,
        publishedAt: statusEnum === LPStatus.PUBLISHED ? new Date() : null,
      },
    });
    counts.landingPages++;

    // Se vinculada a uma campanha existente, atualiza AdCampaign.landingPageId
    if (campanhaSlug && campaignMap.has(campanhaSlug)) {
      await prisma.adCampaign.update({
        where: { id: campaignMap.get(campanhaSlug)! },
        data: { landingPageId: lp.id },
      });
    }
  }

  // 8. SocialPautas e SocialPosts (marketing/social/*)
  const socialDir = path.join(cerebroRoot, "marketing/social");
  const pautaSlugs = (await listSubdirs(socialDir)).filter(
    (name) => !name.startsWith("_")
  );

  for (const pautaSlug of pautaSlugs) {
    const pautaDir = path.join(socialDir, pautaSlug);
    const pautaMd = await readIfExists(path.join(pautaDir, "pauta.md"));
    if (!pautaMd) continue;

    const { data: pautaData } = splitFrontmatter(pautaMd);
    const scheduledDate = toDateOrNull(pautaData.data_criacao);

    const pauta = await prisma.socialPauta.upsert({
      where: {
        tenantId_slug: {
          tenantId: tenant.id,
          slug: pautaSlug,
        },
      },
      update: {
        title: typeof pautaData.titulo === "string" ? pautaData.titulo : pautaSlug,
        scheduledDate,
        briefingMarkdown: pautaMd,
        status: PautaStatus.APPROVED,
      },
      create: {
        tenantId: tenant.id,
        slug: pautaSlug,
        title: typeof pautaData.titulo === "string" ? pautaData.titulo : pautaSlug,
        scheduledDate,
        briefingMarkdown: pautaMd,
        status: PautaStatus.APPROVED,
      },
    });
    counts.socialPautas++;

    const postSlugs = await listSubdirs(pautaDir);
    for (const postSlug of postSlugs) {
      const postDir = path.join(pautaDir, postSlug);
      const postMd = await readIfExists(path.join(postDir, "post.md"));
      if (!postMd) continue;

      const { data: postData, body: postBody } = splitFrontmatter(postMd);
      const legendaMd = await readIfExists(path.join(postDir, "legenda.md"));
      const arteDir = path.join(postDir, "arte");
      const arteHtml = await readIfExists(path.join(arteDir, "arte.html"));

      let slideFiles: string[] = [];
      let pdfFile: string | null = null;
      let versao = 0;

      try {
        const arteEntries = await fs.readdir(arteDir);
        slideFiles = arteEntries
          .filter((n) => /^slide-\d+\.(png|jpe?g)$/i.test(n))
          .sort();
        pdfFile = arteEntries.find((n) => n.toLowerCase() === "arte.pdf") ?? null;

        for (const n of [...slideFiles, ...(pdfFile ? [pdfFile] : [])]) {
          const st = await fs.stat(path.join(arteDir, n));
          versao = Math.max(versao, Math.round(st.mtimeMs));

          if (/^slide-\d+\.(png|jpe?g)$/i.test(n)) {
            await upsertMediaAsset({
              tenantId: tenant.id,
              fileName: `${pautaSlug}_${postSlug}_${n}`,
              category: "social_slide",
              blobUrl: `marketing/social/${pautaSlug}/${postSlug}/arte/${n}`,
              mimeType: n.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
              sizeBytes: st.size,
            });
            counts.mediaAssets++;
          }
        }
      } catch {
        // pasta arte não existe
      }

      const slidesBlobUrls = slideFiles.map(
        (n) => `marketing/social/${pautaSlug}/${postSlug}/arte/${n}`
      );

      // Ler histórico em arte/historico/*
      const historySnapshots: Array<{
        timestamp: string;
        slides: string[];
        hasHtml: boolean;
      }> = [];
      try {
        const histDir = path.join(arteDir, "historico");
        const histFolders = await listSubdirs(histDir);
        for (const hf of histFolders) {
          const hfFiles = await fs.readdir(path.join(histDir, hf));
          historySnapshots.push({
            timestamp: hf,
            slides: hfFiles
              .filter((f) => /^slide-\d+\.(png|jpe?g)$/i.test(f))
              .sort()
              .map(
                (f) =>
                  `marketing/social/${pautaSlug}/${postSlug}/arte/historico/${hf}/${f}`
              ),
            hasHtml: hfFiles.includes("arte.html"),
          });
        }
      } catch {
        // sem histórico
      }

      const platform =
        typeof postData.canal === "string"
          ? postData.canal
          : postSlug.startsWith("linkedin")
            ? "linkedin"
            : "instagram";
      const format =
        typeof postData.formato === "string"
          ? postData.formato
          : postSlug.includes("carrossel")
            ? "carrossel"
            : "post-unico";

      const legacyStatusStr =
        typeof postData.status === "string" ? postData.status : "rascunho";
      const dataPlanejadaStr = toIsoDateString(postData.data_planejada);
      const publicadoEmStr = toIsoDateString(postData.publicado_em);

      const arteHistoryJson = {
        postSlug,
        serie: typeof postData.serie === "string" ? postData.serie : "conteudo",
        legacyStatus: legacyStatusStr,
        dataPlanejada: dataPlanejadaStr,
        origemArte:
          postData.origem_arte === "ia" || postData.origem_arte === "designer"
            ? postData.origem_arte
            : arteHtml
              ? "ia"
              : null,
        publicadoEm: publicadoEmStr,
        linkPublicado:
          typeof postData.link_publicado === "string" && postData.link_publicado
            ? postData.link_publicado
            : null,
        pdfUrl: pdfFile
          ? `marketing/social/${pautaSlug}/${postSlug}/arte/${pdfFile}`
          : null,
        versao,
        snapshots: historySnapshots,
      };

      const existingPost = await prisma.socialPost.findFirst({
        where: {
          tenantId: tenant.id,
          pautaId: pauta.id,
          platform,
          format,
        },
      });

      const postPayload = {
        tenantId: tenant.id,
        pautaId: pauta.id,
        platform,
        format,
        scriptMarkdown: postBody.trim(),
        captionMarkdown: (legendaMd ?? "").trim(),
        arteHtml,
        arteHistoryJson,
        slidesBlobUrls,
        scheduledAt: toDateOrNull(dataPlanejadaStr),
        publishedAt: toDateOrNull(publicadoEmStr),
        status: mapLegacyPostStatusToEnum(legacyStatusStr),
        externalPostId:
          typeof postData.link_publicado === "string" && postData.link_publicado
            ? postData.link_publicado
            : null,
      };

      if (existingPost) {
        await prisma.socialPost.update({
          where: { id: existingPost.id },
          data: postPayload,
        });
      } else {
        await prisma.socialPost.create({
          data: postPayload,
        });
      }
      counts.socialPosts++;
    }
  }

  // 9. SocialAccounts (_perfis/instagram e _perfis/linkedin)
  const perfisDir = path.join(cerebroRoot, "marketing/social/_perfis");
  for (const platform of ["instagram", "linkedin"] as const) {
    const feedRaw = await readIfExists(path.join(perfisDir, platform, "feed.json"));
    if (!feedRaw) continue;
    try {
      const feedJson = JSON.parse(feedRaw) as Record<string, unknown>;
      const handleOrPageId =
        typeof feedJson.usuario === "string"
          ? feedJson.usuario
          : typeof feedJson.slug === "string"
            ? feedJson.slug
            : "stage.consulting";

      await prisma.socialAccount.upsert({
        where: {
          tenantId_platform: {
            tenantId: tenant.id,
            platform,
          },
        },
        update: {
          handleOrPageId,
          cachedProfileJson: feedJson as object,
          lastSyncedAt: new Date(),
        },
        create: {
          tenantId: tenant.id,
          platform,
          handleOrPageId,
          cachedProfileJson: feedJson as object,
          lastSyncedAt: new Date(),
        },
      });
      counts.socialAccounts++;
    } catch (err) {
      console.warn(`[Seed] Erro ao importar perfil ${platform}:`, err);
    }
  }

  console.log("[Seed] Migração concluída com sucesso! Contagens por entidade:");
  console.table(counts);
}

main()
  .catch((err) => {
    console.error("[Seed] Erro fatal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
