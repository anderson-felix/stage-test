import { exigirSessao } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const url = new URL(request.url);
  const landingPageId = url.searchParams.get("landingPageId")?.trim() || "";
  const search = url.searchParams.get("q")?.trim().toLowerCase() || "";
  const exportCsv = url.searchParams.get("export") === "csv";
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const pageSize = Math.min(200, Math.max(10, Number(url.searchParams.get("pageSize") || "50") || 50));

  const allLeads = await prisma.lpLead.findMany({
    where: {
      tenantId: sessao.tenantId,
      ...(landingPageId ? { landingPageId } : {}),
    },
    include: {
      landingPage: {
        select: { id: true, slug: true, title: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const filtered = allLeads.filter((lead) => {
    if (!search) return true;
    const p =
      lead.payload && typeof lead.payload === "object" && !Array.isArray(lead.payload)
        ? (lead.payload as Record<string, unknown>)
        : {};
    const haystack = [
      p.nome,
      p.name,
      p.email,
      p.telefone,
      p.phone,
      p.empresa,
      p.company,
      lead.landingPage.title,
      lead.landingPage.slug,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });

  if (exportCsv) {
    const header = [
      "ID",
      "Data/Hora",
      "Landing Page",
      "Slug LP",
      "Nome",
      "E-mail",
      "Telefone",
      "Empresa",
      "Cargo",
      "Mensagem / Observações",
      "UTM Source",
      "UTM Medium",
      "UTM Campaign",
      "UTM Term",
      "UTM Content",
      "Referrer",
      "Status E-mail",
      "Payload Completo (JSON)",
    ];

    const rows = filtered.map((lead) => {
      const p =
        lead.payload && typeof lead.payload === "object" && !Array.isArray(lead.payload)
          ? (lead.payload as Record<string, unknown>)
          : {};
      const u =
        lead.utmData && typeof lead.utmData === "object" && !Array.isArray(lead.utmData)
          ? (lead.utmData as Record<string, unknown>)
          : {};

      return [
        lead.id,
        lead.createdAt.toISOString(),
        lead.landingPage.title,
        lead.landingPage.slug,
        String(p.nome ?? p.name ?? ""),
        String(p.email ?? ""),
        String(p.telefone ?? p.phone ?? p.whatsapp ?? ""),
        String(p.empresa ?? p.company ?? ""),
        String(p.cargo ?? p.role ?? ""),
        String(p.mensagem ?? p.message ?? p.desafio ?? ""),
        String(u.utm_source ?? ""),
        String(u.utm_medium ?? ""),
        String(u.utm_campaign ?? ""),
        String(u.utm_term ?? ""),
        String(u.utm_content ?? ""),
        String(u.referrer ?? ""),
        lead.emailDeliveryStatus,
        JSON.stringify(p),
      ];
    });

    const csvText = toCsv([header, ...rows]);
    return new Response(csvText, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-stage-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const totalLeads = allLeads.length;
  const leadsToday = allLeads.filter((l) => l.createdAt >= startOfToday).length;
  const deliveredCount = allLeads.filter(
    (l) => l.emailDeliveryStatus === "sent_custom" || l.emailDeliveryStatus === "sent_fallback"
  ).length;
  const deliverySuccessRate =
    totalLeads > 0 ? Math.round((deliveredCount / totalLeads) * 100) : 100;

  const startIdx = (page - 1) * pageSize;
  const paginated = filtered.slice(startIdx, startIdx + pageSize);

  const landingPages = await prisma.landingPage.findMany({
    where: { tenantId: sessao.tenantId },
    select: { id: true, slug: true, title: true },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({
    summary: {
      totalLeads,
      leadsToday,
      deliverySuccessRate,
      filteredTotal: filtered.length,
    },
    pagination: {
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    },
    landingPages,
    leads: paginated,
  });
}

