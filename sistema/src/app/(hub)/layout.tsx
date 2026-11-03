import { Suspense } from "react";
import { TopNav, TopNavEsqueleto } from "@/components/TopNav";

export default function HubLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-full flex-col">
      <Suspense fallback={<TopNavEsqueleto />}>
        <TopNav />
      </Suspense>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
