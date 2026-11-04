import { Suspense } from "react";
import { connection } from "next/server";
import { OverviewClient } from "@/components/OverviewClient";
import { getDashboardData } from "@/lib/dashboard";
import { requireTenantContext } from "@/lib/tenant-context";

export default function Overview() {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-sm text-muted">Carregando Visão Geral…</div>}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  await connection();
  const ctx = await requireTenantContext();
  const data = await getDashboardData(ctx.tenantId);
  return <OverviewClient key={ctx.tenantId} data={data} />;
}
