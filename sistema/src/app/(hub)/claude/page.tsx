"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Save, FileText } from "lucide-react";
import { FileTree } from "@/components/FileTree";
import { ClaudeChat } from "@/components/ClaudeChat";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const LANG: Record<string, string> = {
  md: "markdown", json: "json", js: "javascript", ts: "typescript", tsx: "typescript",
  html: "html", css: "css", csv: "plaintext", yml: "yaml", yaml: "yaml", py: "python",
};

type OpenFile = { path: string; content: string; saved: string };

export default function ClaudeCodePage() {
  const [file, setFile] = useState<OpenFile | null>(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const dirty = file !== null && file.content !== file.saved;

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

  // Ctrl/Cmd+S salva
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // Depois que o Claude edita arquivos: atualiza a árvore e recarrega o arquivo aberto se não houver alteração local
  const onFilesChanged = useCallback(() => {
    setRefreshKey((k) => k + 1);
    if (file && !dirty) open(file.path);
  }, [file, dirty, open]);

  const ext = file?.path.split(".").pop()?.toLowerCase() ?? "";

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_420px]">
      <aside className="hidden min-h-0 flex-col border-r border-border lg:flex">
        <div className="border-b border-border px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted">
          Stage-Marketing
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
          placeholder="Peça algo sobre os arquivos da Stage…"
          suggestions={["Resuma o que tem em contexto/", "Liste as skills disponíveis e para que serve cada uma", "Crie um roteiro de carrossel sobre IA na prática"]}
        />
      </aside>
    </div>
  );
}
