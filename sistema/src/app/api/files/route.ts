import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant-context";
import prisma from "@/lib/prisma";

export type VirtualEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  mtime?: string;
};

// GET ?dir=<rel> lista uma pasta virtual do banco · GET ?file=<rel> lê um documento do BrandProfile/Tenant no PostgreSQL
// Restrito ao Super Admin Stage (blindagem black box)
export async function GET(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx || !ctx.isSuperAdmin) {
    return NextResponse.json({ error: "Acesso restrito ao Super Admin Stage." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const file = params.get("file");

  const brand = await prisma.brandProfile.findUnique({
    where: { tenantId: ctx.tenantId },
  });

  if (file !== null) {
    switch (file) {
      case "marca/sobre-a-marca.md":
        return NextResponse.json({
          path: file,
          content: brand?.businessContext || "# Sobre a Marca\n\nConfigure o contexto do negócio no Onboarding.",
        });
      case "marca/tom-de-voz.md":
        return NextResponse.json({
          path: file,
          content: brand?.toneOfVoice || "# Tom de Voz\n\nConsultivo, executivo e orientado a dados.",
        });
      case "marca/guia-visual.json":
        return NextResponse.json({
          path: file,
          content: JSON.stringify(brand?.visualGuideJson ?? {}, null, 2),
        });
      case "contexto/regras-de-negocio.md":
        return NextResponse.json({
          path: file,
          content:
            brand?.brandRules ||
            "# Regras de Negócio e Restrições\n\nNenhuma restrição adicional cadastrada.",
        });
      default:
        return NextResponse.json({ error: "Documento não encontrado no banco do tenant" }, { status: 404 });
    }
  }

  const dir = (params.get("dir") ?? "").replace(/^\/+|\/+$/g, "");
  if (dir === "") {
    const entries: VirtualEntry[] = [
      { name: "marca", path: "marca", type: "dir" },
      { name: "contexto", path: "contexto", type: "dir" },
    ];
    return NextResponse.json({ entries });
  }

  if (dir === "marca") {
    return NextResponse.json({
      entries: [
        { name: "sobre-a-marca.md", path: "marca/sobre-a-marca.md", type: "file" },
        { name: "tom-de-voz.md", path: "marca/tom-de-voz.md", type: "file" },
        { name: "guia-visual.json", path: "marca/guia-visual.json", type: "file" },
      ] satisfies VirtualEntry[],
    });
  }

  if (dir === "contexto") {
    return NextResponse.json({
      entries: [
        { name: "regras-de-negocio.md", path: "contexto/regras-de-negocio.md", type: "file" },
      ] satisfies VirtualEntry[],
    });
  }

  return NextResponse.json({ entries: [] });
}

// PUT { path, content } salva um documento do BrandProfile do tenant no PostgreSQL (0 créditos de IA)
// Restrito ao Super Admin Stage
export async function PUT(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx || !ctx.isSuperAdmin) {
    return NextResponse.json({ error: "Acesso restrito ao Super Admin Stage." }, { status: 403 });
  }

  const { path, content } = (await request.json().catch(() => ({}))) as {
    path?: string;
    content?: string;
  };
  if (!path || typeof content !== "string") {
    return NextResponse.json({ error: "path e content são obrigatórios" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (path === "marca/sobre-a-marca.md") {
    updateData.businessContext = content;
  } else if (path === "marca/tom-de-voz.md") {
    updateData.toneOfVoice = content;
  } else if (path === "marca/guia-visual.json") {
    try {
      updateData.visualGuideJson = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "JSON inválido para guia-visual.json" }, { status: 400 });
    }
  } else if (path === "contexto/regras-de-negocio.md") {
    updateData.brandRules = content;
  } else {
    return NextResponse.json({ error: "Caminho não suportado" }, { status: 400 });
  }

  await prisma.brandProfile.upsert({
    where: { tenantId: ctx.tenantId },
    create: {
      tenantId: ctx.tenantId,
      businessContext: typeof updateData.businessContext === "string" ? updateData.businessContext : "",
      toneOfVoice: typeof updateData.toneOfVoice === "string" ? updateData.toneOfVoice : "",
      brandRules: typeof updateData.brandRules === "string" ? updateData.brandRules : "",
      visualGuideJson: (updateData.visualGuideJson as object) ?? {},
    },
    update: updateData,
  });

  return NextResponse.json({ ok: true });
}
