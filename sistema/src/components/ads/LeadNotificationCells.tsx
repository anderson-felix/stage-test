"use client";
import { Loader2, Send } from "lucide-react";
import { getLeadNotificationPresentation } from "@/lib/lead-notification-contract";

export function LeadNotificationCells({ status, busy, processing, onRecover }: {
  status: string; busy: boolean; processing: boolean; onRecover: () => void;
}) {
  const state = getLeadNotificationPresentation(status);
  return <>
    <td className="px-4 py-3">
      <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${state.cls}`}>{state.label}</span>
      <p className="mt-1 max-w-52 text-[11px] text-muted">{state.explanation}</p>
    </td>
    <td className="px-4 py-3 text-right">
      <button type="button" onClick={onRecover} disabled={busy || !state.canRecover} title={state.explanation}
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg px-2.5 py-1 text-xs font-medium text-text hover:border-brand/50 disabled:opacity-50">
        {processing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        {processing ? "Processando…" : state.action}
      </button>
    </td>
  </>;
}
