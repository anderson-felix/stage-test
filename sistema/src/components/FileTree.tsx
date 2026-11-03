"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import type { Entry } from "@/lib/workspace";

type Props = { selected?: string; onOpen: (path: string) => void; refreshKey: number };

export function FileTree({ selected, onOpen, refreshKey }: Props) {
  const [children, setChildren] = useState<Record<string, Entry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));

  const load = useCallback(async (dir: string) => {
    const res = await fetch(`/api/files?dir=${encodeURIComponent(dir)}`);
    if (!res.ok) return;
    const { entries } = (await res.json()) as { entries: Entry[] };
    setChildren((prev) => ({ ...prev, [dir]: entries }));
  }, []);

  // Recarrega todas as pastas abertas quando o Claude mexe em arquivos
  useEffect(() => {
    expanded.forEach((dir) => load(dir));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, load]);

  function toggle(dir: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else {
        next.add(dir);
        load(dir);
      }
      return next;
    });
  }

  function render(dir: string, depth: number): React.ReactNode {
    return children[dir]?.map((e) => {
      const open = expanded.has(e.path);
      const pad = { paddingLeft: 8 + depth * 14 };
      if (e.type === "dir") {
        return (
          <div key={e.path}>
            <button onClick={() => toggle(e.path)} style={pad} className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-sm hover:bg-surface-2">
              <ChevronRight size={13} className={`shrink-0 text-muted transition ${open ? "rotate-90" : ""}`} />
              {open ? <FolderOpen size={14} className="shrink-0 text-brand-soft" /> : <Folder size={14} className="shrink-0 text-brand-soft" />}
              <span className="truncate">{e.name}</span>
            </button>
            {open && render(e.path, depth + 1)}
          </div>
        );
      }
      return (
        <button
          key={e.path}
          onClick={() => onOpen(e.path)}
          style={{ paddingLeft: 8 + depth * 14 + 19 }}
          className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left text-sm ${
            selected === e.path ? "bg-brand/15 text-brand-soft" : "text-text/90 hover:bg-surface-2"
          }`}
        >
          <File size={14} className="shrink-0 text-muted" />
          <span className="truncate">{e.name}</span>
        </button>
      );
    });
  }

  return <div className="py-1">{render("", 0)}</div>;
}
