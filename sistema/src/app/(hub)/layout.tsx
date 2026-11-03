import { Suspense } from "react";
import { TopNav, TopNavEsqueleto } from "@/components/TopNav";
import { GuidedTour } from "@/components/GuidedTour";

export default function HubLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-full flex-col">
      <Suspense fallback={<TopNavEsqueleto />}>
        <TopNav />
      </Suspense>
      <main className="min-h-0 flex-1">{children}</main>
      <Suspense fallback={null}>
        <GuidedTour />
      </Suspense>
    </div>
  );
}
