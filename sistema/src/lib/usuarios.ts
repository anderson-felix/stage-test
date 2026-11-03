import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (senha: string, sal: Buffer, tamanho: number) => Promise<Buffer>;

export type Papel = "admin" | "membro";

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  /** Senha provisória: obriga a trocar no próximo acesso. */
  trocarSenha: boolean;
  criadoEm: string;
  /** Sessões emitidas antes disso são recusadas (troca de senha, desativação). */
  sessoesDesde: number;
  senhaHash: string;
};

export type UsuarioPublico = Omit<Usuario, "senhaHash" | "sessoesDesde">;

export const SENHA_MIN = 8;

/** Pasta de dados do hub (fora do workspace e do git): usuários e afins. */
export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR || "data");
}

const arquivo = () => path.join(dataDir(), "usuarios.json");

// Cache pelo mtime: o proxy consulta a lista a cada requisição.
let cache: { mtime: number; lista: Usuario[] } | null = null;

export async function listarUsuarios(): Promise<Usuario[]> {
  let mtime: number;
  try {
    mtime = (await fs.stat(/*turbopackIgnore: true*/ arquivo())).mtimeMs;
  } catch {
    return [];
  }
  if (cache?.mtime === mtime) return cache.lista;
  const lista = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ arquivo(), "utf8")) as Usuario[];
  cache = { mtime, lista };
  return lista;
}

// Gravações em fila, para duas mudanças simultâneas não se sobrescreverem.
let fila: Promise<unknown> = Promise.resolve();

function alterar<T>(fn: (lista: Usuario[]) => Promise<T> | T): Promise<T> {
  const job = fila.then(async () => {
    const lista = [...(await listarUsuarios())];
    const resultado = await fn(lista);
    await fs.mkdir(/*turbopackIgnore: true*/ dataDir(), { recursive: true });
    const tmp = `${arquivo()}.tmp`;
    await fs.writeFile(/*turbopackIgnore: true*/ tmp, JSON.stringify(lista, null, 2), "utf8");
    await fs.rename(/*turbopackIgnore: true*/ tmp, arquivo());
    cache = null;
    return resultado;
  });
  fila = job.catch(() => undefined);
  return job;
}

export function publico(u: Usuario): UsuarioPublico {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { senhaHash, sessoesDesde, ...resto } = u;
  return resto;
}

async function hash(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const chave = await scrypt(senha, sal, 64);
  return `scrypt:${sal.toString("hex")}:${chave.toString("hex")}`;
}

async function confere(senha: string, guardado: string): Promise<boolean> {
  const [alg, salHex, chaveHex] = guardado.split(":");
  if (alg !== "scrypt" || !salHex || !chaveHex) return false;
  const esperado = Buffer.from(chaveHex, "hex");
  const chave = await scrypt(senha, Buffer.from(salHex, "hex"), esperado.length);
  return timingSafeEqual(chave, esperado);
}

const normalizarEmail = (email: string) => email.trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validar(nome: string, email: string, senha?: string) {
  if (!nome.trim()) throw new Error("informe o nome");
  if (!EMAIL.test(normalizarEmail(email))) throw new Error("e-mail inválido");
  if (senha !== undefined && senha.length < SENHA_MIN) throw new Error(`a senha precisa ter ${SENHA_MIN}+ caracteres`);
}

/** Senha provisória legível (sem 0/O, 1/l). */
export function senhaProvisoria(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function criarUsuario(dados: {
  nome: string;
  email: string;
  papel: Papel;
  senha: string;
  trocarSenha: boolean;
}): Promise<Usuario> {
  validar(dados.nome, dados.email, dados.senha);
  const senhaHash = await hash(dados.senha);
  return alterar((lista) => {
    const email = normalizarEmail(dados.email);
    if (lista.some((u) => u.email === email)) throw new Error("já existe um usuário com esse e-mail");
    const novo: Usuario = {
      id: randomUUID(),
      nome: dados.nome.trim(),
      email,
      papel: dados.papel,
      ativo: true,
      trocarSenha: dados.trocarSenha,
      criadoEm: new Date().toISOString(),
      sessoesDesde: 0,
      senhaHash,
    };
    lista.push(novo);
    return novo;
  });
}

/** Confere e-mail e senha. Devolve o usuário ativo ou null (sem dizer qual dos dois errou). */
export async function autenticar(email: string, senha: string): Promise<Usuario | null> {
  const u = (await listarUsuarios()).find((x) => x.email === normalizarEmail(email));
  if (!u) {
    await hash(senha); // mesmo custo de tempo quando o e-mail não existe
    return null;
  }
  if (!(await confere(senha, u.senhaHash)) || !u.ativo) return null;
  return u;
}

export async function buscarUsuario(id: string): Promise<Usuario | null> {
  return (await listarUsuarios()).find((u) => u.id === id) ?? null;
}

/** A sessão (id + momento de emissão, em segundos) ainda vale? */
export async function sessaoValida(id: string, emitidaEm: number): Promise<Usuario | null> {
  const u = await buscarUsuario(id);
  if (!u || !u.ativo || emitidaEm * 1000 < u.sessoesDesde) return null;
  return u;
}

export type MudancaUsuario = { nome?: string; papel?: Papel; ativo?: boolean; senha?: string; trocarSenha?: boolean };

export async function alterarUsuario(id: string, m: MudancaUsuario): Promise<Usuario> {
  if (m.senha !== undefined && m.senha.length < SENHA_MIN) throw new Error(`a senha precisa ter ${SENHA_MIN}+ caracteres`);
  if (m.nome !== undefined && !m.nome.trim()) throw new Error("informe o nome");
  const senhaHash = m.senha !== undefined ? await hash(m.senha) : undefined;
  return alterar((lista) => {
    const i = lista.findIndex((u) => u.id === id);
    if (i < 0) throw new Error("usuário não encontrado");
    const atual = lista[i];
    const novo: Usuario = { ...atual };
    if (m.nome !== undefined) novo.nome = m.nome.trim();
    if (m.papel !== undefined) novo.papel = m.papel;
    if (m.ativo !== undefined) novo.ativo = m.ativo;
    if (m.trocarSenha !== undefined) novo.trocarSenha = m.trocarSenha;
    if (senhaHash) novo.senhaHash = senhaHash;
    // Senha nova ou desativação derrubam as sessões abertas.
    if (senhaHash || m.ativo === false) novo.sessoesDesde = Date.now() - 1000;

    const adminsAtivos = lista.map((u, j) => (j === i ? novo : u)).filter((u) => u.papel === "admin" && u.ativo);
    if (adminsAtivos.length === 0) throw new Error("o hub precisa de pelo menos um administrador ativo");
    lista[i] = novo;
    return novo;
  });
}
