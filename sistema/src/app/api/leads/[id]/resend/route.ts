import { exigirEditor } from "@/lib/auth";
import { recoverLeadNotification } from "@/lib/email-service";
import { describeLeadNotificationResult } from "@/lib/lead-notification-contract";
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
    const result = await recoverLeadNotification(lead.id, sessao.tenantId);
    if (!result) return Response.json({ error: "Lead não encontrado neste tenant" }, { status: 404 });
    const updated = await prisma.lpLead.findUnique({
      where: { id: lead.id },
      include: {
        landingPage: { select: { id: true, slug: true, title: true } },
      },
    });
    const contract = describeLeadNotificationResult(result.status);
    return Response.json({
      ok: contract.providerAccepted,
      providerAccepted: contract.providerAccepted,
      outcome: contract.outcome,
      message: contract.message,
      deliveryResult: result,
      lead: updated,
    }, { status: contract.httpStatus });
  } catch {
    return Response.json({ error: "Não foi possível consultar ou recuperar a notificação. Tente novamente mais tarde." }, { status: 503 });
  }
}

