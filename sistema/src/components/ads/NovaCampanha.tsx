"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, ImagePlus, Loader2, Plus, X } from "lucide-react";
import type { Servico } from "@/lib/ads";
import { SERVICO_LABEL, SERVICOS_ORDEM } from "./labels";

const TONE_OPTIONS = [
  { value: "", label: "Padrão da marca" },
  { value: "Consultivo", label: "Consultivo & Executivo" },
  { value: "Direto", label: "Direto & Orientado a Conversão" },
  { value: "Provocativo", label: "Provocativo & Desafiador" },
  { value: "Educativo", label: "Educativo & Didático" },
  { value: "Formal", label: "Formal & Institucional" },
];

const LANGUAGE_OPTIONS = [
  { value: "pt-BR", label: "Português (pt-BR)" },
  { value: "en-US", label: "English (en-US)" },
  { value: "es-ES", label: "Español (es-ES)" },
];

export function NovaCampanha() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [servico, setServico] = useState<Servico>("technology");
  const [orcamento, setOrcamento] = useState("");
  const [regiao, setRegiao] = useState("Brasil");
  const [briefing, setBriefing] = useState("");
  const [toneStyle, setToneStyle] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function criar() {
    setEnviando(true);
    setErro("");
    try {
      let referenceAssetId: string | null = null;
      if (refFile) {
        const form = new FormData();
        form.append("file", refFile);
        form.append("category", "reference");
        const upRes = await fetch("/api/media", { method: "POST", body: form });
        const upJson = await upRes.json();
        if (!upRes.ok) throw new Error(upJson.error ?? "Erro ao enviar imagem de referência");
        referenceAssetId = upJson.asset.id;
      }

      const res = await fetch("/api/ads/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo,
          servico,
          orcamentoDiario: orcamento ? Number(orcamento.replace(",", ".")) : null,
          regiao: regiao.trim().toLowerCase() === "brasil" ? "Brazil" : regiao,
          briefing,
          toneStyle: toneStyle || undefined,
          language,
          referenceAssetId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro ao criar a Campanha");

      if (arquivo) {
        const form = new FormData();
        form.append("arquivo", arquivo);
        const up = await fetch(`/api/ads/campanhas/${json.slug}/pesquisa`, { method: "PUT", body: form });
        const upJson = await up.json();
        if (!up.ok) throw new Error(`Campanha criada, mas o CSV não foi aceito: ${upJson.error}`);
      }
      router.push(`/leads/campanhas/${json.slug}?iniciar=${arquivo ? "montar" : "sementes"}`);
    } catch (err) {
      setErro((err as Error).message);
      setEnviando(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover"
      >
        <Plus size={15} /> Nova Campanha
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10"
          onClick={() => !enviando && setOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl border border-border bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-semibold">Nova Campanha · Google Ads</h2>
              <button onClick={() => !enviando && setOpen(false)} className="text-muted hover:text-text" aria-label="Fechar">
                <X size={18} />
              </button>
            </header>

            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="text-xs font-medium text-muted">Nome da Campanha *</span>
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex.: Consultoria de IA para empresas"
                  className={input}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-muted">Serviço / Vertical *</span>
                  <select value={servico} onChange={(e) => setServico(e.target.value as Servico)} className={input}>
                    {SERVICOS_ORDEM.map((s) => (
                      <option key={s} value={s}>
                        {SERVICO_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Orçamento diário (R$, opcional)</span>
                  <input
                    value={orcamento}
                    onChange={(e) => setOrcamento(e.target.value)}
                    inputMode="decimal"
                    placeholder="Ex.: 150"
                    className={input}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-medium text-muted">Região</span>
                  <input value={regiao} onChange={(e) => setRegiao(e.target.value)} className={input} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Tom dos Anúncios</span>
                  <select value={toneStyle} onChange={(e) => setToneStyle(e.target.value)} className={input}>
                    {TONE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Idioma</span>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} className={input}>
                    {LANGUAGE_OPTIONS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-muted">Briefing (opcional)</span>
                <textarea
                  value={briefing}
                  onChange={(e) => setBriefing(e.target.value)}
                  rows={3}
                  placeholder="Para quem é, que problema resolve, o que diferencia sua marca. Se ficar vazio, a IA usa o BrandProfile."
                  className={`${input} resize-none`}
                />
              </label>

              <div className="rounded-lg border border-dashed border-border p-3">
                <div className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet size={16} className="text-brand-soft" />
                  <span className="font-medium">Pesquisa do Planejador de palavras-chave</span>
                  <span className="text-xs text-muted">(opcional)</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Com o CSV, a IA já monta a campanha. Sem ele, a IA sugere os termos para você pesquisar no Planejador, e você envia o CSV depois.
                </p>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-text"
                />
              </div>

              <div className="rounded-lg border border-dashed border-border p-3">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <ImagePlus size={15} className="text-brand-soft" />
                  <span>Imagem de Referência (opcional)</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  Envie um print de concorrente ou LP para contextualizar os anúncios RSA.
                </p>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => setRefFile(e.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-text"
                />
              </div>

              {erro && <p className="text-sm text-danger">{erro}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setOpen(false)}
                  disabled={enviando}
                  className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text"
                >
                  Cancelar
                </button>
                <button
                  onClick={criar}
                  disabled={!titulo.trim() || enviando}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  {enviando && <Loader2 size={15} className="animate-spin" />}
                  {arquivo ? "Criar e montar campanha" : "Criar e sugerir termos"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
