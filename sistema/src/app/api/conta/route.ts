import { cookies } from "next/headers";
import { createSession, usuarioAtual } from "@/lib/auth";
import { LOCALE_COOKIE, THEME_COOKIE } from "@/lib/jwt";
import { alterarUsuario, autenticar, publico, ThemePreference } from "@/lib/usuarios";

// GET devolve o usuário logado com contexto do tenant
export async function GET() {
  const u = await usuarioAtual();
  if (!u) return Response.json({ error: "não autenticado" }, { status: 401 });
  return Response.json(publico(u));
}

// PATCH { senhaAtual?, novaSenha?, preferredLocale?, themePreference?, completedTour?, nome? }
export async function PATCH(request: Request) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ error: "não autenticado" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const { senhaAtual, novaSenha, preferredLocale, themePreference, completedTour, nome } = body;

  // Fluxo de atualização de preferências (idioma, tema, tour, nome) sem troca de senha
  if (novaSenha === undefined && senhaAtual === undefined) {
    const mudanca: Parameters<typeof alterarUsuario>[1] = {};
    if (typeof preferredLocale === "string" && ["pt-BR", "en-US", "es-ES"].includes(preferredLocale)) {
      mudanca.preferredLocale = preferredLocale;
    }
    if (
      typeof themePreference === "string" &&
      ["LIGHT", "DARK", "SYSTEM"].includes(themePreference)
    ) {
      mudanca.themePreference = themePreference as ThemePreference;
    }
    if (typeof completedTour === "boolean") {
      mudanca.completedTour = completedTour;
    }
    if (typeof nome === "string" && nome.trim()) {
      mudanca.nome = nome.trim();
    }
    if (Object.keys(mudanca).length === 0) {
      return Response.json({ error: "nada para atualizar" }, { status: 400 });
    }
    try {
      const novo = await alterarUsuario(u.id, mudanca, u.tenantId);
      const cookieStore = await cookies();
      cookieStore.set(await createSession(novo, u.impersonation));
      if (mudanca.preferredLocale) {
        cookieStore.set(LOCALE_COOKIE, mudanca.preferredLocale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
      }
      if (mudanca.themePreference) {
        cookieStore.set(THEME_COOKIE, mudanca.themePreference, { path: "/", maxAge: 60 * 60 * 24 * 365 });
      }
      return Response.json(publico(novo));
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  // Fluxo de troca de senha
  if (
    typeof senhaAtual !== "string" ||
    !senhaAtual ||
    !(await autenticar(u.email, senhaAtual, u.tenantId))
  ) {
    return Response.json({ error: "senha atual incorreta" }, { status: 400 });
  }
  if (typeof novaSenha !== "string" || !novaSenha || novaSenha === senhaAtual) {
    return Response.json({ error: "escolha uma senha diferente da atual" }, { status: 400 });
  }
  try {
    const novo = await alterarUsuario(u.id, { senha: novaSenha, trocarSenha: false }, u.tenantId);
    (await cookies()).set(await createSession(novo, u.impersonation));
    return Response.json(publico(novo));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
