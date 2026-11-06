import { getTenantContext } from "@/lib/tenant-context";
import prisma from "@/lib/prisma";
import { lerArquivoCampanha } from "@/lib/ads";
import { substituirFinalUrlEmCsv } from "@/lib/csv";

/**
 * GET /api/ads/arquivo?path=marketing/ads/campanhas/<slug>/ads-editor/<arquivo>.csv
 * ou GET /api/ads/arquivo?slug=<slug>&file=<arquivo>.csv
 *
 * Serve arquivos CSV ou Markdown de campanhas Google Ads do tenant autenticado.
 * Quando a campanha possui Landing Page vinculada, calcula a URL pública real da LP
 * e injeta na coluna `Final URL` dos CSVs (anuncios.csv, extensoes-sitelinks.csv, etc.),
 * além de substituir qualquer referência residual a `stageconsulting.com.br`.
 */
export async function GET(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const rel = (url.searchParams.get("path") ?? "").trim();
  let slug = (url.searchParams.get("slug") ?? "").trim();
  let file = (url.searchParams.get("file") ?? "").trim();

  // Extrai slug e nome do arquivo a partir de `path` caso não tenham sido passados separadamente
  if (!slug || !file) {
    const cleanRel = rel.replace(/^\/+/, "");
    const segmentos = cleanRel.split(/[\\/]/).filter(Boolean);
    const idxCampanhas = segmentos.indexOf("campanhas");
    if (!slug) {
      if (idxCampanhas !== -1 && segmentos.length > idxCampanhas + 1) {
        slug = segmentos[idxCampanhas + 1];
      } else if (segmentos.length >= 2) {
        slug = segmentos[0];
      }
    }
    if (!file && segmentos.length > 0) {
      file = segmentos[segmentos.length - 1];
    }
  }

  if (!slug && !rel) {
    return Response.json({ error: "parâmetro path ou slug obrigatório" }, { status: 400 });
  }

  // 1. Busca a campanha do tenant incluindo Landing Page e Custom Domain
  const campaign = slug
    ? await prisma.adCampaign.findUnique({
        where: {
          tenantId_slug: {
            tenantId: ctx.tenantId,
            slug,
          },
        },
        include: {
          landingPage: {
            include: { customDomain: true },
          },
        },
      })
    : null;

  // 2. Calcula a URL pública real da Landing Page vinculada (se existir)
  let finalLpUrl = "";
  if (campaign?.landingPage) {
    const lp = campaign.landingPage;
    const cd = lp.customDomain;
    if (cd?.domain && cd.dnsStatus === "VERIFIED") {
      finalLpUrl = `https://${cd.domain}/${lp.slug}`;
    } else if (cd?.domain) {
      finalLpUrl = `https://${cd.domain}/${lp.slug}`;
    } else {
      const baseAppUrl = (
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.SITE_URL ||
        "https://stage.consulting"
      ).replace(/\/+$/, "");
      finalLpUrl = `${baseAppUrl}/lp-public/default/${lp.slug}`;
    }
  }

  // 3. Obtém o perfil da marca para fallback de websiteUrl
  const brandProfile = await prisma.brandProfile.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { websiteUrl: true },
  });
  const websiteUrl = brandProfile?.websiteUrl?.trim() || "";

  // 4. Recupera o conteúdo do arquivo
  let content: string | null = null;
  let contentType = (file || rel).endsWith(".md")
    ? "text/markdown; charset=utf-8"
    : "text/csv; charset=utf-8";

  if (campaign && file) {
    const ed = (
      campaign.adsEditorData && typeof campaign.adsEditorData === "object"
        ? campaign.adsEditorData
        : {}
    ) as Record<string, unknown>;

    const csvFiles =
      (ed.csvFiles as Record<string, string>) ||
      (ed.csvExportsJson as Record<string, string>) ||
      ((campaign as unknown as Record<string, unknown>).csvExportsJson as Record<string, string>) ||
      {};

    if (file === "palavras-chave.csv" && campaign.keywordResearchCsv) {
      content = campaign.keywordResearchCsv;
    } else if (file === "sementes.md") {
      const sk = campaign.seedKeywords as { rawMarkdown?: string } | null;
      content = sk?.rawMarkdown || null;
    } else if (file.endsWith(".md") && campaign.strategyMarkdown) {
      content = campaign.strategyMarkdown;
    } else if (csvFiles[file]) {
      content = csvFiles[file];
    }
  }

  // Fallback para lerArquivoCampanha se ainda não tiver carregado o conteúdo
  if (!content && rel) {
    const arq = await lerArquivoCampanha(rel, ctx.tenantId);
    if (arq) {
      content = arq.content;
      contentType = arq.contentType;
      if (!file) file = arq.filename;
    }
  }

  if (!content) {
    return Response.json({ error: "arquivo não encontrado" }, { status: 404 });
  }

  // 5. Se o arquivo for CSV, aplica a URL pública da LP e higieniza domínios residuais
  const isCsv = file.endsWith(".csv") || contentType.includes("csv");
  if (isCsv) {
    if (finalLpUrl) {
      content = substituirFinalUrlEmCsv(content, finalLpUrl);
    }

    const replacementUrl = finalLpUrl || websiteUrl || "https://stage.consulting";

    // Substitui URLs completas de stageconsulting.com.br
    content = content.replace(
      /https?:\/\/(?:www\.)?stageconsulting\.com\.br(?:\/[^\s",;]*)?/gi,
      replacementUrl
    );

    // Substitui menções residuais do domínio
    let hostReplacement = "";
    try {
      hostReplacement = new URL(
        replacementUrl.startsWith("http") ? replacementUrl : `https://${replacementUrl}`
      ).hostname;
    } catch {
      hostReplacement = replacementUrl;
    }
    content = content.replace(/(?:www\.)?stageconsulting\.com\.br/gi, hostReplacement);
  }

  const downloadFilename = slug && file ? `${slug}-${file}` : file || "download.csv";

  return new Response(content, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${downloadFilename}"`,
    },
  });
}
