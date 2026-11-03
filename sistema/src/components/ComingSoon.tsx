import type { LucideIcon } from "lucide-react";

export function ComingSoon({ icon: Icon, title, items }: { icon: LucideIcon; title: string; items: string[] }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/15 text-brand-soft">
        <Icon size={22} />
      </div>
      <h1 className="mt-4 text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted">Módulo nas próximas fases do Stage Hub. O que vai ter aqui:</p>
      <ul className="mt-6 w-full space-y-2 text-left">
        {items.map((item) => (
          <li key={item} className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
