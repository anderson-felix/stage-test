import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Com senha provisória, só dá para chegar na troca de senha (e sair).
const LIBERADO_COM_SENHA_PROVISORIA = ["/conta", "/api/conta"];
const SO_ADMIN = ["/usuarios", "/api/usuarios"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const api = pathname.startsWith("/api/");
  const user = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!user) {
    if (api) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user.trocarSenha && !LIBERADO_COM_SENHA_PROVISORIA.some((p) => pathname.startsWith(p))) {
    if (api) return NextResponse.json({ error: "troque a senha provisória antes de continuar" }, { status: 403 });
    return NextResponse.redirect(new URL("/conta", request.url));
  }

  if (user.papel !== "admin" && SO_ADMIN.some((p) => pathname.startsWith(p))) {
    if (api) return NextResponse.json({ error: "só administradores" }, { status: 403 });
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico|logo-stage.png).*)"],
};
