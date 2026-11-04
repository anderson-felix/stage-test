import { getTenantContext } from "@/lib/tenant-context";
import { htmlAutocontido } from "@/lib/lp";

// GET /api/lp-preview/<slug> serve a LP (com o logo embutido) para o iframe do hub.
export async function GET(_req: Request, routeCtx: { params: Promise<{ slug: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return new Response("Não autenticado", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const { slug } = await routeCtx.params;
  try {
    const html = await htmlAutocontido(slug, ctx.tenantId);
    return new Response(html, {
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
