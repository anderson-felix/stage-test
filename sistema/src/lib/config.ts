import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Pasta do workspace de marketing (memória, identidade, skills) usada para seed e fallback de desenvolvimento. */
export function workspaceDir(): string {
  const dir = process.env.WORKSPACE_DIR;
  if (dir) return path.resolve(dir);
  const defaultCerebro = path.resolve(process.cwd(), "../cerebro");
  if (fs.existsSync(defaultCerebro)) return defaultCerebro;
  throw new Error("WORKSPACE_DIR não configurado no ambiente");
}

/**
 * Binário do Claude Code (mantido apenas para compatibilidade legada se chamado diretamente).
 * O motor principal de IA usa @anthropic-ai/sdk em src/lib/claude.ts.
 */
export function claudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;

  const exe = process.platform === "win32" ? "claude.exe" : "claude";
  for (const p of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(p, exe);
    if (p && fs.existsSync(candidate)) return candidate;
  }

  const extDir = path.join(os.homedir(), ".vscode", "extensions");
  if (fs.existsSync(extDir)) {
    const versions = fs
      .readdirSync(extDir)
      .filter((d) => d.startsWith("anthropic.claude-code-"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const d of versions.reverse()) {
      const candidate = path.join(extDir, d, "resources", "native-binary", exe);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  throw new Error("Claude Code não encontrado. Defina ANTHROPIC_API_KEY no ambiente.");
}

export function sessionSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.HUB_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET (ou HUB_SECRET) precisa ter 32+ caracteres em produção");
    }
    return new TextEncoder().encode("dev-only-stage-hub-jwt-secret-key-minimum-32-chars!!");
  }
  return new TextEncoder().encode(secret);
}
