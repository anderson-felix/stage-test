"use client";

/* eslint-disable @next/next/no-img-element -- imagens do workspace servidas pela API do hub */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowUpLeft,
  BringToFront,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  ImagePlus,
  Italic,
  Loader2,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  SendToBack,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import type { PostCompleto } from "@/lib/social";
import { CANAL_LABEL, FORMATO_LABEL } from "./labels";
import { useI18n } from "@/lib/use-i18n";

/** Cores da marca (marca/guia-visual.md). */
const PALETA = [
  { nome: "Roxo Stage", cor: "#4C0DFF" },
  { nome: "Roxo título", cor: "#6D23F9" },
  { nome: "Roxo claro", cor: "#A98BFF" },
  { nome: "Roxo profundo", cor: "#21005E" },
  { nome: "Lilás", cor: "#EADDFF" },
  { nome: "Lilás claro", cor: "#F6F3FF" },
  { nome: "Branco", cor: "#FFFFFF" },
  { nome: "Quase-preto", cor: "#1C1B1E" },
  { nome: "Cinza", cor: "#948F99" },
  { nome: "Verde-água", cor: "#4FFBE5" },
];

const FUNDOS = [
  { nome: "Escuro (gradiente)", valor: "linear-gradient(160deg, #21005E 0%, #150240 55%, #0B0420 100%)", amostra: "linear-gradient(160deg,#21005E,#0B0420)" },
  { nome: "Roxo Stage", valor: "#4C0DFF" },
  { nome: "Branco", valor: "#FFFFFF" },
  { nome: "Lilás claro", valor: "#F6F3FF" },
  { nome: "Lilás", valor: "#EADDFF" },
  { nome: "Cinza claro", valor: "#F2F2F2" },
];

const PESOS = [400, 600, 700, 800];
const MAX_HISTORICO = 60;

const EDITOR_CSS = `
html, body { overflow: hidden !important; }
.slide:not([data-ed-atual]) { display: none !important; }
[contenteditable] { outline: none; cursor: text !important; }
body * { cursor: default; }
`;

const TEXTO_SELETOR = "h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,a,button";

type Rect = { x: number; y: number; w: number; h: number };

/** Caminho relativo (com "/") de um diretório do workspace até um arquivo do workspace. */
function relativo(deDir: string, para: string): string {
  const a = deDir.split("/");
  const b = para.split("/");
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill(".."), ...b.slice(i)].join("/");
}

const wsUrl = (rel: string) =>
  rel.startsWith("/api/") || rel.startsWith("http://") || rel.startsWith("https://") || rel.startsWith("data:")
    ? rel
    : `/api/media/${encodeURIComponent(rel)}`;

function lerTranslate(el: HTMLElement): [number, number] {
  const [x = "0", y = "0"] = el.style.translate.split(/\s+/);
  return [parseFloat(x) || 0, parseFloat(y) || 0];
}

function ehGrafico(el: Element): boolean {
  return el.tagName === "IMG" || el.tagName.toLowerCase() === "svg" || el.tagName === "VIDEO";
}

