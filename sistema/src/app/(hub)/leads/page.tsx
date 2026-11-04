import { Suspense } from "react";
import { connection } from "next/server";
import { listarCampanhas } from "@/lib/ads";
import { getTenantIdOrThrow } from "@/lib/tenant-context";
import { LeadsCrmView } from "@/components/ads/LeadsCrmView";

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-sm text-muted">Carregando Tráfego & Leads…</div>}>
      <LeadsPageContent />
    </Suspense>
  );
}

async function LeadsPageContent() {
  await connection();
  const tenantId = await getTenantIdOrThrow();
  const campanhas = await listarCampanhas(tenantId);

  return <LeadsCrmView campanhasIniciais={campanhas} />;
}
