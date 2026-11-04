import os from "node:os";
import path from "node:path";

/** Diretório temporário isolado (nenhuma leitura de ../cerebro em runtime). */
export function workspaceDir(): string {
  const dir = process.env.WORKSPACE_DIR;
  if (dir) return path.resolve(dir);
  return path.join(os.tmpdir(), "stage-hub-workspace");
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
