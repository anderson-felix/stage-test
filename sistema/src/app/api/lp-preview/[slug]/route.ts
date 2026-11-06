import { getTenantContext } from "@/lib/tenant-context";
import { htmlAutocontido } from "@/lib/lp";
import prisma from "@/lib/prisma";
import { buildLeadCaptureInterceptorScript } from "@/app/lp-public/[host]/[slug]/route";
import { resolveLpHtmlAssets } from "@/lib/brand-assets";

// GET /api/lp-preview/<slug> serve a LP (com o logo embutido e script de leads) para o iframe do hub.
export async function GET(req: Request, routeCtx: { params: Promise<{ slug: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return new Response("Não autenticado", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const { slug } = await routeCtx.params;
  try {
    let html = await htmlAutocontido(slug, ctx.tenantId);
    const lpRow = await prisma.landingPage.findUnique({
      where: { tenantId_slug: { tenantId: ctx.tenantId, slug } },
      select: { id: true, slug: true },
    });

    if (lpRow) {
      const host = req.headers.get("host") || "preview.local";
      const bodyInject = buildLeadCaptureInterceptorScript(lpRow.id, ctx.tenantId, lpRow.slug, host);
      if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, `${bodyInject}\n</body>`);
      } else {
        html = `${html}\n${bodyInject}`;
      }
    }

    html = await resolveLpHtmlAssets(html, ctx.tenantId);

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "sandbox allow-scripts allow-forms; connect-src 'self' /api/public/leads; form-action 'self'",
      },
    });
  } catch {
    return new Response("LP ainda não gerada", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
