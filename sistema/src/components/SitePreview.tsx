"use client";

import { useState } from "react";
import { ExternalLink, Monitor, RotateCw, Smartphone } from "lucide-react";

/** Preview ao vivo do site num iframe, com alternância desktop/celular. */
export function SitePreview({ url }: { url: string }) {
  const [mobile, setMobile] = useState(false);
  const [reload, setReload] = useState(0);
  const host = new URL(url).host;

  return (
    <div className="flex h-[78vh] min-h-[480px] flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-bg px-3 py-1.5 text-sm">
          <span className="h-2 w-2 shrink-0 rounded-full bg-ok" />
          <span className="truncate text-muted">{host}</span>
        </div>
        <div className="flex rounded-md bg-bg p-0.5">
          {[
            { on: false, icon: Monitor, label: "Desktop" },
            { on: true, icon: Smartphone, label: "Celular" },
          ].map(({ on, icon: Icon, label }) => (
            <button
              key={label}
              onClick={() => setMobile(on)}
              title={label}
              className={`rounded px-2 py-1 ${mobile === on ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
        <button onClick={() => setReload((n) => n + 1)} title="Recarregar" className="rounded p-1.5 text-muted hover:text-text">
          <RotateCw size={15} />
        </button>
        <a href={url} target="_blank" rel="noreferrer" title="Abrir em nova aba" className="rounded p-1.5 text-muted hover:text-text">
          <ExternalLink size={15} />
        </a>
      </div>
      <div className="flex min-h-0 flex-1 justify-center bg-bg">
        <iframe
          key={reload}
          src={url}
          title={`Site ${host}`}
          className={`h-full border-0 bg-white transition-all ${mobile ? "w-[390px] border-x border-border" : "w-full"}`}
        />
      </div>
    </div>
  );
}
