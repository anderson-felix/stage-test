import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { FileSpreadsheet, Mail, Megaphone, Users } from "lucide-react";
import { listarCampanhas } from "@/lib/ads";
import { prisma } from "@/lib/prisma";
import { getTenantIdOrThrow } from "@/lib/tenant-context";
import { NovaCampanha } from "@/components/ads/NovaCampanha";
import { SERVICO_LABEL, STATUS_CAMPANHA_COR, STATUS_CAMPANHA_LABEL, fmtBRL } from "@/components/ads/labels";

export default function LeadsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tráfego & Leads</h1>
          <p className="text-sm text-muted">
            Da palavra-chave ao lead: campanhas Google Ads e leads capturados pelas suas{" "}
            <Link href="/site#landing-pages" className="text-brand-soft hover:underline">
              Landing Pages
            </Link>
            .
          </p>
        </div>
        <NovaCampanha />
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Megaphone size={16} className="text-brand-soft" /> Campanhas Google Ads
        </h2>
        <Suspense fallback={<div className="text-sm text-muted">Carregando Campanhas…</div>}>
          <Campanhas />
        </Suspense>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Users size={16} className="text-brand-soft" /> Leads Capturados nas Landing Pages
          </h2>
          <Link href="/conta" className="flex items-center gap-1.5 text-xs text-brand-soft hover:underline">
            <Mail size={13} /> Configurar e-mail de notificação
          </Link>
        </div>
        <Suspense fallback={<div className="text-sm text-muted">Carregando Leads…</div>}>
          <LeadsCapturados />
        </Suspense>
      </section>
    </div>
  );
}

async function Campanhas() {
  await connection();
  const tenantId = await getTenantIdOrThrow();
  const campanhas = await listarCampanhas(tenantId);

  if (campanhas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
        <FileSpreadsheet size={22} />
        Nenhuma Campanha ainda. Crie a primeira: com o CSV do Planejador de palavras-chave, a IA monta tudo para o Google Ads Editor.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {campanhas.map((c) => (
        <Link
          key={c.slug}
          href={`/leads/campanhas/${c.slug}`}
          className="rounded-xl border border-border bg-surface p-4 transition hover:border-brand/50"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="text-[11px] font-medium uppercase tracking-wider text-brand-soft">{SERVICO_LABEL[c.servico]}</div>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_CAMPANHA_COR[c.status]}`}>
              {STATUS_CAMPANHA_LABEL[c.status]}
            </span>
          </div>
          <h3 className="mt-1 font-medium">{c.titulo}</h3>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span>
              {c.montada ? "Campanha montada" : c.temPesquisa ? "Pesquisa enviada" : c.temSementes ? "Termos sugeridos" : "Sem pesquisa"}
            </span>
            {c.orcamentoDiario !== null && <span>{fmtBRL(c.orcamentoDiario)}/dia</span>}
            <span>{c.regiao === "Brazil" ? "Brasil" : c.regiao}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

const DELIVERY_BADGE: Record<string, { label: string; cls: string }> = {
  sent_custom: { label: "Enviado (Domínio Próprio)", cls: "bg-ok/15 text-ok" },
  sent_fallback: { label: "Enviado (Fallback Stage)", cls: "bg-brand/15 text-brand-soft" },
  queued: { label: "Na fila", cls: "bg-warn/15 text-warn" },
  failed: { label: "Falha no envio", cls: "bg-danger/15 text-danger" },
};

async function LeadsCapturados() {
  await connection();
  const tenantId = await getTenantIdOrThrow();
  const leads = await prisma.lpLead.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      landingPage: { select: { slug: true, title: true } },
    },
  });

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/50 px-4 py-10 text-center text-sm text-muted">
        Nenhum lead capturado ainda. Publique uma Landing Page para começar a receber leads com rastreamento UTM e disparo automático por e-mail.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="px-4 py-3">Lead</th>
            <th className="px-4 py-3">Contato & Empresa</th>
            <th className="px-4 py-3">Landing Page</th>
            <th className="px-4 py-3">Origem / UTM</th>
            <th className="px-4 py-3">Notificação E-mail</th>
            <th className="px-4 py-3">Data</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {leads.map((lead) => {
            const p = (lead.payload && typeof lead.payload === "object" ? lead.payload : {}) as Record<string, unknown>;
            const u = (lead.utmData && typeof lead.utmData === "object" ? lead.utmData : {}) as Record<string, unknown>;
            const name = String(p.nome ?? p.name ?? "Lead");
            const email = String(p.email ?? "");
            const phone = p.telefone || p.phone ? String(p.telefone ?? p.phone) : null;
            const company = p.empresa || p.company ? String(p.empresa ?? p.company) : null;
            const role = p.cargo || p.role ? String(p.cargo ?? p.role) : null;
            const utmSource = u.utm_source ? String(u.utm_source) : null;
            const utmMedium = u.utm_medium ? String(u.utm_medium) : null;
            const utmCampaign = u.utm_campaign ? String(u.utm_campaign) : null;

            const badge = DELIVERY_BADGE[lead.emailDeliveryStatus] ?? {
              label: lead.emailDeliveryStatus,
              cls: "bg-surface-2 text-muted",
            };
            return (
              <tr key={lead.id} className="hover:bg-surface-2/40">
                <td className="px-4 py-3">
                  <div className="font-medium">{name}</div>
                  {role && <div className="text-xs text-muted">{role}</div>}
                </td>
                <td className="px-4 py-3 text-xs">
                  <div>{email}</div>
                  {phone && <div className="text-muted">{phone}</div>}
                  {company && <div className="font-medium text-text">{company}</div>}
                </td>
                <td className="px-4 py-3 text-xs">
                  <Link href={`/site/lp/${lead.landingPage.slug}`} className="text-brand-soft hover:underline">
                    {lead.landingPage.title}
                  </Link>
                  <div className="font-mono text-[11px] text-muted">/{lead.landingPage.slug}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted">
                  {utmSource || utmMedium || utmCampaign ? (
                    <div>
                      <div>{utmSource || "-"} / {utmMedium || "-"}</div>
                      {utmCampaign && <div className="text-[11px]">camp: {utmCampaign}</div>}
                    </div>
                  ) : (
                    <span>Tráfego Direto</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {new Date(lead.createdAt).toLocaleString("pt-BR")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
