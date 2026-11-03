import { exigirSuperAdmin } from "@/lib/auth";
import { runClaude } from "@/lib/claude";

// POST /api/chat é uma ferramenta interna restrita ao Super Admin Stage
export async function POST(request: Request) {
  const admin = await exigirSuperAdmin();
  if (admin instanceof Response) return admin;

  const { message, sessionId } = (await request.json()) as {
    message?: string;
    sessionId?: string;
  };
  if (!message?.trim()) {
    return Response.json({ error: "mensagem vazia" }, { status: 400 });
  }
  if (sessionId && !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return Response.json({ error: "sessão inválida" }, { status: 400 });
  }

  return new Response(
    runClaude(message, sessionId, request.signal, {
      tenantId: admin.tenantId,
      userId: admin.id,
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
