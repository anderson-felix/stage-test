import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant-context";
import { runClaude } from "@/lib/claude";

// POST /api/chat é uma ferramenta interna restrita ao Super Admin Stage
export async function POST(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx || !ctx.isSuperAdmin) {
    return NextResponse.json(
      { error: "Acesso restrito ao Super Admin Stage." },
      { status: 403 }
    );
  }

  const { message, sessionId } = (await request.json().catch(() => ({}))) as {
    message?: string;
    sessionId?: string;
  };
  if (!message?.trim()) {
    return NextResponse.json({ error: "mensagem vazia" }, { status: 400 });
  }
  if (sessionId && !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return NextResponse.json({ error: "sessão inválida" }, { status: 400 });
  }

  return new Response(
    runClaude(message, sessionId, request.signal, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      featureModule: "superadmin_chat",
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    }
  );
}
