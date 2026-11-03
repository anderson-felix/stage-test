import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Pasta do workspace de marketing (memória, identidade, skills) que o Claude usa como contexto. */
export function workspaceDir(): string {
  const dir = process.env.WORKSPACE_DIR;
  if (!dir) throw new Error("WORKSPACE_DIR não configurado no .env.local");
  return path.resolve(dir);
}

/**
 * Binário do Claude Code. Ordem: CLAUDE_BIN do .env → `claude` no PATH →
 * versão mais recente embutida na extensão do VS Code.
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
  throw new Error("Claude Code não encontrado. Defina CLAUDE_BIN no .env.local");
}

export function sessionSecret(): Uint8Array {
  const secret = process.env.HUB_SECRET;
  if (!secret || secret.length < 32) throw new Error("HUB_SECRET precisa ter 32+ caracteres");
  return new TextEncoder().encode(secret);
}
