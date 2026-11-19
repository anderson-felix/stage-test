import { exigirEditor, exigirSessao } from "@/lib/auth";
import { atualizarLP, lerLP, type FinalidadeLP, type MudancaLP, type StatusLP } from "@/lib/lp";
import { analyzeLandingPageSeo } from "@/lib/seo-analyzer";

type Ctx = RouteContext<"/api/lp/[slug]">;

export async function GET(_req: Request, ctx: Ctx) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;
  const { slug } = await ctx.params;
  const lp = await lerLP(slug, sessao.tenantId);
  return lp ? Response.json(lp) : Response.json({ error: "LP não encontrada" }, { status: 404 });
}

async function handleManualUpdate(request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { slug } = await ctx.params;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const m: MudancaLP = {};

  if (typeof b.status === "string") m.status = b.status as StatusLP;
  if (typeof b.urlPublicada === "string") m.urlPublicada = b.urlPublicada.trim();
  if (typeof b.finalidade === "string") m.finalidade = b.finalidade as FinalidadeLP;
  if (b.campanha === null || typeof b.campanha === "string") m.campanha = b.campanha || null;
  if (typeof b.draftHtml === "string") {
    m.draftHtml = b.draftHtml;
    const seoReport = analyzeLandingPageSeo(b.draftHtml);
    m.seoMetadata = {
      title: seoReport.extracted.title,
      description: seoReport.extracted.metaDescription,
      score: seoReport.score,
      grade: seoReport.grade,
      ...(b.seoMetadata && typeof b.seoMetadata === "object"
        ? (b.seoMetadata as Record<string, unknown>)
        : {}),
    };
  } else if (b.seoMetadata && typeof b.seoMetadata === "object") {
    m.seoMetadata = b.seoMetadata as Record<string, unknown>;
  }

  if (b.trackingConfig && typeof b.trackingConfig === "object") {
    m.trackingConfig = b.trackingConfig as Record<string, unknown>;
  }
  if (b.customDomainId === null || typeof b.customDomainId === "string") {
    m.customDomainId = b.customDomainId || null;
  }

  if (Object.keys(m).length === 0) {
    return Response.json({ error: "nada para atualizar" }, { status: 400 });
  }

  try {
    // Edição manual zero-token: atualiza direto no PostgreSQL sem chamar a IA e sem descontar créditos
    await atualizarLP(slug, m, sessao.tenantId);
    const updated = await lerLP(slug, sessao.tenantId);
    return Response.json(updated);
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg }, { status: msg === "LP não encontrada" ? 404 : 400 });
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  return handleManualUpdate(request, ctx);
}

export async function PATCH(request: Request, ctx: Ctx) {
  return handleManualUpdate(request, ctx);
}