function rgbParaHex(cor: string): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cor);
  if (!m) return cor.startsWith("#") ? cor : "#000000";
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function ArteEditor({ post }: { post: PostCompleto }) {
  const router = useRouter();
  const { dict } = useI18n();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<Document | null>(null);
  const selRef = useRef<HTMLElement | null>(null);
  const slideRef = useRef(0);
  const editandoRef = useRef<HTMLElement | null>(null);
  const textoAntesRef = useRef("");
  const historicoRef = useRef<{ pilha: string[]; pos: number }>({ pilha: [], pos: -1 });
  const salvoRef = useRef(false);

  const [vista, setVista] = useState<Window | null>(null);
  const [podeDesfazer, setPodeDesfazer] = useState({ desfazer: false, refazer: false });
  const carregado = vista !== null;
  const [escala, setEscala] = useState(0.4);
  const [slide, setSlide] = useState(0);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<HTMLElement | null>(null);
  const [editando, setEditando] = useState(false);
  const [, setTick] = useState(0);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [seletorImagem, setSeletorImagem] = useState<null | "inserir" | "trocar">(null);

  const largura = 1080;
  const altura = post.formato === "story" ? 1920 : 1350;
  const arteDir = `${post.path}/arte`;
  const voltarUrl = `/social/${post.pauta.slug}/${post.slug}`;
  const redesenhar = useCallback(() => setTick((t) => t + 1), []);

  // ---------- slides ----------

  const slidesDoc = useCallback((): HTMLElement[] => {
    const doc = docRef.current;
    return doc ? [...doc.querySelectorAll<HTMLElement>(".slide")] : [];
  }, []);

  const mostrarSlide = useCallback(
    (i: number) => {
      const lista = slidesDoc();
      if (lista.length === 0) return;
      const idx = Math.max(0, Math.min(i, lista.length - 1));
      lista.forEach((s, n) => (n === idx ? s.setAttribute("data-ed-atual", "") : s.removeAttribute("data-ed-atual")));
      slideRef.current = idx;
      setSlide(idx);
      setTotal(lista.length);
    },
    [slidesDoc],
  );

  const slideAtual = useCallback(() => slidesDoc()[slideRef.current] ?? null, [slidesDoc]);

  // ---------- seleção ----------

  const selecionar = useCallback((el: HTMLElement | null) => {
    selRef.current = el;
    setSel(el);
  }, []);

  // ---------- histórico (desfazer/refazer) ----------

  const fotografar = useCallback((): string => {
    const body = docRef.current?.body;
    if (!body) return "";
    const copia = body.cloneNode(true) as HTMLElement;
    copia.querySelectorAll("[data-ed-atual],[contenteditable]").forEach((n) => {
      n.removeAttribute("data-ed-atual");
      n.removeAttribute("contenteditable");
    });
    return copia.innerHTML;
  }, []);

  const registrar = useCallback(() => {
    const h = historicoRef.current;
    const foto = fotografar();
    if (h.pilha[h.pos] === foto) return;
    h.pilha = [...h.pilha.slice(0, h.pos + 1), foto].slice(-MAX_HISTORICO);
    h.pos = h.pilha.length - 1;
    setPodeDesfazer({ desfazer: h.pos > 0, refazer: false });
    setSujo(true);
    redesenhar();
  }, [fotografar, redesenhar]);

  const restaurar = useCallback(
    (passo: -1 | 1) => {
      const h = historicoRef.current;
      const alvo = h.pos + passo;
      if (!docRef.current || alvo < 0 || alvo >= h.pilha.length) return;
      h.pos = alvo;
      setPodeDesfazer({ desfazer: alvo > 0, refazer: alvo < h.pilha.length - 1 });
      docRef.current.body.innerHTML = h.pilha[alvo];
      editandoRef.current = null;
      setEditando(false);
      selecionar(null);
      mostrarSlide(slideRef.current);
      setSujo(true);
      redesenhar();
    },
    [mostrarSlide, redesenhar, selecionar],
  );

  // ---------- edição de texto ----------

  const sairDoTexto = useCallback(() => {
    const el = editandoRef.current;
    if (!el) return;
    el.removeAttribute("contenteditable");
    editandoRef.current = null;
    setEditando(false);
    docRef.current?.getSelection()?.removeAllRanges();
    if (el.innerHTML !== textoAntesRef.current) registrar();
    redesenhar();
  }, [registrar, redesenhar]);

  const entrarNoTexto = useCallback(
    (el: HTMLElement) => {
      const doc = docRef.current;
      if (!doc || ehGrafico(el) || !el.textContent?.trim()) return;
      sairDoTexto();
      textoAntesRef.current = el.innerHTML;
      el.setAttribute("contenteditable", "true");
      editandoRef.current = el;
      setEditando(true);
      el.focus();
      const range = doc.createRange();
      range.selectNodeContents(el);
      const s = doc.getSelection();
      s?.removeAllRanges();
      s?.addRange(range);
    },
    [sairDoTexto],
  );

  // ---------- montagem do iframe ----------

  const aoCarregar = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !doc.body) return;
    docRef.current = doc;

    const estilo = doc.createElement("style");
    estilo.id = "__ed";
    estilo.textContent = EDITOR_CSS;
    doc.head.appendChild(estilo);

    mostrarSlide(0);
    historicoRef.current = { pilha: [fotografar()], pos: 0 };
    setPodeDesfazer({ desfazer: false, refazer: false });
    setSujo(false);
    setVista(doc.defaultView);

    /** Elemento que um clique escolhe: o SVG inteiro, a imagem, o bloco de texto ou o próprio alvo. */
    const alvoDoClique = (alvo: Element, slideEl: HTMLElement): HTMLElement | null => {
      if (alvo === slideEl || !slideEl.contains(alvo)) return null;
      let svgTopo: Element | null = null;
      for (let n: Element | null = alvo; n && n !== slideEl; n = n.parentElement) {
        if (n.tagName.toLowerCase() === "svg") svgTopo = n;
      }
      if (svgTopo) return svgTopo as HTMLElement;
      const texto = alvo.closest(TEXTO_SELETOR);
      if (texto && slideEl.contains(texto) && texto !== slideEl) return texto as HTMLElement;
      return alvo as HTMLElement;
    };

    let arraste: {
      el: HTMLElement;
      x0: number;
      y0: number;
      tx: number;
      ty: number;
      moveu: boolean;
      alvo: Element;
      jaSelecionado: boolean;
    } | null = null;

    doc.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const alvo = e.target as Element;
      if (editandoRef.current) {
        if (editandoRef.current.contains(alvo)) return; // clique dentro do texto: mexe no cursor
        sairDoTexto();
      }
      const slideEl = slidesDoc()[slideRef.current];
      if (!slideEl) return;
      e.preventDefault();
      const atual = selRef.current;
      const jaSelecionado = !!atual && atual !== slideEl && atual.contains(alvo);
      const el = jaSelecionado ? atual : alvoDoClique(alvo, slideEl);
      selecionar(el);
      if (!el) return;
      const [tx, ty] = lerTranslate(el);
      arraste = { el, x0: e.clientX, y0: e.clientY, tx, ty, moveu: false, alvo, jaSelecionado };
      (alvo as HTMLElement).setPointerCapture?.(e.pointerId);
    });

    doc.addEventListener("pointermove", (e) => {
      if (!arraste) return;
      const dx = e.clientX - arraste.x0;
      const dy = e.clientY - arraste.y0;
      if (!arraste.moveu && Math.hypot(dx, dy) < 3) return;
      arraste.moveu = true;
      arraste.el.style.translate = `${Math.round(arraste.tx + dx)}px ${Math.round(arraste.ty + dy)}px`;
      redesenhar();
    });

    // Clique (sem arrastar) num elemento já selecionado desce para o filho clicado, ex.: o destaque do título.
    // Espera um pouco: se vier um duplo clique, edita o texto do bloco inteiro em vez de descer.
    let descer: ReturnType<typeof setTimeout> | undefined;

    doc.addEventListener("pointerup", (e) => {
      if (!arraste) return;
      const { moveu, jaSelecionado, alvo, el } = arraste;
      arraste = null;
      if (moveu) registrar();
      else if (jaSelecionado && alvo !== el && e.detail < 2 && alvo instanceof doc.defaultView!.HTMLElement) {
        clearTimeout(descer);
        descer = setTimeout(() => {
          if (selRef.current !== el || editandoRef.current) return;
          let filho: HTMLElement = alvo;
          while (filho.parentElement && filho.parentElement !== el) filho = filho.parentElement;
          if (el.contains(filho) && !filho.closest("svg")) selecionar(filho);
        }, 300);
      }
    });

    doc.addEventListener("dblclick", (e) => {
      clearTimeout(descer);
      const el = selRef.current;
      if (el && el.contains(e.target as Node)) entrarNoTexto(el);
    });

    // Colar só texto puro, para não trazer formatação de fora.
    doc.addEventListener("paste", (e) => {
      if (!editandoRef.current) return;
      e.preventDefault();
      const texto = e.clipboardData?.getData("text/plain") ?? "";
      doc.execCommand("insertText", false, texto);
    });

    doc.addEventListener("input", redesenhar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- escala do canvas ----------

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const obs = new ResizeObserver(() => {
      const { width, height } = area.getBoundingClientRect();
      setEscala(Math.max(0.15, Math.min((width - 32) / largura, (height - 32) / altura, 1)));
    });
    obs.observe(area);
    return () => obs.disconnect();
  }, [altura]);

  // ---------- ações ----------

  const aplicar = useCallback(
    (fn: (el: HTMLElement) => void, alvo: HTMLElement | null = selRef.current) => {
      if (!alvo) return;
      fn(alvo);
      registrar();
    },
    [registrar],
  );

  const apagar = useCallback(() => {
    const el = selRef.current;
    if (!el) return;
    el.remove();
    selecionar(null);
    registrar();
  }, [registrar, selecionar]);

  const duplicar = useCallback(() => {
    const el = selRef.current;
    if (!el) return;
    const copia = el.cloneNode(true) as HTMLElement;
    const [tx, ty] = lerTranslate(el);
    copia.style.translate = `${tx + 24}px ${ty + 24}px`;
    el.after(copia);
    selecionar(copia);
    registrar();
  }, [registrar, selecionar]);

  const moverSel = useCallback(
    (dx: number, dy: number) => {
      const el = selRef.current;
      if (!el) return;
      const [tx, ty] = lerTranslate(el);
      el.style.translate = `${tx + dx}px ${ty + dy}px`;
      registrar();
    },
    [registrar],
  );

  const camada = useCallback(
    (direcao: 1 | -1) =>
      aplicar((el) => {
        const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
        if (cs.position === "static") el.style.position = "relative";
        const z = parseInt(cs.zIndex, 10);
        el.style.zIndex = String((Number.isNaN(z) ? 0 : z) + direcao * 5);
      }),
    [aplicar],
  );

  const inserirTexto = useCallback(() => {
    const slideEl = slideAtual();
    const doc = docRef.current;
    if (!slideEl || !doc) return;
    const p = doc.createElement("p");
    p.textContent = "Novo texto";
    Object.assign(p.style, {
      position: "absolute",
      left: "88px",
      top: `${Math.round(altura / 2 - 40)}px`,
      maxWidth: `${largura - 176}px`,
      margin: "0",
      fontSize: "56px",
      fontWeight: "700",
      lineHeight: "1.1",
      zIndex: "10",
    });
    slideEl.appendChild(p);
    selecionar(p);
    registrar();
    entrarNoTexto(p);
  }, [altura, entrarNoTexto, registrar, selecionar, slideAtual]);

  const usarImagem = useCallback(
    (relWorkspace: string) => {
      const src =
        relWorkspace.startsWith("/api/") ||
        relWorkspace.startsWith("http://") ||
        relWorkspace.startsWith("https://") ||
        relWorkspace.startsWith("data:")
          ? relWorkspace
          : `/api/media/${encodeURIComponent(relWorkspace)}`;
      const doc = docRef.current;
      if (seletorImagem === "trocar" && selRef.current?.tagName === "IMG") {
        aplicar((el) => el.setAttribute("src", src));
      } else if (doc) {
        const slideEl = slideAtual();
        if (!slideEl) return;
        const img = doc.createElement("img");
        img.setAttribute("src", src);
        img.setAttribute("alt", "");
        Object.assign(img.style, { position: "absolute", left: "88px", top: "300px", width: "420px", height: "auto", zIndex: "5" });
        slideEl.appendChild(img);
        img.addEventListener("load", redesenhar, { once: true });
        selecionar(img);
        registrar();
      }
      setSeletorImagem(null);
    },
    [aplicar, arteDir, redesenhar, registrar, selecionar, seletorImagem, slideAtual],
  );

  const acaoSlide = useCallback(
    (acao: "duplicar" | "apagar" | "esquerda" | "direita") => {
      const lista = slidesDoc();
      const s = lista[slideRef.current];
      if (!s) return;
      sairDoTexto();
      selecionar(null);
      let novo = slideRef.current;
      if (acao === "duplicar") {
        const copia = s.cloneNode(true) as HTMLElement;
        copia.removeAttribute("data-ed-atual");
        s.after(copia);
        novo += 1;
      } else if (acao === "apagar") {
        if (lista.length <= 1) return;
        s.remove();
        novo = Math.min(novo, lista.length - 2);
      } else if (acao === "esquerda" && novo > 0) {
        lista[novo - 1].before(s);
        novo -= 1;
      } else if (acao === "direita" && novo < lista.length - 1) {
        lista[novo + 1].after(s);
        novo += 1;
      } else return;
      mostrarSlide(novo);
      registrar();
    },
    [mostrarSlide, registrar, sairDoTexto, selecionar, slidesDoc],
  );

  const irParaSlide = useCallback(
    (i: number) => {
      sairDoTexto();
      selecionar(null);
      mostrarSlide(i);
    },
    [mostrarSlide, sairDoTexto, selecionar],
  );

  async function salvar() {
    const doc = docRef.current;
    if (!doc) return;
    sairDoTexto();
    setSalvando(true);
    setErro("");
    try {
      const raiz = doc.documentElement.cloneNode(true) as HTMLElement;
      raiz.querySelector("#__ed")?.remove();
      raiz.querySelectorAll("[data-ed-atual],[contenteditable]").forEach((n) => {
        n.removeAttribute("data-ed-atual");
        n.removeAttribute("contenteditable");
      });
      const html = `<!DOCTYPE html>\n${raiz.outerHTML}\n`;
      const res = await fetch(`/api/social/posts/${post.pauta.slug}/${post.slug}/arte/html`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro ao salvar a Arte");
      historicoRef.current = { pilha: [fotografar()], pos: 0 };
      setSujo(false);
      salvoRef.current = true;
      // Navegação completa: o cache do router ainda guarda a página do Post com a Arte anterior.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(voltarUrl);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  function voltar() {
    if (sujo && !confirm("Sair sem salvar? As edições desta Arte serão perdidas.")) return;
    router.push(voltarUrl);
  }

  // ---------- teclado ----------

  useEffect(() => {
    if (!carregado) return;
    const doc = docRef.current!;
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      const emCampo = alvo.ownerDocument === document && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        document.getElementById("ed-salvar")?.click();
        return;
      }
      if (editandoRef.current) {
        if (e.key === "Escape") sairDoTexto();
        return;
      }
      if (emCampo) {
        if (e.key === "Escape") alvo.blur();
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        restaurar(e.shiftKey ? 1 : -1);
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        restaurar(1);
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicar();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selRef.current) {
          e.preventDefault();
          apagar();
        }
      } else if (e.key === "Escape") {
        selecionar(null);
      } else if (e.key === "Enter" && selRef.current) {
        e.preventDefault();
        entrarNoTexto(selRef.current);
      } else if (e.key.startsWith("Arrow") && selRef.current) {
        e.preventDefault();
        const passo = e.shiftKey ? 10 : 1;
        const d = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
        if (d) moverSel(d[0], d[1]);
      }
    };
    window.addEventListener("keydown", onKey);
    doc.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      doc.removeEventListener("keydown", onKey);
    };
  }, [apagar, carregado, duplicar, entrarNoTexto, moverSel, restaurar, sairDoTexto, selecionar]);

  useEffect(() => {
    if (!sujo) return;
    const aviso = (e: BeforeUnloadEvent) => {
      if (!salvoRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sujo]);

  // ---------- redimensionar pela alça ----------

  function iniciarResize(e: React.PointerEvent) {
    const el = selRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    const grafico = ehGrafico(el);
    const semTexto = !el.textContent?.trim();
    const inicio = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
    const mover = (ev: PointerEvent) => {
      const w = Math.max(16, Math.round(inicio.w + (ev.clientX - inicio.x) / escala));
      el.style.width = `${w}px`;
      el.style.maxWidth = "none";
      if (grafico) {
        el.style.height = `${Math.round((w * inicio.h) / inicio.w)}px`;
      } else if (semTexto) {
        el.style.height = `${Math.max(2, Math.round(inicio.h + (ev.clientY - inicio.y) / escala))}px`;
      }
      redesenhar();
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      registrar();
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  // ---------- render ----------

  const conectado = !!sel && sel.isConnected;
  const cs = conectado && vista ? vista.getComputedStyle(sel!) : null;
  const rect: Rect | null = conectado
    ? (() => {
        const r = sel!.getBoundingClientRect();
        return { x: r.left * escala, y: r.top * escala, w: r.width * escala, h: r.height * escala };
      })()
    : null;
  const temTexto = conectado && !ehGrafico(sel!) && !!sel!.textContent?.trim();
  const ehImg = conectado && sel!.tagName === "IMG";
  const semTexto = conectado && !ehGrafico(sel!) && !temTexto;
  const slideEl = vista ? (vista.document.querySelectorAll<HTMLElement>(".slide")[slide] ?? null) : null;
  const fundoAtual = slideEl && vista ? vista.getComputedStyle(slideEl).backgroundColor : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2">
        <button onClick={voltar} className="flex items-center gap-1.5 text-sm text-muted hover:text-text">
          <ArrowLeft size={15} /> {dict.social.backToPost}
        </button>
        <div className="mx-2 h-5 w-px bg-border" />
        <div className="min-w-0 text-sm">
          <span className="font-medium">{dict.social.artEditorTitle}</span>
          <span className="ml-2 truncate text-muted">
            {post.pauta.titulo} · {CANAL_LABEL[post.canal]} {FORMATO_LABEL[post.formato].toLowerCase()}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <BotaoIcone titulo={dict.social.undo} onClick={() => restaurar(-1)} disabled={!podeDesfazer.desfazer}>
            <Undo2 size={16} />
          </BotaoIcone>
          <BotaoIcone titulo={dict.social.redo} onClick={() => restaurar(1)} disabled={!podeDesfazer.refazer}>
            <Redo2 size={16} />
          </BotaoIcone>
          <button
            id="ed-salvar"
            onClick={salvar}
            disabled={salvando || !carregado}
            className="ml-2 flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {salvando ? dict.social.savingAndRendering : dict.social.saveAndRender}
          </button>
        </div>
      </div>
      {erro && <p className="border-b border-border bg-surface px-4 py-2 text-sm text-danger">{erro}</p>}

      <div className="grid min-h-0 flex-1 grid-cols-[88px_minmax(0,1fr)_288px]">
        {/* Slides */}
        <aside className="min-h-0 space-y-2 overflow-y-auto border-r border-border bg-surface p-3">
          {Array.from({ length: total }, (_, i) => (
            <button
              key={i}
              onClick={() => irParaSlide(i)}
              className={`flex w-full items-center justify-center rounded-md border-2 text-sm font-medium ${
                post.formato === "story" ? "aspect-[9/16]" : "aspect-[4/5]"
              } ${i === slide ? "border-brand bg-brand/15 text-text" : "border-border text-muted hover:border-brand/50"}`}
            >
              {i + 1}
            </button>
          ))}
        </aside>

        {/* Canvas */}
        <div
          ref={areaRef}
          className="relative flex min-h-0 items-center justify-center overflow-hidden bg-bg"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              sairDoTexto();
              selecionar(null);
            }
          }}
        >
          <div className="relative shadow-2xl" style={{ width: largura * escala, height: altura * escala }}>
            <iframe
              ref={iframeRef}
              src={`/api/social/posts/${encodeURIComponent(post.pauta.slug)}/${encodeURIComponent(post.slug)}/arte/html?v=${post.arte.versao}`}
              onLoad={aoCarregar}
              title="Arte"
              className="absolute left-0 top-0 origin-top-left border-0 bg-white"
              style={{ width: largura, height: altura, transform: `scale(${escala})` }}
            />
            {rect && (
              <div
                className={`pointer-events-none absolute border-2 ${editando ? "border-ok" : "border-brand-soft"}`}
                style={{ left: rect.x - 2, top: rect.y - 2, width: rect.w + 4, height: rect.h + 4 }}
              >
                {!editando && (
                  <span
                    onPointerDown={iniciarResize}
                    title="Redimensionar"
                    className="pointer-events-auto absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border-2 border-brand-soft bg-white"
                  />
                )}
              </div>
            )}
            {!carregado && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
                <Loader2 size={16} className="mr-2 animate-spin" /> {dict.social.loadingArt}
              </div>
            )}
          </div>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-2 py-1 text-xs text-muted">
            <BotaoIcone titulo={dict.social.prevSlide} onClick={() => irParaSlide(slide - 1)} disabled={slide <= 0}>
              <ChevronLeft size={14} />
            </BotaoIcone>
            {dict.social.slideOf} {slide + 1} {dict.social.ofTotal} {total}
            <BotaoIcone titulo={dict.social.nextSlide} onClick={() => irParaSlide(slide + 1)} disabled={slide >= total - 1}>
              <ChevronRight size={14} />
            </BotaoIcone>
          </div>
        </div>

        {/* Propriedades */}
        <aside className="min-h-0 space-y-5 overflow-y-auto border-l border-border bg-surface p-4 text-sm">
          {conectado && cs ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{ehImg ? dict.social.image : temTexto ? dict.social.text : dict.social.element}</h3>
                <button onClick={() => selecionar(null)} className="text-muted hover:text-text" title="Voltar ao slide (Esc)">
                  <X size={15} />
                </button>
              </div>

              {temTexto && (
                <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
                  {editando ? "Digitando. Esc ou clique fora para terminar." : "Duplo clique (ou Enter) para editar o texto. Clique de novo para selecionar uma parte."}
                </p>
              )}

              {temTexto && (
                <Grupo titulo={dict.social.font}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={8}
                      max={600}
                      value={Math.round(parseFloat(cs.fontSize))}
                      onChange={(e) => aplicar((el) => (el.style.fontSize = `${e.target.value}px`))}
                      className="w-20 rounded-md border border-border bg-bg px-2 py-1 outline-none focus:border-brand"
                      aria-label={dict.social.fontSize}
                    />
                    <span className="text-xs text-muted">px</span>
                    <select
                      value={PESOS.includes(Number(cs.fontWeight)) ? Number(cs.fontWeight) : 700}
                      onChange={(e) => aplicar((el) => (el.style.fontWeight = e.target.value))}
                      className="flex-1 rounded-md border border-border bg-bg px-2 py-1 outline-none focus:border-brand"
                      aria-label={dict.social.weight}
                    >
                      {PESOS.map((p) => (
                        <option key={p} value={p}>
                          {{ 400: "Regular", 600: "Semibold", 700: "Bold", 800: "Extrabold" }[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-2 flex gap-1">
                    <BotaoIcone
                      titulo={dict.social.italic}
                      ativo={cs.fontStyle === "italic"}
                      onClick={() => aplicar((el) => (el.style.fontStyle = cs.fontStyle === "italic" ? "normal" : "italic"))}
                    >
                      <Italic size={15} />
                    </BotaoIcone>
                    <div className="mx-1 w-px bg-border" />
                    {(
                      [
                        ["left", AlignLeft, dict.social.alignLeft],
                        ["center", AlignCenter, dict.social.alignCenter],
                        ["right", AlignRight, dict.social.alignRight],
                      ] as const
                    ).map(([valor, Icone, label]) => (
                      <BotaoIcone
                        key={valor}
                        titulo={label}
                        ativo={cs.textAlign === valor || (valor === "left" && cs.textAlign === "start")}
                        onClick={() => aplicar((el) => (el.style.textAlign = valor))}
                      >
                        <Icone size={15} />
                      </BotaoIcone>
                    ))}
                  </div>
                </Grupo>
              )}

              {temTexto && (
                <Grupo titulo={dict.social.textColor}>
                  <Cores atual={rgbParaHex(cs.color)} onEscolher={(cor) => aplicar((el) => (el.style.color = cor))} />
                </Grupo>
              )}

              {semTexto && (
                <Grupo titulo={dict.social.fillColor}>
                  <Cores
                    atual={rgbParaHex(cs.backgroundColor)}
                    onEscolher={(cor) => aplicar((el) => (el.style.background = cor))}
                  />
                </Grupo>
              )}

              {ehImg && (
                <button
                  onClick={() => setSeletorImagem("trocar")}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 hover:border-brand/50"
                >
                  <ImagePlus size={14} /> {dict.social.changeImage}
                </button>
              )}

              <Grupo titulo={`${dict.social.opacity} · ${Math.round(parseFloat(cs.opacity) * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(parseFloat(cs.opacity) * 100)}
                  onChange={(e) => {
                    if (selRef.current) selRef.current.style.opacity = String(Number(e.target.value) / 100);
                    redesenhar();
                  }}
                  onPointerUp={registrar}
                  onKeyUp={registrar}
                  className="w-full accent-[var(--brand)]"
                />
              </Grupo>

              <Grupo titulo={dict.social.positionAndLayer}>
                <div className="grid grid-cols-2 gap-1.5">
                  <BotaoTexto onClick={() => camada(1)} icone={<BringToFront size={14} />}>
                    {dict.social.bringForward}
                  </BotaoTexto>
                  <BotaoTexto onClick={() => camada(-1)} icone={<SendToBack size={14} />}>
                    {dict.social.sendBackward}
                  </BotaoTexto>
                  <BotaoTexto
                    onClick={() =>
                      aplicar((el) => {
                        el.style.translate = "";
                        el.style.width = "";
                        el.style.height = "";
                        el.style.maxWidth = "";
                      })
                    }
                    icone={<RotateCcw size={14} />}
                  >
                    {dict.social.originalPosition}
                  </BotaoTexto>
                  <BotaoTexto
                    onClick={() => {
                      const pai = sel!.parentElement;
                      if (pai && slideEl && pai !== slideEl && slideEl.contains(pai)) selecionar(pai);
                    }}
                    icone={<ArrowUpLeft size={14} />}
                    disabled={!sel!.parentElement || sel!.parentElement === slideEl}
                  >
                    {dict.social.outerBlock}
                  </BotaoTexto>
                </div>
                <p className="mt-2 text-xs text-muted">Arraste no slide para mover; setas movem 1px (Shift: 10px).</p>
              </Grupo>

              <div className="grid grid-cols-2 gap-1.5 border-t border-border pt-4">
                <BotaoTexto onClick={duplicar} icone={<CopyPlus size={14} />}>
                  {dict.social.duplicate}
                </BotaoTexto>
                <BotaoTexto onClick={apagar} icone={<Trash2 size={14} />} perigo>
                  {dict.social.deleteElement}
                </BotaoTexto>
              </div>
            </>
          ) : (
            <>
              <h3 className="font-semibold">{dict.social.slideOf} {slide + 1}</h3>
              <p className="text-xs text-muted">Clique num elemento do slide para editar. Duplo clique edita o texto.</p>

              <Grupo titulo={dict.social.background}>
                <div className="grid grid-cols-6 gap-1.5">
                  {FUNDOS.map((f) => (
                    <button
                      key={f.nome}
                      title={f.nome}
                      onClick={() => aplicar((el) => (el.style.background = f.valor), slideEl)}
                      className="aspect-square rounded-md border border-border hover:scale-105"
                      style={{ background: f.amostra ?? f.valor }}
                    />
                  ))}
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                  {dict.social.otherColor}
                  <input
                    type="color"
                    value={rgbParaHex(fundoAtual)}
                    onChange={(e) => aplicar((el) => (el.style.background = e.target.value), slideEl)}
                    className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
                  />
                </label>
              </Grupo>

              <Grupo titulo={dict.social.insert}>
                <div className="grid grid-cols-2 gap-1.5">
                  <BotaoTexto onClick={inserirTexto} icone={<Type size={14} />} disabled={!carregado}>
                    {dict.social.text}
                  </BotaoTexto>
                  <BotaoTexto onClick={() => setSeletorImagem("inserir")} icone={<ImagePlus size={14} />} disabled={!carregado}>
                    {dict.social.image}
                  </BotaoTexto>
                </div>
              </Grupo>

              <Grupo titulo={dict.social.slides}>
                <div className="grid grid-cols-2 gap-1.5">
                  <BotaoTexto onClick={() => acaoSlide("esquerda")} icone={<ChevronLeft size={14} />} disabled={slide <= 0}>
                    {dict.social.moveBefore}
                  </BotaoTexto>
                  <BotaoTexto onClick={() => acaoSlide("direita")} icone={<ChevronRight size={14} />} disabled={slide >= total - 1}>
                    {dict.social.moveAfter}
                  </BotaoTexto>
                  <BotaoTexto onClick={() => acaoSlide("duplicar")} icone={<Plus size={14} />}>
                    {dict.social.duplicateSlide}
                  </BotaoTexto>
                  <BotaoTexto onClick={() => acaoSlide("apagar")} icone={<Trash2 size={14} />} disabled={total <= 1} perigo>
                    {dict.social.deleteSlide}
                  </BotaoTexto>
                </div>
              </Grupo>

              <p className="border-t border-border pt-4 text-xs text-muted">
                {dict.social.editorSaveNotice}
              </p>
            </>
          )}
        </aside>
      </div>

      {seletorImagem && (
        <SeletorImagem
          base={`/api/social/posts/${post.pauta.slug}/${post.slug}/arte/imagens`}
          titulo={seletorImagem === "trocar" ? "Trocar imagem" : "Inserir imagem"}
          onEscolher={usarImagem}
          onFechar={() => setSeletorImagem(null)}
        />
      )}
    </div>
  );
}

// ---------- peças da UI ----------

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">{titulo}</div>
      {children}
    </div>
  );
}

function BotaoIcone({
  titulo,
  onClick,
  disabled,
  ativo,
  children,
}: {
  titulo: string;
  onClick: () => void;
  disabled?: boolean;
  ativo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md p-1.5 disabled:opacity-30 ${ativo ? "bg-brand/25 text-text" : "text-muted hover:bg-surface-2 hover:text-text"}`}
    >
      {children}
    </button>
  );
}

function BotaoTexto({
  onClick,
  icone,
  disabled,
  perigo,
  children,
}: {
  onClick: () => void;
  icone: React.ReactNode;
  disabled?: boolean;
  perigo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs disabled:opacity-40 ${
        perigo ? "text-danger hover:border-danger/60" : "hover:border-brand/50"
      }`}
    >
      {icone} {children}
    </button>
  );
}

function Cores({ atual, onEscolher }: { atual: string; onEscolher: (cor: string) => void }) {
  return (
    <>
      <div className="grid grid-cols-5 gap-1.5">
        {PALETA.map((c) => (
          <button
            key={c.cor}
            title={`${c.nome} ${c.cor}`}
            onClick={() => onEscolher(c.cor)}
            className={`aspect-square rounded-md border hover:scale-105 ${atual.toUpperCase() === c.cor ? "border-text ring-2 ring-brand-soft" : "border-border"}`}
            style={{ background: c.cor }}
          />
        ))}
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
        Outra cor
        <input
          type="color"
          value={atual.startsWith("#") && atual.length === 7 ? atual : "#000000"}
          onChange={(e) => onEscolher(e.target.value.toUpperCase())}
          className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
        />
        <span className="font-mono">{atual}</span>
      </label>
    </>
  );
}

function SeletorImagem({
  base,
  titulo,
  onEscolher,
  onFechar,
}: {
  base: string;
  titulo: string;
  onEscolher: (rel: string) => void;
  onFechar: () => void;
}) {
  const { dict } = useI18n();
  const [imagens, setImagens] = useState<{
    items?: Array<{ nome: string; url: string; categoria: string }>;
    biblioteca: string[];
    post: string[];
  } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(base)
      .then((r) => r.json())
      .then(setImagens)
      .catch(() => setErro("não foi possível listar as imagens"));
  }, [base]);

  async function enviar(f: File | undefined) {
    if (!f) return;
    setEnviando(true);
    setErro("");
    try {
      const form = new FormData();
      form.append("arquivo", f);
      const res = await fetch(base, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro no upload");
      onEscolher(json.path);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const grade = (lista: string[]) => (
    <div className="grid grid-cols-4 gap-2">
      {lista.map((p) => (
        <button
          key={p}
          onClick={() => onEscolher(p)}
          title={p.split("/").pop()}
          className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-border bg-[repeating-conic-gradient(#2a2638_0%_25%,#1f1c2b_0%_50%)] bg-[length:16px_16px] p-2 hover:border-brand"
        >
          <img src={wsUrl(p)} alt={p.split("/").pop()} className="max-h-full max-w-full object-contain" />
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onFechar}>
      <div className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{titulo}</h3>
          <button onClick={onFechar} className="text-muted hover:text-text" aria-label={dict.common.close}>
            <X size={16} />
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.gif,.svg"
          className="hidden"
          onChange={(e) => enviar(e.target.files?.[0])}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted hover:border-brand/50 hover:text-text"
        >
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Enviar foto ou imagem do computador
        </button>

        {!imagens ? (
          <p className="mt-4 text-sm text-muted">{dict.common.loading}</p>
        ) : (
          <>
            {imagens.post.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Enviadas para este Post</div>
                {grade(imagens.post)}
              </div>
            )}
            <div className="mt-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Galeria da Marca & Assets</div>
              {imagens.biblioteca.length > 0 ? (
                imagens.items && imagens.items.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {imagens.items.map((item) => (
                    <button
                      key={item.url}
                      onClick={() => onEscolher(item.url)}
                      title={`${item.nome} (${item.categoria})`}
                      className="group relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2/40 p-2 hover:border-brand"
                    >
                      <img src={wsUrl(item.url)} alt={item.nome} className="max-h-full max-w-full object-contain" />
                      <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/70 px-1 text-[9px] text-white">
                        {item.categoria === "logo" ? "Logotipo" : item.nome}
                      </span>
                    </button>
                  ))}
                </div>
              ) : grade(imagens.biblioteca)
              ) : (
                <p className="text-sm text-muted">Nenhum asset na Galeria da Marca ainda.</p>
              )}
            </div>
          </>
        )}
        {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}
      </div>
    </div>
  );
}
