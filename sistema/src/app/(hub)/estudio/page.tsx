import Link from "next/link";
import { Clapperboard, Film, LayoutTemplate, Library, Lock, PenTool } from "lucide-react";

const RECURSOS = [
  {
    icon: Library,
    titulo: "Biblioteca de posts",
    texto: "Todos os posts criados no hub num só lugar, com busca por tema, canal, formato e data, prontos para reaproveitar.",
  },
  {
    icon: PenTool,
    titulo: "Edição de artes",
    texto: "Abrir qualquer arte da biblioteca e editar textos, cores, imagens e slides, gerando uma nova versão a partir da anterior.",
  },
  {
    icon: LayoutTemplate,
    titulo: "Templates de post",
    texto: "Modelos aprovados para o Instagram e o LinkedIn: o time escolhe o modelo, troca o conteúdo e a peça sai no padrão da Stage.",
  },
  {
    icon: Film,
    titulo: "Edição de vídeo",
    texto: "Cortes, legendas e capas para Reels, Stories e vídeos do LinkedIn, com a identidade visual da Stage aplicada.",
  },
];

export default function EstudioPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Clapperboard size={22} className="text-brand-soft" /> Estúdio
            <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted">em breve</span>
          </h1>
          <p className="text-sm text-muted">A biblioteca de tudo o que o marketing produz, com edição de artes e de vídeos dentro do hub.</p>
        </div>
        <Link href="/social" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:border-brand/50">
          Ir para o Social
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {RECURSOS.map(({ icon: Icon, titulo, texto }) => (
          <div key={titulo} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15 text-brand-soft">
                <Icon size={18} />
              </div>
              <span className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                <Lock size={10} /> em breve
              </span>
            </div>
            <div className="mt-3 font-medium">{titulo}</div>
            <p className="mt-1 text-sm text-muted">{texto}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-border px-5 py-4 text-sm text-muted">
        Hoje as artes já são geradas pela IA e editadas no próprio post, em Social. O Estúdio reúne tudo numa biblioteca e acrescenta templates e vídeo.
      </div>
    </div>
  );
}
