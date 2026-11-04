/**
 * Módulo legado descontinuado em produção.
 * Toda a persistência do Stage Hub opera 100% sobre PostgreSQL (Prisma), Redis e Azure Blob Storage (`src/lib/storage.ts`).
 */

export type Entry = {
  name: string;
  path: string;
  type: "dir" | "file";
  size?: number;
  mtime?: string;
};
