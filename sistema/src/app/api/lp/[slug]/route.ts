import { exigirEditor, exigirSessao } from "@/lib/auth";
import { atualizarLP, lerLP, type FinalidadeLP, type MudancaLP, type StatusLP } from "@/lib/lp";

type Ctx = RouteContext<"/api/lp/[slug]">;

export async function GET(_req: Request, ctx: Ctx) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;
  const { slug } = await ctx.params;
  const lp = await lerLP(slug, sessao.tenantId);
  return lp ? Response.json(lp) : Response.json({ error: "LP não encontrada" }, { status: 404 });
}

// PATCH { status?, urlPublicada?, finalidade?, campanha?, draftHtml?, trackingConfig?, seoMetadata?, customDomainId? }
export async function PATCH(request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { slug } = await ctx.params;
  const b = (await request.json()) as Record<string, unknown>;
  const m: MudancaLP = {};
  if (typeof b.status === "string") m.status = b.status as StatusLP;
  if (typeof b.urlPublicada === "string") m.urlPublicada = b.urlPublicada.trim();
  if (typeof b.finalidade === "string") m.finalidade = b.finalidade as FinalidadeLP;
  if (b.campanha === null || typeof b.campanha === "string") m.campanha = b.campanha || null;
  if (typeof b.draftHtml === "string") m.draftHtml = b.draftHtml;
  if (b.trackingConfig && typeof b.trackingConfig === "object") {
    m.trackingConfig = b.trackingConfig as Record<string, unknown>;
  }
  if (b.seoMetadata && typeof b.seoMetadata === "object") {
    m.seoMetadata = b.seoMetadata as Record<string, unknown>;
  }
  if (b.customDomainId === null || typeof b.customDomainId === "string") {
    m.customDomainId = b.customDomainId;
  }

  if (Object.keys(m).length === 0) return Response.json({ error: "nada para atualizar" }, { status: 400 });
  try {
    await atualizarLP(slug, m, sessao.tenantId);
    return Response.json(await lerLP(slug, sessao.tenantId));
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg }, { status: msg === "LP não encontrada" ? 404 : 400 });
  }
}
