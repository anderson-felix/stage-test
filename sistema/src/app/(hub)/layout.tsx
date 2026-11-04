import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { TopNav, TopNavEsqueleto } from "@/components/TopNav";
import { GuidedTour } from "@/components/GuidedTour";
import { getTenantContext } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";

export default function HubLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-full flex-col">
      <Suspense fallback={<TopNavEsqueleto />}>
        <TopNav />
      </Suspense>
      <Suspense fallback={<main className="min-h-0 flex-1 p-6 text-sm text-muted">Carregando workspace…</main>}>
        <HubGuard>{children}</HubGuard>
      </Suspense>
      <Suspense fallback={null}>
        <GuidedTour />
      </Suspense>
    </div>
  );
}

async function HubGuard({ children }: { children: ReactNode }) {
  const ctx = await getTenantContext();
  if (!ctx) {
    redirect("/login");
  }

  const headersList = await headers();
  const currentPath = headersList.get("x-pathname") || "";

  // Guarda de Onboarding: só redireciona quando onboarding não concluído, fora de /onboarding e /admin e não superAdmin
  if (!ctx.isSuperAdmin && !currentPath.startsWith("/onboarding") && !currentPath.startsWith("/admin")) {
    const brand = await prisma.brandProfile.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { onboardingCompleted: true },
    });
    if (!brand || !brand.onboardingCompleted) {
      redirect("/onboarding");
    }
  }

  return <main className="min-h-0 flex-1">{children}</main>;
}
