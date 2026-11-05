"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Save,
  FileText,
  Upload,
  Trash2,
  Image as ImageIcon,
  FolderOpen,
  TerminalSquare,
  Download,
  Copy,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { FileTree } from "@/components/FileTree";
import { ClaudeChat } from "@/components/ClaudeChat";
import type { UsuarioPublico } from "@/lib/usuarios";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const LANG: Record<string, string> = {
  md: "markdown",
  json: "json",
  js: "javascript",
  ts: "typescript",
  tsx: "typescript",
  html: "html",
  css: "css",
  csv: "plaintext",
  yml: "yaml",
  yaml: "yaml",
  py: "python",
};

type OpenFile = { path: string; content: string; saved: string };

type MediaItem = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  createdAt: string;
  previewUrl: string;
};

const CATEGORIES = [
  { id: "all", label: "Todos" },
  { id: "generated_slide", label: "Slides & Artes" },
  { id: "logo", label: "Logos" },
  { id: "reference", label: "Referências" },
  { id: "upload", label: "Uploads" },
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  generated_slide: "Slide / Arte",
  logo: "Logo",
  reference: "Referência",
  upload: "Upload",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BrandLibraryAndStudioPage() {
  const router = useRouter();
  const [eu, setEu] = useState<UsuarioPublico | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [adminView, setAdminView] = useState<"library" | "ide">("library");

  // Media Library state
  const [assets, setAssets] = useState<MediaItem[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [uploadCategory, setUploadCategory] = useState<string>("upload");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Super Admin IDE state
  const [file, setFile] = useState<OpenFile | null>(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const dirty = file !== null && file.content !== file.saved;

  const loadAssets = useCallback(async (cat?: string) => {
    setLoadingAssets(true);
    try {
      const c = cat ?? selectedCategory;
      const query = c && c !== "all" ? `?category=${encodeURIComponent(c)}` : "";
      const res = await fetch(`/api/media${query}`);
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets ?? []);
      }
    } finally {
      setLoadingAssets(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    fetch("/api/conta")
      .then((r) => (r.ok ? r.json() : null))
      .then((userData) => {
        if (!userData || !userData.isSuperAdmin) {
          router.replace("/");
          return;
        }
        setEu(userData);
        setCheckedAuth(true);
      })
      .catch(() => {
        router.replace("/");
      });
  }, [router]);

  useEffect(() => {
    if (checkedAuth) {
      loadAssets(selectedCategory);
    }
  }, [checkedAuth, selectedCategory, loadAssets]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError("");
    try {
      for (const f of Array.from(files)) {
        const form = new FormData();
        form.append("file", f);
        form.append("category", uploadCategory);
        const res = await fetch("/api/media", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || `Falha ao enviar ${f.name}`);
        }
      }
      await loadAssets(selectedCategory);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Remover "${name}" da biblioteca da marca?`)) return;
    const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAssets((prev) => prev.filter((a) => a.id !== id));
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Super Admin IDE handlers
  const open = useCallback(async (path: string) => {
    setError("");
    const res = await fetch(`/api/files?file=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (!res.ok) {
      setFile(null);
      setError(`${path}: ${data.error}`);
      return;
    }
    setFile({ path, content: data.content, saved: data.content });
  }, []);

  const save = useCallback(async () => {
    if (!file || !dirty) return;
    const res = await fetch("/api/files", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: file.path, content: file.content }),
    });
    if (res.ok) setFile({ ...file, saved: file.content });
    else setError((await res.json()).error);
  }, [file, dirty]);

  useEffect(() => {
    if (adminView !== "ide") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, adminView]);

  const onFilesChanged = useCallback(() => {
    setRefreshKey((k) => k + 1);
    loadAssets(selectedCategory);
    if (file && !dirty) open(file.path);
  }, [file, dirty, open, loadAssets, selectedCategory]);

  const ext = file?.path.split(".").pop()?.toLowerCase() ?? "";

  if (!checkedAuth) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted">
        <Loader2 size={16} className="mr-2 animate-spin text-brand" />
        Verificando permissões de Super Admin…
      </div>
    );
  }

  if (eu?.isSuperAdmin && adminView === "ide") {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-muted">
            <TerminalSquare size={14} className="text-brand-soft" />
            <span>Modo Super Admin · IDE de Arquivos Internos</span>
          </div>
          <button
            onClick={() => setAdminView("library")}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-text hover:border-brand/50"
          >
            <FolderOpen size={13} /> Voltar para Biblioteca da Marca
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_420px]">
          <aside className="hidden min-h-0 flex-col border-r border-border lg:flex">
            <div className="border-b border-border px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted">
              Workspace Interno
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <FileTree selected={file?.path} onOpen={open} refreshKey={refreshKey} />
            </div>
          </aside>

          <section className="hidden min-h-0 flex-col lg:flex">
            <div className="flex h-[45px] items-center justify-between border-b border-border px-3">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <FileText size={14} className="shrink-0 text-muted" />
                <span className="truncate font-mono text-xs">{file?.path ?? "Nenhum arquivo aberto"}</span>
                {dirty && <span className="h-2 w-2 shrink-0 rounded-full bg-warn" title="Não salvo" />}
              </div>
              {file && (
                <button
                  onClick={save}
                  disabled={!dirty}
                  className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-40"
                >
                  <Save size={13} /> Salvar
                </button>
              )}
            </div>
            {error && <div className="border-b border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
            <div className="min-h-0 flex-1">
              {file ? (
                <Editor
                  path={file.path}
                  value={file.content}
                  language={LANG[ext] ?? "plaintext"}
                  theme="vs-dark"
                  onChange={(v) => setFile((f) => (f ? { ...f, content: v ?? "" } : f))}
                  options={{ minimap: { enabled: false }, wordWrap: "on", fontSize: 13, scrollBeyondLastLine: false }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted">
                  Abra um arquivo na árvore à esquerda, ou peça ao Claude ao lado.
                </div>
              )}
            </div>
          </section>

          <aside className="min-h-0 border-l border-border">
            <ClaudeChat
              storageKey="chat:ide"
              onFilesChanged={onFilesChanged}
              placeholder="Peça algo ao assistente da marca…"
              suggestions={[
                "Analise os diferenciais do nosso posicionamento",
                "Sugira 3 ideias de carrossel para o Instagram",
                "Crie uma copy de anúncio para nossa solução principal",
              ]}
            />
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="flex min-h-0 flex-col overflow-y-auto px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Biblioteca da Marca & Copiloto IA</h1>
            <p className="text-sm text-muted">
              Central de ativos visuais, logos, referências de estilo e slides gerados da sua marca.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {eu?.isSuperAdmin && (
              <button
                onClick={() => setAdminView("ide")}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-muted hover:border-brand/50 hover:text-text"
              >
                <TerminalSquare size={14} /> IDE Super Admin
              </button>
            )}

            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2.5 py-2 text-xs text-text outline-none focus:border-brand"
              aria-label="Categoria do arquivo para envio"
            >
              <option value="upload">Enviar como: Upload Geral</option>
              <option value="reference">Enviar como: Referência Visual</option>
              <option value="logo">Enviar como: Logo da Marca</option>
            </select>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf"
              multiple
              onChange={(e) => handleUpload(e.target.files)}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? "Enviando…" : "Enviar Ativo"}
            </button>
          </div>
        </div>

        {uploadError && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {uploadError}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedCategory === c.id
                    ? "bg-brand/15 text-brand-soft"
                    : "bg-surface text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => loadAssets(selectedCategory)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text"
            title="Atualizar biblioteca"
          >
            <RefreshCw size={13} className={loadingAssets ? "animate-spin" : ""} /> Atualizar
          </button>
        </div>

        {loadingAssets ? (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted">
            <Loader2 size={18} className="mr-2 animate-spin" /> Carregando biblioteca da marca…
          </div>
        ) : assets.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
            <ImageIcon size={32} className="text-muted" />
            <h3 className="mt-3 font-medium">Nenhum ativo nesta categoria</h3>
            <p className="mt-1 max-w-md text-xs text-muted">
              Envie logos, imagens de referência ou gere carrosséis no módulo Social para visualizá-los aqui.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {assets.map((asset) => {
              const isImage = asset.mimeType.startsWith("image/");
              return (
                <div
                  key={asset.id}
                  className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition hover:border-brand/40"
                >
                  <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-bg">
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.previewUrl}
                        alt={asset.fileName}
                        loading="lazy"
                        className="h-full w-full object-contain transition group-hover:scale-[1.02]"
                      />
                    ) : (
                      <FileText size={36} className="text-muted" />
                    )}
                    <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                      {CATEGORY_LABEL[asset.category] ?? asset.category}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col justify-between p-3">
                    <div>
                      <div className="truncate text-xs font-medium" title={asset.fileName}>
                        {asset.fileName}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {formatBytes(asset.sizeBytes)} · {new Date(asset.createdAt).toLocaleDateString("pt-BR")}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                      <div className="flex items-center gap-1">
                        <a
                          href={asset.previewUrl}
                          download={asset.fileName}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                          title="Baixar arquivo"
                        >
                          <Download size={13} />
                        </a>
                        <button
                          onClick={() => handleCopyId(asset.id)}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted hover:bg-surface-2 hover:text-text"
                          title="Copiar ID para usar como referência"
                        >
                          {copiedId === asset.id ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
                          {copiedId === asset.id ? "Copiado" : "ID Ref"}
                        </button>
                      </div>

                      <button
                        onClick={() => handleDelete(asset.id, asset.fileName)}
                        className="rounded-md p-1.5 text-muted hover:bg-danger/15 hover:text-danger"
                        title="Excluir ativo"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <aside className="min-h-[420px] border-t border-border lg:border-l lg:border-t-0">
        <ClaudeChat
          storageKey="chat:library"
          onFilesChanged={onFilesChanged}
          placeholder="Converse com o Copiloto da sua marca…"
          suggestions={[
            "Quais são os pilares do nosso tom de voz?",
            "Sugira 5 ganchos de carrossel para o Instagram",
            "Escreva uma sequência de e-mail para nutrir leads",
          ]}
        />
      </aside>
    </div>
  );
}
