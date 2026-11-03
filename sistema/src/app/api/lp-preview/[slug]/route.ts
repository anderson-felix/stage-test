import { exigirSessao } from "@/lib/auth";
import { htmlAutocontido } from "@/lib/lp";

// GET /api/lp-preview/<slug> serve a LP (com o logo embutido) para o iframe do hub.
export async function GET(_req: Request, ctx: RouteContext<"/api/lp-preview/[slug]">) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const { slug } = await ctx.params;
  try {
    return new Response(await htmlAutocontido(slug, sessao.tenantId), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "sandbox allow-scripts allow-forms; connect-src 'none'; form-action 'none'",
      },
    });
  } catch {
    return new Response("LP ainda não gerada", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
