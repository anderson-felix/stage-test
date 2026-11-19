"use client";

import { useState } from "react";
import { ExternalLink, Monitor, RotateCw, Smartphone, Globe } from "lucide-react";

/** Preview ao vivo do site num iframe, com alternância desktop/celular e tema adaptativo. */
export function SitePreview({ url }: { url: string }) {
  const [mobile, setMobile] = useState(false);
  const [reload, setReload] = useState(0);

  let host = "Website Oficial";
  let validUrl = true;
  try {
    host = new URL(url).host;
  } catch {
    validUrl = false;
  }

  return (
    <div className="flex h-[78vh] min-h-[480px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-text">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-bg px-3 py-1.5 text-sm">
          <span className={`h-2 w-2 shrink-0 rounded-full ${validUrl ? "bg-ok" : "bg-warn"}`} />
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
              className={`rounded px-2 py-1 transition ${
                mobile === on ? "bg-surface-2 text-text shadow-xs" : "text-muted hover:text-text"
              }`}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
        <button
          onClick={() => setReload((n) => n + 1)}
          title="Recarregar"
          className="rounded p-1.5 text-muted hover:text-text"
        >
          <RotateCw size={15} />
        </button>
        {validUrl && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            title="Abrir em nova aba"
            className="rounded p-1.5 text-muted hover:text-text"
          >
            <ExternalLink size={15} />
          </a>
        )}
      </div>

      <div className="flex min-h-0 flex-1 justify-center bg-bg/50">
        {validUrl ? (
          <iframe
            key={reload}
            src={url}
            title={`Site ${host}`}
            sandbox="allow-scripts allow-same-origin allow-forms"
            className={`h-full border-0 bg-white transition-all ${
              mobile ? "w-[390px] border-x border-border shadow-md" : "w-full"
            }`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted">
            <Globe size={32} className="mb-2 text-brand-soft" />
            <p className="text-sm font-medium text-text">Nenhum website cadastrado</p>
            <p className="mt-1 text-xs">
              Informe a URL do site da sua empresa no onboarding ou em Configurações para ativar o preview.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
