import { exigirEditor } from "@/lib/auth";
import { sendLeadNotificationEmail } from "@/lib/email-service";
import { prisma } from "@/lib/prisma";

type Ctx = RouteContext<"/api/leads/[id]/resend">;

export async function POST(_request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { id } = await ctx.params;

  const lead = await prisma.lpLead.findFirst({
    where: {
      id,
      tenantId: sessao.tenantId,
    },
  });

  if (!lead) {
    return Response.json({ error: "Lead não encontrado neste tenant" }, { status: 404 });
  }

  try {
    const result = await sendLeadNotificationEmail(lead.id);
    const updated = await prisma.lpLead.findUnique({
      where: { id: lead.id },
      include: {
        landingPage: { select: { id: true, slug: true, title: true } },
      },
    });
    return Response.json({
      ok: result.status !== "failed",
      deliveryResult: result,
      lead: updated,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

