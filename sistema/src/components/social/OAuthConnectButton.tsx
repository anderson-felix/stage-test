"use client";

import { Link2, CheckCircle2 } from "lucide-react";

export function OAuthConnectButton({
  platform,
  connected,
  handle,
}: {
  platform: "instagram" | "linkedin";
  connected: boolean;
  handle?: string | null;
}) {
  const label = platform === "instagram" ? "Instagram Graph API" : "LinkedIn API";

  if (connected) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs font-medium text-ok">
        <CheckCircle2 size={14} />
        <span>OAuth Conectado {handle ? `(${handle})` : ""}</span>
      </div>
    );
  }

  return (
    <a
      href={`/api/social/oauth/${platform}`}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text hover:border-brand/50"
    >
      <Link2 size={14} className="text-brand-soft" />
      <span>Conectar {label} (OAuth)</span>
    </a>
  );
}

