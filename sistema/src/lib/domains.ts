import { randomUUID } from "node:crypto";
import { atualizarLP } from "./lp";
import dns from "node:dns/promises";
import tls from "node:tls";
import { randomBytes } from "node:crypto";
import { domainToASCII, domainToUnicode } from "node:url";
import { DnsStatus, LPStatus, Prisma, SslStatus } from "@prisma/client";
import {
  getAppRuntimeConfig,
  isAppPanelHost,
  isFallbackDomainReference,
  isValidIpv4,
  parseAndValidateHost,
  resolveCaddyTlsProbeTarget,
  resolveTenantFallbackDomain,
  type DomainRoutingMode,
  type DomainTlsProvider,
} from "./config";
import prisma from "./prisma";
import { checkRateLimit, invalidateDomainMapping, normalizeHostname } from "./redis";

export class DomainValidationError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DomainValidationError";
    this.statusCode = statusCode;
  }
}

export class DomainConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = "DomainConflictError";
  }
}

export class DomainConcurrencyError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = "DomainConcurrencyError";
  }
}

export class DomainRateLimitError extends Error {
  readonly statusCode = 429;
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number = 60) {
    super(message);
    this.name = "DomainRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type DnsInstructionRecord = {
  type: "A" | "CNAME" | "TXT" | "ALIAS/ANAME";
  host: string;
  fqdn: string;
  zoneApex: string;
  delegatedHost: string;
  value: string;
  ttl: string;
  purpose: string;
};

export type CustomDomainWithInstructions = {
  id: string;
  tenantId: string;
  domain: string;
  isSubdomain: boolean;
  zoneApex: string;
  registrableDomain: string;
  dnsProviderHint: string | null;
  verificationToken: string;
  routingMode: DomainRoutingMode;
  routingTarget: string;
  targetIpv4: string | null;
  tlsProvider: DomainTlsProvider;
  cnameTarget: string | null;
  dnsStatus: DnsStatus;
  sslStatus: SslStatus;
  isDefault: boolean;
  homeLandingPageId?: string | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  checkAttempts: number;
  consecutiveFailures: number;
  lastReasonCode: string | null;
  lastError: string | null;
  createdAt: string;
  records: DnsInstructionRecord[];
  azureFrontDoorNote?: string;
};

/**
 * Regras da Public Suffix List (ICANN / NIC.br / ccSLDs globais) para determinação
 * precisa do sufixo público (eTLD) e do domínio registrável (eTLD+1).
 */
const PUBLIC_SUFFIX_SECOND_LEVEL_BY_TLD: Record<string, ReadonlySet<string>> = {
  br: new Set([
    "abc", "adm", "adv", "agr", "aju", "am", "anani", "aparecida", "app", "arq",
    "art", "ato", "b", "barueri", "belem", "bhz", "bib", "bio", "blog", "bmd",
    "boavista", "bsb", "campinagrande", "campinas", "caxias", "cim", "cng", "cnt",
    "com", "contagem", "coop", "coz", "cri", "cuiaba", "curitiba", "def", "des",
    "det", "dev", "ecn", "eco", "edu", "emp", "enf", "eng", "esp", "etc", "eti",
    "far", "feira", "flog", "floripa", "fm", "fnd", "fortal", "fot", "foz", "fst",
    "g12", "ggf", "goiania", "gov", "gru", "imb", "ind", "inf", "jab", "jampa",
    "jdf", "joinville", "jor", "jus", "leg", "lel", "log", "londrina", "macapa",
    "maceio", "manaus", "maringa", "mat", "med", "mil", "morena", "mp", "mus",
    "natal", "net", "niteroi", "nom", "not", "ntr", "odo", "ong", "org", "osasco",
    "palmas", "poa", "ppg", "pro", "psc", "psi", "pvh", "qsl", "radio", "rec",
    "recife", "ribeirao", "rio", "riobranco", "riopreto", "salvador", "sampa",
    "santamaria", "santoandre", "saobernardo", "saogoncalo", "sjc", "slg", "slz",
    "sorocaba", "srv", "taxi", "tc", "teo", "the", "tmp", "trd", "tur", "tv",
    "udi", "vet", "vix", "vlog", "wiki", "zlg",
  ]),
  uk: new Set(["ac", "co", "gov", "ltd", "me", "net", "nhs", "org", "plc", "police", "sch"]),
  au: new Set(["asn", "com", "edu", "gov", "id", "net", "org"]),
  nz: new Set(["ac", "co", "geek", "gen", "govt", "health", "iwi", "kiwi", "maori", "mil", "net", "org", "parliament", "school"]),
  jp: new Set(["ac", "ad", "co", "ed", "go", "gr", "lg", "ne", "or"]),
  ar: new Set(["bet", "com", "coop", "edu", "gob", "gov", "int", "mil", "musica", "mutual", "net", "org", "senasa", "tur"]),
  mx: new Set(["com", "edu", "gob", "net", "org"]),
  co: new Set(["arts", "com", "edu", "firm", "gov", "info", "int", "mil", "net", "nom", "org", "rec", "web"]),
  pe: new Set(["com", "edu", "gob", "mil", "net", "nom", "org"]),
  uy: new Set(["com", "edu", "gub", "mil", "net", "org"]),
  py: new Set(["com", "coop", "edu", "gov", "mil", "net", "org"]),
  bo: new Set(["academia", "agro", "arte", "blog", "bolivia", "ciencia", "com", "cooperativa", "democracia", "deporte", "ecologia", "economia", "edu", "empresa", "gob", "ind", "info", "int", "med", "mil", "musica", "natural", "nombre", "noticias", "org", "plurinacional", "politica", "profesional", "pueblo", "revista", "salud", "tecnologia", "tksat", "transporte", "tv", "web", "wiki"]),
  ec: new Set(["com", "edu", "fin", "gob", "gov", "info", "k12", "med", "mil", "net", "org", "pro"]),
  ve: new Set(["arts", "Bib", "co", "com", "edu", "firm", "gob", "gov", "info", "int", "mil", "net", "nom", "org", "rar", "rec", "store", "tec", "web"]),
  cl: new Set(["co", "gob", "gov", "mil"]),
  pt: new Set(["com", "edu", "gov", "int", "net", "nome", "org", "publ"]),
  es: new Set(["com", "edu", "gob", "nom", "org"]),
  za: new Set(["ac", "agric", "alt", "co", "edu", "gov", "grondar", "law", "mil", "net", "ngo", "nic", "nis", "nom", "org", "school", "tm", "web"]),
  in: new Set(["5g", "6g", "ac", "ai", "am", "bihar", "biz", "business", "ca", "cn", "co", "com", "coop", "cs", "delhi", "dr", "edu", "er", "firm", "gen", "gov", "gujarat", "ind", "info", "int", "internet", "io", "me", "mil", "net", "org", "pg", "post", "pro", "res", "travel", "tv", "uk", "up", "us"]),
  sg: new Set(["com", "edu", "gov", "net", "org", "per"]),
  hk: new Set(["com", "edu", "gov", "idv", "net", "org"]),
  tw: new Set(["club", "com", "ebiz", "edu", "game", "gov", "idv", "mil", "net", "org"]),
  kr: new Set(["ac", "busan", "chungbuk", "chungnam", "co", "daegu", "daejeon", "es", "gangwon", "go", "gwangju", "gyeongbuk", "gyeonggi", "gyeongnam", "hs", "incheon", "jeju", "jeonbuk", "jeonnam", "kg", "mil", "ms", "ne", "or", "pe", "re", "sc", "seoul", "ulsan"]),
  cn: new Set(["ac", "ah", "bj", "com", "cq", "edu", "fj", "gd", "gov", "gs", "gx", "gz", "ha", "hb", "he", "hi", "hk", "hl", "hn", "jl", "js", "jx", "ln", "mil", "mo", "net", "nm", "nx", "org", "qh", "sc", "sd", "sh", "sn", "sx", "tj", "tw", "xj", "xz", "yn", "zj"]),
  tr: new Set(["av", "bbs", "bel", "biz", "com", "dr", "edu", "gen", "gov", "info", "k12", "kep", "mil", "name", "net", "org", "pol", "tel", "tsk", "tv", "web"]),
  il: new Set(["ac", "co", "gov", "idf", "k12", "muni", "net", "org"]),
  id: new Set(["ac", "biz", "co", "desa", "go", "mil", "my", "net", "or", "ponpes", "sch", "web"]),
  my: new Set(["biz", "com", "edu", "gov", "mil", "name", "net", "org"]),
  ph: new Set(["com", "edu", "gov", "i", "mil", "net", "ngo", "org"]),
  vn: new Set(["ac", "biz", "com", "edu", "gov", "health", "info", "int", "name", "net", "org", "pro"]),
  th: new Set(["ac", "co", "go", "in", "mi", "net", "or"]),
  ua: new Set(["com", "edu", "gov", "in", "net", "org"]),
  pl: new Set(["aid", "agro", "atm", "auto", "biz", "com", "edu", "gmina", "gsm", "info", "mail", "miasto", "media", "mil", "net", "nieruchomosci", "nom", "org", "pc", "powiat", "priv", "realestate", "rel", "sex", "shop", "sklep", "sos", "szkola", "targi", "tm", "tourism", "travel", "turystyka"]),
  at: new Set(["ac", "co", "gv", "or"]),
  gr: new Set(["com", "edu", "gov", "mil", "net", "org"]),
  sa: new Set(["com", "edu", "gov", "med", "net", "org", "pub", "sch"]),
  ae: new Set(["ac", "co", "gov", "mil", "net", "org", "sch"]),
  eg: new Set(["com", "edu", "eun", "gov", "mil", "name", "net", "org", "sci"]),
  ng: new Set(["com", "edu", "gov", "i", "mil", "mobi", "name", "net", "org", "sch"]),
  ke: new Set(["ac", "co", "go", "info", "me", "mobi", "ne", "or", "sc"]),
};

const PUBLIC_SUFFIX_WILDCARD_TLDS = new Set([
  "bd", "BN", "bt", "ck", "cy", "er", "et", "fk", "gu", "jm", "kh", "kw",
  "lb", "mm", "mt", "mz", "ni", "np", "om", "pa", "pg", "qa", "sb", "sv",
  "tz", "ye", "zm", "zw",
].map((s) => s.toLowerCase()));

const PUBLIC_SUFFIX_EXCEPTIONS = new Set([
  "www.ck",
  "city.kawasaki.jp",
  "city.kitakyushu.jp",
  "city.kobe.jp",
  "city.nagoya.jp",
  "city.sapporo.jp",
  "city.sendai.jp",
  "city.yokohama.jp",
]);

/**
 * Resolve o sufixo público (eTLD) de um hostname canônico segundo as regras da Public Suffix List.
 */
export function resolvePublicSuffix(canonicalHostname: string): string {
  const labels = canonicalHostname.toLowerCase().split(".").filter(Boolean);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];

  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];

  if (labels.length >= 3) {
    const lastThree = labels.slice(-3).join(".");
    if (PUBLIC_SUFFIX_EXCEPTIONS.has(lastThree)) {
      return `${sld}.${tld}`;
    }
    // Caso especial .nom.br (3 níveis de sufixo público no Brasil: <id>.nom.br)
    if (tld === "br" && sld === "nom" && labels.length >= 3) {
      return `${labels[labels.length - 3]}.nom.br`;
    }
  }

  if (PUBLIC_SUFFIX_WILDCARD_TLDS.has(tld)) {
    return `${sld}.${tld}`;
  }

  const secondLevelSet = PUBLIC_SUFFIX_SECOND_LEVEL_BY_TLD[tld];
  if (secondLevelSet && secondLevelSet.has(sld)) {
    return `${sld}.${tld}`;
  }

  return tld;
}

export type ParsedCustomDomainZone = {
  canonicalDomain: string;
  publicSuffix: string;
  registrableDomain: string;
  /** Compatibilidade legada: equivale ao `registrableDomain` (eTLD+1). */
  rootDomain: string;
  /** True quando `canonicalDomain` possui labels à esquerda do `registrableDomain` (eTLD+1). */
  isSubdomain: boolean;
  /** Zona DNS de referência usada para calcular nomes relativos (`hostLabel`). */
  zoneApex: string;
  /**
   * False quando `zoneApex` foi apenas inferido do `registrableDomain` (PSL),
   * pois um subdomínio pode ser uma zona delegada própria no servidor DNS autoritativo.
   */
  isAuthoritativeZoneConfirmed: boolean;
  /** True quando `canonicalDomain` coincide com o próprio ápice da zona (`zoneApex`). */
  isZoneApex: boolean;
  /** Nome relativo do host dentro de `zoneApex` ("@" no ápice ou prefixo relativo, ex.: "lp"). */
  hostLabel: string;
  /** Nome relativo do registro TXT dentro de `zoneApex` ("_stage-verify" ou "_stage-verify.<hostLabel>"). */
  txtHostRelative: string;
  /** Nome absoluto (FQDN) invariável do registro TXT ("_stage-verify.<canonicalDomain>"). */
  txtHostFqdn: string;
  /** Zonas candidatas possíveis (da mais específica delegada até o `registrableDomain`). */
  candidateZones: string[];
};

/**
 * Valida estritamente e normaliza um hostname de domínio de cliente:
 * - Aceita domínio raiz (apex) e subdomínios;
 * - Normaliza letras maiúsculas, ponto final DNS (`.`) e IDN (Punycode ASCII);
 * - Recusa IP (IPv4/IPv6), `localhost`, host do painel, protocolos, credenciais, portas,
 *   caminhos, query/fragmento, wildcard (`*`), labels inválidos e sufixos públicos puros.
 */
export function parseCustomDomainHostname(
  rawInput: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    zoneApex?: string | null;
  }
): ParsedCustomDomainZone {
  if (typeof rawInput !== "string") {
    throw new DomainValidationError("Informe um domínio válido (ex.: lp.suaempresa.com.br)");
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new DomainValidationError("Informe um domínio válido (ex.: lp.suaempresa.com.br)");
  }

  if (/\s/.test(trimmed) || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new DomainValidationError("O domínio não pode conter espaços ou caracteres de controle");
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith("//")) {
    throw new DomainValidationError(
      "Informe apenas o domínio, sem protocolo (http:// ou https://)"
    );
  }

  if (trimmed.includes("@")) {
    throw new DomainValidationError("O domínio não pode conter credenciais (@)");
  }

  if (trimmed.includes(":") || trimmed.includes("[") || trimmed.includes("]")) {
    throw new DomainValidationError("O domínio não pode conter porta (:80/:443) ou endereço IPv6");
  }

  if (/[\/\\?#]/.test(trimmed)) {
    throw new DomainValidationError(
      "O domínio não pode conter caminhos (/), parâmetros (?) ou fragmentos (#)"
    );
  }

  if (trimmed.includes("*")) {
    throw new DomainValidationError("Domínios curinga (wildcard *) não são permitidos");
  }

  if (
    trimmed.startsWith(".") ||
    trimmed.includes("..") ||
    /[\u3002\uff0e\uff61]/.test(trimmed)
  ) {
    throw new DomainValidationError("Formato de domínio inválido (labels vazios ou pontos consecutivos)");
  }

  // Normaliza ponto final único do DNS (FQDN)
  const withoutTrailingDot = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  if (!withoutTrailingDot) {
    throw new DomainValidationError("Informe um domínio válido");
  }

  const lowerRaw = withoutTrailingDot.toLowerCase();
  if (lowerRaw === "localhost" || lowerRaw.endsWith(".localhost")) {
    throw new DomainValidationError("Localhost não pode ser cadastrado como domínio de cliente");
  }

  if (isValidIpv4(lowerRaw) || /^\d+(\.\d+)*$/.test(lowerRaw)) {
    throw new DomainValidationError(
      "Endereços IP não podem ser cadastrados como domínio de Landing Page"
    );
  }

  if (!lowerRaw.includes(".")) {
    throw new DomainValidationError("Informe um domínio completo com sufixo válido (ex.: suaempresa.com.br)");
  }

  const rawLabels = lowerRaw.split(".");
  for (const rl of rawLabels) {
    if (
      !rl ||
      rl.startsWith("-") ||
      rl.endsWith("-") ||
      /[_!$&'()*+,;=~"<>^`{|}]/.test(rl)
    ) {
      throw new DomainValidationError(
        `Label de domínio inválido ("${rl}"): não use sublinhados (_), símbolos ou hífens no início/fim`
      );
    }
  }

  const canonicalDomain = domainToASCII(lowerRaw);
  if (!canonicalDomain || canonicalDomain.length > 253) {
    throw new DomainValidationError("Domínio ou caracteres internacionalizados (IDN) inválidos");
  }

  const labels = canonicalDomain.split(".");
  if (labels.length < 2) {
    throw new DomainValidationError("Informe um domínio válido com pelo menos dois níveis");
  }

  for (const label of labels) {
    if (
      label.length < 1 ||
      label.length > 63 ||
      !/^[a-z0-9-]+$/.test(label) ||
      label.startsWith("-") ||
      label.endsWith("-")
    ) {
      throw new DomainValidationError(`Label de domínio inválido: "${label}"`);
    }
    if (label.startsWith("xn--")) {
      if (label.length <= 4) {
        throw new DomainValidationError(`Label IDN/Punycode inválido: "${label}"`);
      }
      const decoded = domainToUnicode(label);
      if (!decoded || decoded === label || decoded.includes("\ufffd")) {
        throw new DomainValidationError(`Label IDN/Punycode malformado: "${label}"`);
      }
    } else if (label.length >= 4 && label.slice(2, 4) === "--") {
      throw new DomainValidationError(`Prefixo ACE inválido no label: "${label}"`);
    }
  }

  const tld = labels[labels.length - 1];
  if (/^\d+$/.test(tld) || isValidIpv4(canonicalDomain)) {
    throw new DomainValidationError(
      "Endereços IP ou TLDs numéricos não são permitidos como domínio de cliente"
    );
  }

  if (
    canonicalDomain === "localhost" ||
    canonicalDomain.endsWith(".localhost") ||
    canonicalDomain.endsWith(".local") ||
    canonicalDomain.endsWith(".internal") ||
    canonicalDomain.endsWith(".invalid")
  ) {
    throw new DomainValidationError("Domínio local ou reservado não é permitido");
  }

  const env = options?.env ?? process.env;
  const cfg = getAppRuntimeConfig(env);
  if (
    canonicalDomain === cfg.appPanelCleanHost ||
    isAppPanelHost(canonicalDomain, canonicalDomain, env)
  ) {
    throw new DomainValidationError(
      "O host do painel não pode ser cadastrado como domínio de cliente"
    );
  }

  if (
    canonicalDomain === "stage.consult" ||
    canonicalDomain.endsWith(".stage.consult")
  ) {
    throw new DomainValidationError("Use um domínio próprio da sua empresa");
  }

  if (cfg.cnameTarget) {
    const cleanCnameTarget = cfg.cnameTarget.trim().toLowerCase().replace(/\.$/, "");
    if (canonicalDomain === cleanCnameTarget) {
      throw new DomainValidationError(
        "O alvo técnico de CNAME não pode ser cadastrado como domínio de cliente"
      );
    }
  }

  const publicSuffix = resolvePublicSuffix(canonicalDomain);
  const suffixLabels = publicSuffix.split(".");
  if (labels.length <= suffixLabels.length) {
    throw new DomainValidationError(
      `"${canonicalDomain}" é um sufixo público de registro e não um domínio registrável`
    );
  }

  const registrableLabelCount = suffixLabels.length + 1;
  const registrableDomain = labels.slice(labels.length - registrableLabelCount).join(".");
  const isSubdomain = canonicalDomain !== registrableDomain;

  // Lista todas as possíveis zonas autoritativas (do próprio host até o domínio registrável eTLD+1),
  // pois subdomínios podem estar delegados em zonas DNS próprias.
  const candidateZones: string[] = [];
  for (let i = 0; i <= labels.length - registrableLabelCount; i++) {
    candidateZones.push(labels.slice(i).join("."));
  }

  let zoneApex = registrableDomain;
  let isAuthoritativeZoneConfirmed = false;

  if (options?.zoneApex && options.zoneApex.trim()) {
    const parsedZone = parseCustomDomainHostname(options.zoneApex, { env });
    const candidateZone = parsedZone.canonicalDomain;
    const isWithinRegistrable =
      candidateZone === registrableDomain ||
      candidateZone.endsWith(`.${registrableDomain}`);
    const isAncestorOrSelfOfDomain =
      canonicalDomain === candidateZone ||
      canonicalDomain.endsWith(`.${candidateZone}`);

    if (!isWithinRegistrable || !isAncestorOrSelfOfDomain) {
      throw new DomainValidationError(
        `A zona DNS informada ("${candidateZone}") não corresponde ao domínio "${canonicalDomain}"`
      );
    }
    zoneApex = candidateZone;
    isAuthoritativeZoneConfirmed = true;
  }

  const isZoneApex = canonicalDomain === zoneApex;
  const hostLabel = isZoneApex
    ? "@"
    : canonicalDomain.slice(0, -(zoneApex.length + 1));

  const txtHostFqdn = `_stage-verify.${canonicalDomain}`;
  const txtHostRelative =
    hostLabel === "@" ? "_stage-verify" : `_stage-verify.${hostLabel}`;

  // Confirmação final de mapeamento canônico com o normalizador de runtime
  if (normalizeHostname(canonicalDomain) !== canonicalDomain) {
    throw new DomainValidationError("Falha ao confirmar o mapeamento canônico do domínio");
  }

  return {
    canonicalDomain,
    publicSuffix,
    registrableDomain,
    rootDomain: registrableDomain,
    isSubdomain,
    zoneApex,
    isAuthoritativeZoneConfirmed,
    isZoneApex,
    hostLabel,
    txtHostRelative,
    txtHostFqdn,
    candidateZones,
  };
}

export function detectIsSubdomain(
  domain: string,
  options?: { zoneApex?: string | null; env?: NodeJS.ProcessEnv }
): ParsedCustomDomainZone {
  return parseCustomDomainHostname(domain, options);
}

export type ResolvedDomainRoutingContract = {
  routingMode: DomainRoutingMode;
  routingTarget: string;
  targetIpv4: string | null;
  cnameTarget: string | null;
  tlsProvider: DomainTlsProvider;
};

/**
 * Resolve o contrato de destino de roteamento DNS e provedor TLS de forma desacoplada:
 * - No modo "direct-ip", exige `DOMAIN_TARGET_IPV4` válido, define `cnameTarget: null`
 *   (ignorando `cnameTarget` legado salvo em registros antigos) e usa registro `A`.
 * - No modo "cname", exige um hostname DNS válido em `CNAME_TARGET` (nunca aceita um IP)
 *   e preserva a semântica de `CNAME` (subdomínio) / `ALIAS/ANAME` (ápice da zona).
 */
export function resolveDomainRoutingContract(
  domainRow?: { cnameTarget?: string | null },
  options?: {
    env?: NodeJS.ProcessEnv;
    routingMode?: DomainRoutingMode;
    targetIpv4?: string | null;
    cnameTarget?: string | null;
    tlsProvider?: DomainTlsProvider;
  }
): ResolvedDomainRoutingContract {
  const env = options?.env ?? process.env;
  const cfg = getAppRuntimeConfig(env);

  const routingMode = options?.routingMode ?? cfg.domainRoutingMode;
  const tlsProvider = options?.tlsProvider ?? cfg.domainTlsProvider;

  if (routingMode === "direct-ip") {
    const rawIpv4 = options?.targetIpv4 ?? cfg.domainTargetIpv4;
    if (!rawIpv4 || !isValidIpv4(rawIpv4)) {
      throw new DomainValidationError(
        "Configuração inválida: DOMAIN_TARGET_IPV4 deve ser um endereço IPv4 válido no modo direct-ip."
      );
    }
    return {
      routingMode: "direct-ip",
      routingTarget: rawIpv4,
      targetIpv4: rawIpv4,
      cnameTarget: null,
      tlsProvider,
    };
  }

  // Modo "cname": valida que o alvo seja estritamente um hostname DNS e nunca um IP
  const rawCname = (
    options?.cnameTarget ??
    cfg.cnameTarget ??
    domainRow?.cnameTarget ??
    "domains.stage.consult"
  )
    .trim()
    .replace(/\.$/, "");

  if (!rawCname || isValidIpv4(rawCname) || /^\d+(\.\d+)*$/.test(rawCname)) {
    throw new DomainValidationError(
      `Configuração inválida: CNAME_TARGET ("${rawCname}") deve ser um hostname DNS válido, nunca um endereço IP.`
    );
  }

  const parsedCname = parseAndValidateHost(rawCname);
  if (!parsedCname.isValid || parsedCname.port || !parsedCname.cleanHost.includes(".")) {
    throw new DomainValidationError(
      `Configuração inválida: CNAME_TARGET ("${rawCname}") não é um hostname DNS válido.`
    );
  }

  return {
    routingMode: "cname",
    routingTarget: parsedCname.cleanHost,
    targetIpv4: null,
    cnameTarget: parsedCname.cleanHost,
    tlsProvider,
  };
}

export function buildDnsInstructions(
  domainRow: {
    domain: string;
    isSubdomain?: boolean;
    cnameTarget?: string | null;
    verificationToken: string;
    zoneApex?: string | null;
  },
  options?: {
    env?: NodeJS.ProcessEnv;
    zoneApex?: string | null;
    routingMode?: DomainRoutingMode;
    targetIpv4?: string | null;
    cnameTarget?: string | null;
    tlsProvider?: DomainTlsProvider;
  }
): DnsInstructionRecord[] {
  const env = options?.env ?? process.env;
  const parsed = detectIsSubdomain(domainRow.domain, {
    env,
    zoneApex: options?.zoneApex ?? domainRow.zoneApex,
  });
  const contract = resolveDomainRoutingContract(domainRow, options);
  const records: DnsInstructionRecord[] = [];

  if (contract.routingMode === "direct-ip") {
    records.push({
      type: "A",
      host: parsed.hostLabel,
      fqdn: parsed.canonicalDomain,
      zoneApex: parsed.zoneApex,
      delegatedHost: "@",
      value: contract.targetIpv4!,
      ttl: "3600 (ou Automático)",
      purpose: parsed.isZoneApex
        ? `Aponta o domínio ${parsed.canonicalDomain} (host "${parsed.hostLabel}" na zona ${parsed.zoneApex}) diretamente para o IPv4 da Stage (${contract.targetIpv4}).`
        : parsed.isAuthoritativeZoneConfirmed
          ? `Aponta ${parsed.canonicalDomain} (host "${parsed.hostLabel}" na zona delegada ${parsed.zoneApex}, nome completo ${parsed.canonicalDomain}) diretamente para o IPv4 da Stage (${contract.targetIpv4}).`
          : `Aponta ${parsed.canonicalDomain} (nome completo ${parsed.canonicalDomain}; host relativo "${parsed.hostLabel}" na zona ${parsed.zoneApex}, ou "@" se ${parsed.canonicalDomain} for uma zona delegada própria) para o IPv4 da Stage (${contract.targetIpv4}).`,
    });
  } else if (!parsed.isZoneApex) {
    records.push({
      type: "CNAME",
      host: parsed.hostLabel,
      fqdn: parsed.canonicalDomain,
      zoneApex: parsed.zoneApex,
      delegatedHost: "@",
      value: contract.cnameTarget!,
      ttl: "3600 (ou Automático)",
      purpose: parsed.isAuthoritativeZoneConfirmed
        ? `Aponta ${parsed.canonicalDomain} (host "${parsed.hostLabel}" na zona ${parsed.zoneApex}, nome completo ${parsed.canonicalDomain}) para ${contract.cnameTarget}.`
        : `Aponta ${parsed.canonicalDomain} (nome completo ${parsed.canonicalDomain}; host relativo "${parsed.hostLabel}" se a zona autoritativa for ${parsed.zoneApex}, ou "@" se ${parsed.canonicalDomain} for uma zona delegada própria) para ${contract.cnameTarget}.`,
    });
  } else {
    records.push({
      type: "ALIAS/ANAME",
      host: "@",
      fqdn: parsed.canonicalDomain,
      zoneApex: parsed.zoneApex,
      delegatedHost: "@",
      value: contract.cnameTarget!,
      ttl: "3600 (ou Automático)",
      purpose:
        `Ápice da zona DNS (${parsed.canonicalDomain}): use CNAME Flattening (Cloudflare) ou ALIAS/ANAME para ${contract.cnameTarget}. Se seu provedor (ex.: Registro.br) não suportar CNAME na raiz, recomendamos usar um subdomínio como lp.` +
        parsed.registrableDomain,
    });
  }

  records.push({
    type: "TXT",
    host: parsed.txtHostRelative,
    fqdn: parsed.txtHostFqdn,
    zoneApex: parsed.zoneApex,
    delegatedHost: "_stage-verify",
    value: domainRow.verificationToken,
    ttl: "3600 (ou Automático)",
    purpose:
      parsed.isSubdomain && !parsed.isAuthoritativeZoneConfirmed
        ? `Validação de propriedade (nome completo ${parsed.txtHostFqdn}): use "${parsed.txtHostRelative}" na zona ${parsed.zoneApex}, ou "_stage-verify" caso ${parsed.canonicalDomain} seja uma zona DNS delegada.`
        : `Validação de propriedade do domínio (nome completo ${parsed.txtHostFqdn} na zona ${parsed.zoneApex}) com o token exclusivo deste cadastro.`,
  });

  return records;
}

export function serializeDomain(
  row: {
    id: string;
    tenantId: string;
    domain: string;
    isSubdomain: boolean;
    dnsProviderHint: string | null;
    verificationToken: string;
    cnameTarget: string;
    dnsStatus: DnsStatus;
    sslStatus: SslStatus;
    isDefault: boolean;
    lastCheckedAt: Date | null;
    nextCheckAt?: Date | null;
    checkAttempts?: number | null;
    consecutiveFailures?: number | null;
    lastReasonCode?: string | null;
    lastError?: string | null;
    homeLandingPageId?: string | null;
    createdAt: Date;
    zoneApex?: string | null;
  },
  options?: {
    env?: NodeJS.ProcessEnv;
    zoneApex?: string | null;
  }
): CustomDomainWithInstructions {
  const env = options?.env ?? process.env;
  const parsed = detectIsSubdomain(row.domain, {
    env,
    zoneApex: options?.zoneApex ?? row.zoneApex,
  });
  const contract = resolveDomainRoutingContract(row, { env });

  return {
    id: row.id,
    tenantId: row.tenantId,
    domain: parsed.canonicalDomain,
    isSubdomain: parsed.isSubdomain,
    zoneApex: parsed.zoneApex,
    registrableDomain: parsed.registrableDomain,
    dnsProviderHint: row.dnsProviderHint,
    verificationToken: row.verificationToken,
    routingMode: contract.routingMode,
    routingTarget: contract.routingTarget,
    targetIpv4: contract.targetIpv4,
    tlsProvider: contract.tlsProvider,
    cnameTarget: contract.cnameTarget,
    dnsStatus: row.dnsStatus,
    sslStatus: row.sslStatus,
    isDefault: row.isDefault,
    homeLandingPageId: row.homeLandingPageId ?? null,
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    nextCheckAt: row.nextCheckAt ? row.nextCheckAt.toISOString() : null,
    checkAttempts: row.checkAttempts ?? 0,
    consecutiveFailures: row.consecutiveFailures ?? 0,
    lastReasonCode: row.lastReasonCode ?? null,
    lastError: row.lastError ?? null,
    createdAt: row.createdAt.toISOString(),
    records: buildDnsInstructions(row, {
      env,
      zoneApex: options?.zoneApex ?? row.zoneApex,
    }),
  };
}

export type AffectedFallbackLandingPage = {
  id: string;
  slug: string;
  title: string;
  status: string;
  customDomainId: string | null;
  historicalUrl: string | null;
  reason: "fallback_url_disabled" | "missing_verified_custom_domain";
  message: string;
};

/**
 * Identifica Landing Pages do tenant que possuem links históricos apontando para `.lp.stage.consult`
 * ou estão publicadas sem um domínio próprio verificado quando `LP_FALLBACK_ENABLED=false`,
 * sem alterar automaticamente o banco de dados.
 */
export async function findAffectedFallbackLandingPages(
  tenantId: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    verifiedDomainIds?: ReadonlySet<string>;
  }
): Promise<AffectedFallbackLandingPage[]> {
  const env = options?.env ?? process.env;
  const cfg = getAppRuntimeConfig(env);
  if (cfg.lpFallbackEnabled) {
    return [];
  }

  try {
    const lps = await prisma.landingPage.findMany({
      where: { tenantId },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        customDomainId: true,
        briefingData: true,
      },
      orderBy: { slug: "asc" },
    });

    let verifiedIds = options?.verifiedDomainIds;
    if (!verifiedIds) {
      const verifiedRows = await prisma.customDomain.findMany({
        where: { tenantId, dnsStatus: DnsStatus.VERIFIED },
        select: { id: true },
      });
      verifiedIds = new Set(verifiedRows.map((d) => d.id));
    }

    const affected: AffectedFallbackLandingPage[] = [];
    for (const lp of lps) {
      const bd =
        lp.briefingData &&
        typeof lp.briefingData === "object" &&
        !Array.isArray(lp.briefingData)
          ? (lp.briefingData as Record<string, unknown>)
          : {};
      const rawUrl = typeof bd.urlPublicada === "string" ? bd.urlPublicada.trim() : "";
      const hasFallbackUrl = rawUrl.length > 0 && isFallbackDomainReference(rawUrl, env);
      const isPublished = lp.status === "PUBLISHED" || bd.legacyStatus === "publicada";
      const hasVerifiedDomain = Boolean(
        lp.customDomainId && verifiedIds.has(lp.customDomainId)
      );

      if (hasFallbackUrl) {
        affected.push({
          id: lp.id,
          slug: lp.slug,
          title: lp.title,
          status: String(lp.status),
          customDomainId: lp.customDomainId,
          historicalUrl: rawUrl,
          reason: "fallback_url_disabled",
          message: `A LP "${lp.slug}" possui link histórico de fallback ("${rawUrl}") desativado neste ambiente. Reassocie explicitamente a um domínio próprio verificado.`,
        });
      } else if (isPublished && !hasVerifiedDomain) {
        affected.push({
          id: lp.id,
          slug: lp.slug,
          title: lp.title,
          status: String(lp.status),
          customDomainId: lp.customDomainId,
          historicalUrl: rawUrl || null,
          reason: "missing_verified_custom_domain",
          message: `A LP publicada "${lp.slug}" não está vinculada a um domínio próprio verificado. Reassocie explicitamente a um domínio verificado.`,
        });
      }
    }

    return affected;
  } catch {
    return [];
  }
}

/**
 * Reassocia explicitamente uma Landing Page afetada a um domínio próprio verificado do tenant,
 * atualizando `customDomainId` e `briefingData.urlPublicada` somente após validar o destino.
 */
export async function reassociateLandingPageDomain(
  tenantId: string,
  params: {
    slug: string;
    customDomainId: string;
  }
): Promise<{
  slug: string;
  customDomainId: string;
  domain: string;
  publicUrl: string;
}> {
  const cleanTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
  const cleanSlug = typeof params.slug === "string" ? params.slug.trim() : "";
  const cleanDomainId =
    typeof params.customDomainId === "string" ? params.customDomainId.trim() : "";

  if (!cleanTenantId || !cleanSlug || !cleanDomainId) {
    throw new DomainValidationError(
      "Informe o slug da Landing Page e o ID do domínio próprio verificado para reassociação."
    );
  }

  const targetDomain = await prisma.customDomain.findFirst({
    where: { id: cleanDomainId, tenantId: cleanTenantId },
  });
  if (!targetDomain) {
    throw new DomainValidationError(
      "Domínio customizado inválido ou não pertence a esta empresa."
    );
  }
  if (targetDomain.dnsStatus !== DnsStatus.VERIFIED) {
    throw new DomainValidationError(
      `O domínio "${targetDomain.domain}" ainda não está com o DNS verificado. Conclua a verificação DNS antes de reassociar a Landing Page.`
    );
  }

  const lpRow = await prisma.landingPage.findUnique({
    where: {
      tenantId_slug: {
        tenantId: cleanTenantId,
        slug: cleanSlug,
      },
    },
    include: {
      customDomain: true,
    },
  });
  if (!lpRow) {
    throw new DomainValidationError("Landing Page não encontrada.");
  }

  const publicUrl = `https://${targetDomain.domain}/${lpRow.slug}`;
  await atualizarLP(cleanSlug, { customDomainId: targetDomain.id }, cleanTenantId);

  await invalidateDomainMapping(targetDomain.domain);
  if (lpRow.customDomain && lpRow.customDomain.domain !== targetDomain.domain) {
    await invalidateDomainMapping(lpRow.customDomain.domain);
  }

  return {
    slug: lpRow.slug,
    customDomainId: targetDomain.id,
    domain: targetDomain.domain,
    publicUrl,
  };
}

/**
 * Define ou limpa explicitamente a Landing Page inicial (raiz `/`) de um domínio próprio.
 * Exige que o domínio pertença ao tenant e que a LP pertença ao mesmo tenant e domínio
 * e esteja com status `PUBLISHED`. Nunca reutiliza `isDefault` (domínio padrão).
 */
export async function setCustomDomainHomeLandingPage(
  tenantId: string,
  params: {
    domainId: string;
    landingPageId?: string | null;
    slug?: string | null;
  }
): Promise<{
  domainId: string;
  domain: string;
  homeLandingPageId: string | null;
  homeLandingPageSlug: string | null;
}> {
  const cleanTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
  const cleanDomainId = typeof params.domainId === "string" ? params.domainId.trim() : "";
  const cleanLpId =
    typeof params.landingPageId === "string" ? params.landingPageId.trim() : "";
  const cleanSlug = typeof params.slug === "string" ? params.slug.trim() : "";

  if (!cleanTenantId || !cleanDomainId) {
    throw new DomainValidationError("Informe o ID do domínio customizado.");
  }

  const domain = await prisma.customDomain.findFirst({
    where: { id: cleanDomainId, tenantId: cleanTenantId },
  });
  if (!domain) {
    throw new DomainValidationError(
      "Domínio customizado inválido ou não pertence a esta empresa.",
      403
    );
  }

  const shouldClear =
    (params.landingPageId === null || (!cleanLpId && !cleanSlug)) &&
    params.slug !== "";

  if (shouldClear) {
    await prisma.customDomain.update({
      where: { id: domain.id },
      data: { homeLandingPageId: null },
    });
    await invalidateDomainMapping(domain.domain);
    return {
      domainId: domain.id,
      domain: domain.domain,
      homeLandingPageId: null,
      homeLandingPageSlug: null,
    };
  }

  const lp = await prisma.landingPage.findFirst({
    where: {
      tenantId: cleanTenantId,
      ...(cleanLpId ? { id: cleanLpId } : { slug: cleanSlug }),
    },
    select: {
      id: true,
      slug: true,
      tenantId: true,
      customDomainId: true,
      status: true,
      publishedBlobUrl: true,
    },
  });

  if (!lp || lp.tenantId !== cleanTenantId) {
    throw new DomainValidationError(
      "Landing Page não encontrada ou não pertence a esta empresa.",
      404
    );
  }

  if (lp.customDomainId !== domain.id) {
    throw new DomainValidationError(
      "A Landing Page selecionada não está vinculada a este domínio.",
      400
    );
  }

  if (lp.status !== LPStatus.PUBLISHED || !lp.publishedBlobUrl) {
    throw new DomainValidationError(
      "Apenas uma Landing Page publicada e vinculada ao domínio pode ser definida como página inicial.",
      400
    );
  }

  await prisma.customDomain.update({
    where: { id: domain.id },
    data: { homeLandingPageId: lp.id },
  });

  await invalidateDomainMapping(domain.domain);

  return {
    domainId: domain.id,
    domain: domain.domain,
    homeLandingPageId: lp.id,
    homeLandingPageSlug: lp.slug,
  };
}

export async function listTenantDomains(
  tenantId: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    zoneApex?: string | null;
  }
): Promise<{
  fallbackDomain: string | null;
  lpFallbackEnabled: boolean;
  fallbackStatus: "enabled" | "disabled";
  fallbackMessage: string;
  routingMode: DomainRoutingMode;
  targetIpv4: string | null;
  tlsProvider: DomainTlsProvider;
  customDomains: CustomDomainWithInstructions[];
  affectedLandingPages: AffectedFallbackLandingPage[];
}> {
  const env = options?.env ?? process.env;
  const cfg = getAppRuntimeConfig(env);
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  });
  const rows = await prisma.customDomain.findMany({
    where: { tenantId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  const fallbackDomain = resolveTenantFallbackDomain(tenant?.slug, env);
  const fallbackEnabledAndConfigured = Boolean(cfg.lpFallbackEnabled && fallbackDomain);
  const verifiedDomainIds = new Set(
    rows.filter((r) => r.dnsStatus === DnsStatus.VERIFIED).map((r) => r.id)
  );
  const affectedLandingPages = await findAffectedFallbackLandingPages(tenantId, {
    env,
    verifiedDomainIds,
  });

  return {
    fallbackDomain: fallbackEnabledAndConfigured ? fallbackDomain : null,
    lpFallbackEnabled: fallbackEnabledAndConfigured,
    fallbackStatus: fallbackEnabledAndConfigured ? "enabled" : "disabled",
    fallbackMessage: fallbackEnabledAndConfigured
      ? `Subdomínio de fallback ativo (${fallbackDomain}).`
      : "O subdomínio de fallback (.lp.stage.consult) está desativado neste ambiente (LP_FALLBACK_ENABLED=false). Cadastre e verifique um domínio próprio da empresa para publicar Landing Pages.",
    routingMode: cfg.domainRoutingMode,
    targetIpv4: cfg.domainTargetIpv4,
    tlsProvider: cfg.domainTlsProvider,
    customDomains: rows.map((r) =>
      serializeDomain(r, {
        env,
        zoneApex:
          options?.zoneApex &&
          (r.domain === options.zoneApex || r.domain.endsWith(`.${options.zoneApex}`))
            ? options.zoneApex
            : undefined,
      })
    ),
    affectedLandingPages,
  };
}

// Mutex em memória por domínio canônico para serializar cadastros concorrentes no mesmo processo,
// combinado com transação + captura de constraint única (P2002) no PostgreSQL.
const domainRegistrationLocks = new Map<string, Promise<unknown>>();

async function withDomainRegistrationLock<T>(
  canonicalDomain: string,
  fn: () => Promise<T>
): Promise<T> {
  const prev = domainRegistrationLocks.get(canonicalDomain) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => current, () => current);
  domainRegistrationLocks.set(canonicalDomain, chained);

  try {
    await prev.catch(() => undefined);
    return await fn();
  } finally {
    release();
    if (domainRegistrationLocks.get(canonicalDomain) === chained) {
      domainRegistrationLocks.delete(canonicalDomain);
    }
  }
}

export async function registerCustomDomain(
  tenantId: string,
  params: {
    domain: string;
    dnsProviderHint?: string;
    isDefault?: boolean;
    zoneApex?: string | null;
    env?: NodeJS.ProcessEnv;
  }
): Promise<CustomDomainWithInstructions> {
  const cleanTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
  if (!cleanTenantId) {
    throw new DomainValidationError("Tenant inválido para cadastro de domínio");
  }

  // 1. Valida e obtém a representação canônica (ASCII lowercase, sem ponto final DNS, IDN punycode)
  const parsed = parseCustomDomainHostname(params.domain, {
    env: params.env,
    zoneApex: params.zoneApex,
  });
  const cleanDomain = parsed.canonicalDomain;

  // Confirma o mapeamento canônico antes de persistir
  if (!cleanDomain || normalizeHostname(cleanDomain) !== cleanDomain) {
    throw new DomainValidationError("Mapeamento canônico do domínio inválido");
  }

  const verificationToken = `stage-verify-${randomBytes(12).toString("hex")}`;
  const contract = resolveDomainRoutingContract(undefined, { env: params.env });
  // A coluna cnameTarget no banco nunca recebe um IP; no modo direct-ip preserva o default de schema
  // enquanto o contrato serializado expõe cnameTarget: null e targetIpv4: DOMAIN_TARGET_IPV4.
  const dbCnameTarget = contract.cnameTarget ?? "domains.stage.consult";

  return withDomainRegistrationLock(cleanDomain, async () => {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const existing = await tx.customDomain.findUnique({
          where: { domain: cleanDomain },
          select: { id: true, tenantId: true },
        });
        if (existing) {
          if (existing.tenantId === cleanTenantId) {
            throw new DomainConflictError("Este domínio já está cadastrado na sua conta");
          }
          throw new DomainConflictError("Este domínio já está vinculado a outra conta");
        }

        const count = await tx.customDomain.count({
          where: { tenantId: cleanTenantId },
        });
        const shouldBeDefault = params.isDefault ?? count === 0;

        if (shouldBeDefault) {
          await tx.customDomain.updateMany({
            where: { tenantId: cleanTenantId },
            data: { isDefault: false },
          });
        }

        return tx.customDomain.create({
          data: {
            tenantId: cleanTenantId,
            domain: cleanDomain,
            isSubdomain: parsed.isSubdomain,
            dnsProviderHint: params.dnsProviderHint?.trim() || null,
            verificationToken,
            cnameTarget: dbCnameTarget,
            dnsStatus: DnsStatus.PENDING,
            sslStatus: SslStatus.PENDING,
            isDefault: shouldBeDefault,
            nextCheckAt: new Date(),
            checkAttempts: 0,
            consecutiveFailures: 0,
          },
        });
      });

      await invalidateDomainMapping(cleanDomain);
      return serializeDomain(created, {
        env: params.env,
        zoneApex: parsed.isAuthoritativeZoneConfirmed ? parsed.zoneApex : undefined,
      });
    } catch (err) {
      if (err instanceof DomainConflictError || err instanceof DomainValidationError) {
        throw err;
      }
      // Tratamento determinístico de concorrência entre transações/processos (Prisma P2002 Unique Constraint)
      const prismaCode = (err as { code?: string })?.code;
      if (prismaCode === "P2002") {
        const winner = await prisma.customDomain.findUnique({
          where: { domain: cleanDomain },
          select: { tenantId: true },
        });
        if (winner?.tenantId === cleanTenantId) {
          throw new DomainConflictError("Este domínio já está cadastrado na sua conta");
        }
        throw new DomainConflictError("Este domínio já está vinculado a outra conta");
      }
      throw err;
    }
  });
}

/**
 * Integração real com Azure Front Door (Microsoft.Cdn/profiles/customDomains) via Azure ARM REST API
 * para registro de AFDCustomDomain, emissão de ManagedCertificate e associação à rota de borda.
 */
async function provisionAzureFrontDoorCustomDomain(domainRow: {
  id: string;
  domain: string;
}): Promise<{ sslStatus: SslStatus; diagnosticMessage: string }> {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP;
  const profileName = process.env.AZURE_FRONTDOOR_PROFILE_NAME;
  const endpointName = process.env.AZURE_FRONTDOOR_ENDPOINT_NAME;
  const routeName = process.env.AZURE_FRONTDOOR_ROUTE_NAME;

  if (
    !tenantId ||
    !clientId ||
    !clientSecret ||
    !subscriptionId ||
    !resourceGroup ||
    !profileName
  ) {
    return {
      sslStatus: SslStatus.PENDING,
      diagnosticMessage:
        "DNS verificado com sucesso. Provisionamento automático de certificado gerenciado no Azure Front Door aguarda configuração das credenciais AZURE_* no servidor.",
    };
  }

  try {
    // 1. Obter token OAuth2 do Azure AD para o Azure Resource Manager
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          scope: "https://management.azure.com/.default",
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!tokenRes.ok) {
      return {
        sslStatus: SslStatus.FAILED,
        diagnosticMessage: `Falha ao autenticar no Azure Resource Manager (HTTP ${tokenRes.status}).`,
      };
    }

    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const afdDomainName = domainRow.domain.replace(/[^a-zA-Z0-9-]/g, "-");
    const baseUrl = `https://management.azure.com/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/providers/Microsoft.Cdn/profiles/${encodeURIComponent(profileName)}`;

    // 2. Criar ou atualizar AFDCustomDomain com ManagedCertificate
    const putDomainUrl = `${baseUrl}/customDomains/${encodeURIComponent(afdDomainName)}?api-version=2023-05-01`;
    const putRes = await fetch(putDomainUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          hostName: domainRow.domain,
          tlsSettings: {
            certificateType: "ManagedCertificate",
            minimumTlsVersion: "TLS12",
          },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!putRes.ok) {
      return {
        sslStatus: SslStatus.FAILED,
        diagnosticMessage: `Azure Front Door recusou o registro do domínio (HTTP ${putRes.status}).`,
      };
    }

    const afdData = (await putRes.json()) as {
      id?: string;
      properties?: {
        deploymentStatus?: string;
        domainValidationState?: string;
      };
    };

    // 3. Se endpoint e route foram informados, associar o AFDCustomDomain à rota de borda
    if (endpointName && routeName && afdData.id) {
      const routeUrl = `${baseUrl}/afdEndpoints/${encodeURIComponent(endpointName)}/routes/${encodeURIComponent(routeName)}?api-version=2023-05-01`;
      const routeGet = await fetch(routeUrl, {
        headers: { Authorization: `Bearer ${access_token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (routeGet.ok) {
        const routeJson = (await routeGet.json()) as {
          properties?: { customDomains?: Array<{ id: string }>; [k: string]: unknown };
        };
        const currentDomains = routeJson.properties?.customDomains ?? [];
        const alreadyLinked = currentDomains.some(
          (d) => d.id.toLowerCase() === afdData.id!.toLowerCase()
        );
        if (!alreadyLinked && routeJson.properties) {
          await fetch(routeUrl, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              properties: {
                ...routeJson.properties,
                customDomains: [...currentDomains, { id: afdData.id }],
              },
            }),
            signal: AbortSignal.timeout(15000),
          }).catch(() => undefined);
        }
      }
    }

    const validationState = afdData.properties?.domainValidationState?.toLowerCase() ?? "";
    const deploymentStatus = afdData.properties?.deploymentStatus?.toLowerCase() ?? "";

    if (validationState === "approved" && deploymentStatus === "succeeded") {
      return {
        sslStatus: SslStatus.ACTIVE,
        diagnosticMessage: "Certificado SSL gerenciado ativo no Azure Front Door.",
      };
    }
    if (validationState === "rejected" || deploymentStatus === "failed") {
      return {
        sslStatus: SslStatus.FAILED,
        diagnosticMessage: `Falha na validação/emissão do certificado no Azure Front Door (${validationState || deploymentStatus}).`,
      };
    }

    return {
      sslStatus: SslStatus.PROVISIONING,
      diagnosticMessage: `Certificado SSL em provisionamento no Azure Front Door (estado: ${validationState || "Pending"}).`,
    };
  } catch (err) {
    return {
      sslStatus: SslStatus.FAILED,
      diagnosticMessage: `Erro de comunicação com Azure Front Door: ${(err as Error).message}`,
    };
  }
}

export type DnsResolverAdapter = {
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
  resolveTxt(hostname: string): Promise<string[][]>;
  resolveCname?(hostname: string): Promise<string[]>;
};

export type DnsQueryStatus = "ok" | "no_record" | "timeout" | "resolver_error";

export type DnsQueryOutcome<T> = {
  status: DnsQueryStatus;
  records: T[];
  errorCode?: string;
};

export type DnsVerificationReasonCode =
  | "DNS_VERIFIED"
  | "DNS_MISSING_RECORDS"
  | "DNS_PROPAGATING_PARTIAL"
  | "DNS_WRONG_TARGET"
  | "DNS_CONFLICTING_A_RECORDS"
  | "DNS_WRONG_TXT_TOKEN"
  | "DNS_AAAA_CONFLICT"
  | "DNS_TIMEOUT"
  | "DNS_RESOLVER_ERROR";

export type VerifyCustomDomainResult = {
  domain: CustomDomainWithInstructions;
  verified: boolean;
  reasonCode: DnsVerificationReasonCode;
  transient: boolean;
  message: string;
  diagnostics: {
    expectedIpv4: string | null;
    foundIpv4: string[];
    foundIpv6: string[];
    expectedTxtFqdn: string;
    txtMatched: boolean;
    aMatched: boolean;
  };
};

const DEFAULT_DNS_TIMEOUT_MS = 5000;

/**
 * Política documentada de agendamento, backoff limitado e revalidação periódica de domínios:
 * - Propagação/falha de DNS (PENDING ou FAILED): backoff limitado [1m, 2m, 5m, 10m, 20m, 30m, máx 60m].
 *   Uma primeira verificação antes da propagação NUNCA abandona o domínio para sempre.
 * - Falha transitória do resolvedor ou timeout (DNS_TIMEOUT / DNS_RESOLVER_ERROR):
 *   backoff curto limitado [1m, 2m, 5m, 10m, máx 15m] e preservação de VERIFIED/ACTIVE sem revogação imediata.
 * - DNS VERIFIED com TLS em PENDING / PROVISIONING / FAILED (falha recuperável):
 *   backoff limitado [1m, 2m, 5m, 15m, máx 30m].
 * - Domínios ativos (DNS VERIFIED + SSL ACTIVE): revalidação periódica a cada 6 horas.
 *   Mudança confirmada de propriedade (TXT ausente/incorreto) ou de destino (A/CNAME incorreto,
 *   múltiplos IPs conflitantes ou AAAA incompatível) retira imediatamente a autorização
 *   (dnsStatus -> FAILED, sslStatus -> PENDING) e invalida o cache de mapeamento.
 */
export const DOMAIN_PROPAGATION_BACKOFF_MS = [
  60_000,
  120_000,
  300_000,
  600_000,
  1_200_000,
  1_800_000,
  3_600_000,
] as const;

export const DOMAIN_TRANSIENT_BACKOFF_MS = [
  60_000,
  120_000,
  300_000,
  600_000,
  900_000,
] as const;

export const DOMAIN_TLS_RECOVERY_BACKOFF_MS = [
  60_000,
  120_000,
  300_000,
  900_000,
  1_800_000,
] as const;

export const DOMAIN_ACTIVE_REVALIDATION_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas
export const DOMAIN_LEASE_DURATION_MS = 30_000; // 30s de lease por verificação
export const DOMAIN_MANUAL_VERIFY_MAX_REQUESTS = 5;
export const DOMAIN_MANUAL_VERIFY_WINDOW_SECONDS = 60;

export function computeNextDomainCheckAt(params: {
  now: Date;
  dnsStatus: DnsStatus;
  sslStatus: SslStatus;
  transient: boolean;
  attempts: number;
  consecutiveFailures: number;
  revalidateIntervalMs?: number;
}): Date {
  const {
    now,
    dnsStatus,
    sslStatus,
    transient,
    attempts,
    consecutiveFailures,
    revalidateIntervalMs = DOMAIN_ACTIVE_REVALIDATION_INTERVAL_MS,
  } = params;

  if (transient) {
    const idx = Math.min(
      Math.max(0, consecutiveFailures - 1),
      DOMAIN_TRANSIENT_BACKOFF_MS.length - 1
    );
    return new Date(now.getTime() + DOMAIN_TRANSIENT_BACKOFF_MS[idx]);
  }

  if (dnsStatus === DnsStatus.VERIFIED) {
    if (sslStatus === SslStatus.ACTIVE) {
      return new Date(now.getTime() + revalidateIntervalMs);
    }
    const idx = Math.min(
      Math.max(0, attempts - 1),
      DOMAIN_TLS_RECOVERY_BACKOFF_MS.length - 1
    );
    return new Date(now.getTime() + DOMAIN_TLS_RECOVERY_BACKOFF_MS[idx]);
  }

  const idx = Math.min(
    Math.max(0, consecutiveFailures - 1),
    DOMAIN_PROPAGATION_BACKOFF_MS.length - 1
  );
  return new Date(now.getTime() + DOMAIN_PROPAGATION_BACKOFF_MS[idx]);
}

export type SchedulableCustomDomainRow = {
  id: string;
  tenantId: string;
  domain: string;
  dnsStatus: DnsStatus | string;
  sslStatus: SslStatus | string;
  lastCheckedAt?: Date | string | null;
  nextCheckAt?: Date | string | null;
  lockedUntil?: Date | string | null;
  createdAt?: Date | string | null;
  checkAttempts?: number | null;
  consecutiveFailures?: number | null;
};

const inFlightDomainLocks = new Map<string, { lockedBy: string; expiresAt: number }>();

export function isDomainLockedAt(
  row: Pick<SchedulableCustomDomainRow, "id" | "lockedUntil">,
  now: Date
): boolean {
  const nowMs = now.getTime();
  const memLock = inFlightDomainLocks.get(row.id);
  if (memLock && memLock.expiresAt > nowMs) {
    return true;
  }
  if (row.lockedUntil) {
    const dbLockMs = new Date(row.lockedUntil).getTime();
    if (!Number.isNaN(dbLockMs) && dbLockMs > nowMs) {
      return true;
    }
  }
  return false;
}

export function isDomainEligibleForScheduledCheck(
  row: SchedulableCustomDomainRow,
  options?: {
    now?: Date;
    revalidateIntervalMs?: number;
  }
): boolean {
  const now = options?.now ?? new Date();
  const nowMs = now.getTime();
  const revalidateIntervalMs =
    options?.revalidateIntervalMs ?? DOMAIN_ACTIVE_REVALIDATION_INTERVAL_MS;

  if (isDomainLockedAt(row, now)) {
    return false;
  }

  const nextCheckMs =
    row.nextCheckAt !== null && row.nextCheckAt !== undefined
      ? new Date(row.nextCheckAt).getTime()
      : null;

  const isPendingOrFailedDns =
    row.dnsStatus === DnsStatus.PENDING || row.dnsStatus === DnsStatus.FAILED;
  if (isPendingOrFailedDns) {
    return nextCheckMs === null || Number.isNaN(nextCheckMs) || nextCheckMs <= nowMs;
  }

  const isPendingOrRecoverableTls =
    row.dnsStatus === DnsStatus.VERIFIED && row.sslStatus !== SslStatus.ACTIVE;
  if (isPendingOrRecoverableTls) {
    return nextCheckMs === null || Number.isNaN(nextCheckMs) || nextCheckMs <= nowMs;
  }

  if (row.dnsStatus === DnsStatus.VERIFIED && row.sslStatus === SslStatus.ACTIVE) {
    if (nextCheckMs !== null && !Number.isNaN(nextCheckMs)) {
      return nextCheckMs <= nowMs;
    }
    const lastCheckedMs =
      row.lastCheckedAt !== null && row.lastCheckedAt !== undefined
        ? new Date(row.lastCheckedAt).getTime()
        : null;
    if (lastCheckedMs === null || Number.isNaN(lastCheckedMs)) {
      return true;
    }
    return nowMs - lastCheckedMs >= revalidateIntervalMs;
  }

  return false;
}

/**
 * Filtra e ordena os domínios elegíveis para o ciclo do worker evitando starvation:
 * 1. Menor nextCheckAt efetivo (itens nunca agendados têm prioridade 0)
 * 2. Menor lastCheckedAt (itens nunca verificados ou verificados há mais tempo vêm primeiro)
 * 3. Menor createdAt (FIFO para empates)
 * 4. ID (desempate determinístico)
 */
export function filterAndSortDueDomains<T extends SchedulableCustomDomainRow>(
  candidates: T[],
  options?: {
    now?: Date;
    batchSize?: number;
    revalidateIntervalMs?: number;
  }
): T[] {
  const now = options?.now ?? new Date();
  const revalidateIntervalMs =
    options?.revalidateIntervalMs ?? DOMAIN_ACTIVE_REVALIDATION_INTERVAL_MS;
  const batchSize = options?.batchSize ?? 10;

  const effectiveNextCheckMs = (d: T): number => {
    if (d.nextCheckAt !== null && d.nextCheckAt !== undefined) {
      const ms = new Date(d.nextCheckAt).getTime();
      if (!Number.isNaN(ms)) return ms;
    }
    if (d.dnsStatus === DnsStatus.VERIFIED && d.sslStatus === SslStatus.ACTIVE) {
      const lastMs =
        d.lastCheckedAt !== null && d.lastCheckedAt !== undefined
          ? new Date(d.lastCheckedAt).getTime()
          : 0;
      return (Number.isNaN(lastMs) ? 0 : lastMs) + revalidateIntervalMs;
    }
    return 0;
  };

  const effectiveLastCheckedMs = (d: T): number => {
    if (d.lastCheckedAt !== null && d.lastCheckedAt !== undefined) {
      const ms = new Date(d.lastCheckedAt).getTime();
      if (!Number.isNaN(ms)) return ms;
    }
    return 0;
  };

  const effectiveCreatedMs = (d: T): number => {
    if (d.createdAt !== null && d.createdAt !== undefined) {
      const ms = new Date(d.createdAt).getTime();
      if (!Number.isNaN(ms)) return ms;
    }
    return 0;
  };

  return candidates
    .filter((d) => isDomainEligibleForScheduledCheck(d, { now, revalidateIntervalMs }))
    .sort((a, b) => {
      const nextDiff = effectiveNextCheckMs(a) - effectiveNextCheckMs(b);
      if (nextDiff !== 0) return nextDiff;
      const lastDiff = effectiveLastCheckedMs(a) - effectiveLastCheckedMs(b);
      if (lastDiff !== 0) return lastDiff;
      const createdDiff = effectiveCreatedMs(a) - effectiveCreatedMs(b);
      if (createdDiff !== 0) return createdDiff;
      return a.id.localeCompare(b.id);
    })
    .slice(0, batchSize);
}

const NO_RECORD_DNS_CODES = new Set([
  "ENODATA",
  "ENOTFOUND",
  "NXDOMAIN",
  "ESERVER", // fallback em alguns ambientes para ausência de registro específico
]);

const TIMEOUT_DNS_CODES = new Set(["ETIMEOUT", "DNS_QUERY_TIMEOUT", "ABORT_ERR"]);

async function runDnsQueryWithTimeout<T>(
  fn: () => Promise<T[]>,
  timeoutMs: number
): Promise<DnsQueryOutcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const records = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const timeoutErr = new Error("DNS query timed out") as Error & {
            code?: string;
          };
          timeoutErr.code = "ETIMEOUT";
          reject(timeoutErr);
        }, timeoutMs);
      }),
    ]);

    if (!Array.isArray(records) || records.length === 0) {
      return { status: "no_record", records: [] };
    }
    return { status: "ok", records };
  } catch (err) {
    const rawCode = String(
      (err as { code?: string; errno?: string })?.code ||
        (err as { errno?: string })?.errno ||
        ""
    )
      .trim()
      .toUpperCase();

    if (TIMEOUT_DNS_CODES.has(rawCode) || /timed?\s*out/i.test((err as Error)?.message || "")) {
      return { status: "timeout", records: [], errorCode: rawCode || "ETIMEOUT" };
    }

    if (NO_RECORD_DNS_CODES.has(rawCode)) {
      return { status: "no_record", records: [], errorCode: rawCode };
    }

    return {
      status: "resolver_error",
      records: [],
      errorCode: rawCode || "ERESOLVER",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function verifyCustomDomain(
  tenantId: string,
  domainId: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    dnsResolver?: DnsResolverAdapter;
    timeoutMs?: number;
    now?: Date;
    trigger?: "manual" | "worker";
    workerId?: string;
    enforceRateLimit?: boolean;
    maxManualRequestsPerWindow?: number;
    manualRateLimitWindowSeconds?: number;
    revalidateIntervalMs?: number;
  }
): Promise<VerifyCustomDomainResult> {
  const cleanTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
  const cleanDomainId = typeof domainId === "string" ? domainId.trim() : "";
  if (!cleanTenantId || !cleanDomainId) {
    throw new DomainValidationError("Domínio não encontrado");
  }

  let now = options?.now ? new Date(options.now.getTime()) : new Date();
  const trigger = options?.trigger ?? "manual";
  const enforceRateLimit = options?.enforceRateLimit ?? trigger === "manual";

  const row = await prisma.customDomain.findFirst({
    where: { id: cleanDomainId, tenantId: cleanTenantId },
  });
  if (!row) {
    throw new DomainValidationError("Domínio não encontrado");
  }

  // 1. Proteção contra execução simultânea do mesmo domínio entre ciclos/instâncias/requisições
  if (isDomainLockedAt(row, now)) {
    throw new DomainConcurrencyError(
      `Uma verificação já está em andamento para o domínio "${row.domain}". Aguarde alguns instantes.`
    );
  }

  // 2. Rate limit para rechecagem manual (preservando verificação sob demanda sem abuso contra DNS)
  if (enforceRateLimit) {
    const maxRequests =
      options?.maxManualRequestsPerWindow ?? DOMAIN_MANUAL_VERIFY_MAX_REQUESTS;
    const windowSeconds =
      options?.manualRateLimitWindowSeconds ?? DOMAIN_MANUAL_VERIFY_WINDOW_SECONDS;
    const rl = await checkRateLimit(
      `domain_verify:${cleanTenantId}:${cleanDomainId}`,
      maxRequests,
      windowSeconds,
      now.getTime()
    );
    if (!rl.allowed) {
      throw new DomainRateLimitError(
        `Limite de verificações manuais excedido para "${row.domain}". Aguarde ${rl.retryAfterSeconds}s antes de tentar novamente.`,
        rl.retryAfterSeconds
      );
    }
  }

  // 3. Reivindica lease curto ANTES das consultas DNS externas (sem manter transação de banco aberta)
  if (!options?.now) now = new Date(); // lease starts at the actual claim, after DB/rate-limit work
  const lockOwner = `${options?.workerId || "domain"}:${randomUUID()}`;
  const leaseExpiresAt = new Date(now.getTime() + DOMAIN_LEASE_DURATION_MS);

  inFlightDomainLocks.set(row.id, {
    lockedBy: lockOwner,
    expiresAt: leaseExpiresAt.getTime(),
  });

  let dbLeaseAcquired = false;
  try {
    const claim = await prisma.customDomain.updateMany({
      where: { id: row.id, tenantId: cleanTenantId,
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
      data: { lockedUntil: leaseExpiresAt, lockedBy: lockOwner },
    });
    if (claim.count !== 1) throw new DomainConcurrencyError("Domínio já possui verificação em andamento");
    dbLeaseAcquired = true;

    const env = options?.env ?? process.env;
    const resolver: DnsResolverAdapter = options?.dnsResolver ?? dns;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_DNS_TIMEOUT_MS;
    const revalidateIntervalMs =
      options?.revalidateIntervalMs ?? DOMAIN_ACTIVE_REVALIDATION_INTERVAL_MS;

    const parsed = detectIsSubdomain(row.domain, { env });
    const contract = resolveDomainRoutingContract(row, { env });
    const prevAttempts = row.checkAttempts ?? 0;
    const prevConsecutiveFailures = row.consecutiveFailures ?? 0;

    if (contract.routingMode === "direct-ip") {
      const expectedIpv4 = contract.targetIpv4!;
      const expectedTxtFqdn = parsed.txtHostFqdn;

      // Consultas DNS externas executadas FORA de qualquer transação de banco
      const [aOutcome, aaaaOutcome, txtOutcome] = await Promise.all([
        runDnsQueryWithTimeout(() => resolver.resolve4(parsed.canonicalDomain), timeoutMs),
        runDnsQueryWithTimeout(() => resolver.resolve6(parsed.canonicalDomain), timeoutMs),
        runDnsQueryWithTimeout(() => resolver.resolveTxt(expectedTxtFqdn), timeoutMs),
      ]);

      const foundIpv4 = Array.from(
        new Set(
          aOutcome.records
            .map((ip) => String(ip).trim())
            .filter(Boolean)
        )
      );
      const foundIpv6 = Array.from(
        new Set(
          aaaaOutcome.records
            .map((ip) => String(ip).trim().toLowerCase())
            .filter(Boolean)
        )
      );
      const foundTxtValues = txtOutcome.records
        .map((chunks) => (Array.isArray(chunks) ? chunks.join("") : String(chunks)).trim())
        .filter(Boolean);

      const aHasExpected = foundIpv4.includes(expectedIpv4);
      const aHasConflicting = foundIpv4.some((ip) => ip !== expectedIpv4);
      const aMatched = aOutcome.status === "ok" && aHasExpected && !aHasConflicting;
      const txtMatched =
        txtOutcome.status === "ok" && foundTxtValues.includes(row.verificationToken);
      const aaaaConflict = aaaaOutcome.status === "ok" && foundIpv6.length > 0;

      // 1. Timeout ou falha transitória do resolvedor DNS (diferenciado de "sem registro")
      const hasTimeout =
        aOutcome.status === "timeout" ||
        txtOutcome.status === "timeout" ||
        aaaaOutcome.status === "timeout";
      const hasResolverError =
        aOutcome.status === "resolver_error" ||
        txtOutcome.status === "resolver_error" ||
        aaaaOutcome.status === "resolver_error";

      if ((hasTimeout || hasResolverError) && !(aMatched && txtMatched && !aaaaConflict)) {
        const reasonCode: DnsVerificationReasonCode = hasTimeout
          ? "DNS_TIMEOUT"
          : "DNS_RESOLVER_ERROR";
        const errDetail =
          aOutcome.errorCode || txtOutcome.errorCode || aaaaOutcome.errorCode || "DNS_ERROR";

        const message = hasTimeout
          ? `Tempo limite excedido (timeout) ao consultar os servidores DNS para "${parsed.canonicalDomain}". Aguarde alguns instantes e tente novamente.`
          : `Falha transitória no resolvedor DNS (${errDetail}) ao consultar "${parsed.canonicalDomain}". Tente verificar novamente em instantes.`;

        const nextAttempts = prevAttempts + 1;
        const nextConsecutiveFailures = prevConsecutiveFailures + 1;
        const nextCheckAt = computeNextDomainCheckAt({
          now,
          dnsStatus: row.dnsStatus,
          sslStatus: row.sslStatus,
          transient: true,
          attempts: nextAttempts,
          consecutiveFailures: nextConsecutiveFailures,
          revalidateIntervalMs,
        });

        // Política: timeout transitório não revoga imediatamente um domínio válido (preserva dnsStatus e sslStatus)
        const updated = await prisma.customDomain.update({
          where: { id: row.id, lockedBy: lockOwner, lockedUntil: { gt: options?.now ?? new Date() } },
          data: {
            lastCheckedAt: now,
            nextCheckAt,
            checkAttempts: nextAttempts,
            consecutiveFailures: nextConsecutiveFailures,
            lastReasonCode: reasonCode,
            lastError: message,
            lockedUntil: null,
            lockedBy: null,
          },
        });
        dbLeaseAcquired = false;

        return {
          domain: serializeDomain(updated, { env }),
          verified: false,
          reasonCode,
          transient: true,
          message,
          diagnostics: {
            expectedIpv4,
            foundIpv4,
            foundIpv6,
            expectedTxtFqdn,
            txtMatched,
            aMatched,
          },
        };
      }

      // 2. Avaliação estrita dos registros DNS no modo direct-ip (exige simultaneamente A compatível, TXT correto e ausência de AAAA sem IPv6 aprovado)
      if (!aMatched || !txtMatched || aaaaConflict) {
        let reasonCode: DnsVerificationReasonCode;
        let message: string;

        if (aaaaConflict) {
          reasonCode = "DNS_AAAA_CONFLICT";
          message = `Foram encontrados registros IPv6 (AAAA: ${foundIpv6.join(", ")}) em "${parsed.canonicalDomain}", mas o servidor opera exclusivamente em IPv4 (${expectedIpv4}). Remova o registro AAAA no seu DNS para evitar conflitos de tráfego e emissão SSL.`;
        } else if (aOutcome.status === "ok" && aHasExpected && aHasConflicting) {
          reasonCode = "DNS_CONFLICTING_A_RECORDS";
          message = `Foram detectados múltiplos registros A conflitantes para "${parsed.canonicalDomain}" (${foundIpv4.join(", ")}). Mantenha apenas o endereço ${expectedIpv4} e remova os demais registros A.`;
        } else if (aOutcome.status === "ok" && !aHasExpected) {
          reasonCode = "DNS_WRONG_TARGET";
          message = `Destino incorreto no registro A de "${parsed.canonicalDomain}": aponta atualmente para "${foundIpv4.join(", ")}", mas deve apontar exclusivamente para "${expectedIpv4}".`;
        } else if (txtOutcome.status === "ok" && !txtMatched) {
          reasonCode = "DNS_WRONG_TXT_TOKEN";
          message = `Token TXT incorreto em "${expectedTxtFqdn}": o valor configurado não corresponde ao token exclusivo deste domínio ("${row.verificationToken}").`;
        } else if (aMatched && !txtMatched) {
          reasonCode = "DNS_PROPAGATING_PARTIAL";
          message = `Configuração parcial ou em propagação para "${parsed.canonicalDomain}": o registro A (${expectedIpv4}) está correto, mas o registro TXT em "${expectedTxtFqdn}" com o token "${row.verificationToken}" ainda não foi encontrado. Ambos os registros A e TXT são obrigatórios.`;
        } else if (!aMatched && txtMatched) {
          reasonCode = "DNS_PROPAGATING_PARTIAL";
          message = `Configuração parcial ou em propagação para "${parsed.canonicalDomain}": o registro TXT em "${expectedTxtFqdn}" foi confirmado, mas o registro A apontando para "${expectedIpv4}" está ausente. Ambos os registros A e TXT são obrigatórios.`;
        } else {
          reasonCode = "DNS_MISSING_RECORDS";
          message = `Registros DNS ausentes para "${parsed.canonicalDomain}": não encontramos o registro A para "${expectedIpv4}" nem o registro TXT em "${expectedTxtFqdn}". Adicione ambos os registros no seu provedor DNS e aguarde a propagação.`;
        }

        const nextAttempts = prevAttempts + 1;
        const nextConsecutiveFailures = prevConsecutiveFailures + 1;
        const nextCheckAt = computeNextDomainCheckAt({
          now,
          dnsStatus: DnsStatus.FAILED,
          sslStatus: SslStatus.PENDING,
          transient: false,
          attempts: nextAttempts,
          consecutiveFailures: nextConsecutiveFailures,
          revalidateIntervalMs,
        });

        // Política: mudança confirmada de propriedade/destino retira a autorização (dnsStatus -> FAILED, sslStatus -> PENDING)
        // e invalida o mapeamento em cache, mantendo nextCheckAt com backoff limitado para recuperação se o DNS for corrigido.
        const updated = await prisma.customDomain.update({
          where: { id: row.id, lockedBy: lockOwner, lockedUntil: { gt: options?.now ?? new Date() } },
          data: {
            dnsStatus: DnsStatus.FAILED,
            sslStatus: SslStatus.PENDING,
            lastCheckedAt: now,
            nextCheckAt,
            checkAttempts: nextAttempts,
            consecutiveFailures: nextConsecutiveFailures,
            lastReasonCode: reasonCode,
            lastError: message,
            lockedUntil: null,
            lockedBy: null,
          },
        });
        dbLeaseAcquired = false;
        await invalidateDomainMapping(parsed.canonicalDomain);

        return {
          domain: serializeDomain(updated, { env }),
          verified: false,
          reasonCode,
          transient: false,
          message,
          diagnostics: {
            expectedIpv4,
            foundIpv4,
            foundIpv6,
            expectedTxtFqdn,
            txtMatched,
            aMatched,
          },
        };
      }

      // 3. Sucesso: A === 172.212.145.134 (sem conflitos e sem AAAA incompatível) E TXT === verificationToken
      let nextSslStatus: SslStatus;
      let diagnosticMessage: string;

      if (contract.tlsProvider === "frontdoor") {
        const afdResult = await provisionAzureFrontDoorCustomDomain(row);
        nextSslStatus =
          row.sslStatus === SslStatus.ACTIVE && afdResult.sslStatus !== SslStatus.FAILED
            ? SslStatus.ACTIVE
            : afdResult.sslStatus;
        diagnosticMessage = afdResult.diagnosticMessage;
      } else {
        // No modo Caddy (ou manual), NUNCA chama Azure ARM/Front Door.
        // Preserva SslStatus.ACTIVE se o certificado já estava ativo; caso contrário, encaminha para PROVISIONING sem inventar ACTIVE.
        nextSslStatus =
          row.sslStatus === SslStatus.ACTIVE ? SslStatus.ACTIVE : SslStatus.PROVISIONING;
        diagnosticMessage =
          nextSslStatus === SslStatus.ACTIVE
            ? `DNS (A em ${expectedIpv4} e TXT em ${expectedTxtFqdn}) confirmado. Certificado HTTPS ativo.`
            : `DNS (A em ${expectedIpv4} e TXT em ${expectedTxtFqdn}) verificado com sucesso! O certificado TLS está em provisionamento sob demanda pelo Caddy.`;
      }

      const nextAttempts =
        nextSslStatus === SslStatus.ACTIVE
          ? 0
          : row.dnsStatus === DnsStatus.VERIFIED
            ? prevAttempts + 1
            : 1;
      const nextCheckAt = computeNextDomainCheckAt({
        now,
        dnsStatus: DnsStatus.VERIFIED,
        sslStatus: nextSslStatus,
        transient: false,
        attempts: nextAttempts,
        consecutiveFailures: 0,
        revalidateIntervalMs,
      });

      const updated = await prisma.customDomain.update({
        where: { id: row.id, lockedBy: lockOwner, lockedUntil: { gt: options?.now ?? new Date() } },
        data: {
          dnsStatus: DnsStatus.VERIFIED,
          sslStatus: nextSslStatus,
          lastCheckedAt: now,
          nextCheckAt,
          checkAttempts: nextAttempts,
          consecutiveFailures: 0,
          lastReasonCode: "DNS_VERIFIED",
          lastError: nextSslStatus === SslStatus.FAILED ? diagnosticMessage : null,
          lockedUntil: null,
          lockedBy: null,
        },
      });
      dbLeaseAcquired = false;

      await invalidateDomainMapping(parsed.canonicalDomain);

      return {
        domain: serializeDomain(updated, { env }),
        verified: true,
        reasonCode: "DNS_VERIFIED",
        transient: false,
        message: diagnosticMessage,
        diagnostics: {
          expectedIpv4,
          foundIpv4,
          foundIpv6,
          expectedTxtFqdn,
          txtMatched: true,
          aMatched: true,
        },
      };
    }

    // Modo legado "cname"
    const targetExpected = contract.cnameTarget!;
    const expectedTxtFqdn = parsed.txtHostFqdn;
    const resolveCnameFn = resolver.resolveCname
      ? () => resolver.resolveCname!(parsed.canonicalDomain)
      : () => dns.resolveCname(parsed.canonicalDomain);

    const [cnameOutcome, txtOutcome] = await Promise.all([
      runDnsQueryWithTimeout(resolveCnameFn, timeoutMs),
      runDnsQueryWithTimeout(() => resolver.resolveTxt(expectedTxtFqdn), timeoutMs),
    ]);

    const foundTargets = cnameOutcome.records.map((c) =>
      String(c).toLowerCase().replace(/\.$/, "")
    );
    const cnameMatched =
      cnameOutcome.status === "ok" &&
      foundTargets.includes(targetExpected) &&
      foundTargets.every((t) => t === targetExpected);
    const foundTxtValues = txtOutcome.records
      .map((chunks) => (Array.isArray(chunks) ? chunks.join("") : String(chunks)).trim())
      .filter(Boolean);
    const txtMatched =
      txtOutcome.status === "ok" && foundTxtValues.includes(row.verificationToken);

    const hasLegacyTimeout =
      cnameOutcome.status === "timeout" || txtOutcome.status === "timeout";
    const hasLegacyResolverError =
      cnameOutcome.status === "resolver_error" || txtOutcome.status === "resolver_error";

    if ((hasLegacyTimeout || hasLegacyResolverError) && !(cnameMatched && txtMatched)) {
      const reasonCode: DnsVerificationReasonCode = hasLegacyTimeout
        ? "DNS_TIMEOUT"
        : "DNS_RESOLVER_ERROR";
      const message = hasLegacyTimeout
        ? `Tempo limite excedido ao consultar DNS de "${parsed.canonicalDomain}".`
        : `Falha transitória no resolvedor DNS ao consultar "${parsed.canonicalDomain}".`;
      const nextAttempts = prevAttempts + 1;
      const nextConsecutiveFailures = prevConsecutiveFailures + 1;
      const nextCheckAt = computeNextDomainCheckAt({
        now,
        dnsStatus: row.dnsStatus,
        sslStatus: row.sslStatus,
        transient: true,
        attempts: nextAttempts,
        consecutiveFailures: nextConsecutiveFailures,
        revalidateIntervalMs,
      });

      const updated = await prisma.customDomain.update({
        where: { id: row.id, lockedBy: lockOwner, lockedUntil: { gt: options?.now ?? new Date() } },
        data: {
          lastCheckedAt: now,
          nextCheckAt,
          checkAttempts: nextAttempts,
          consecutiveFailures: nextConsecutiveFailures,
          lastReasonCode: reasonCode,
          lastError: message,
          lockedUntil: null,
          lockedBy: null,
        },
      });
      dbLeaseAcquired = false;

      return {
        domain: serializeDomain(updated, { env }),
        verified: false,
        reasonCode,
        transient: true,
        message,
        diagnostics: {
          expectedIpv4: null,
          foundIpv4: [],
          foundIpv6: [],
          expectedTxtFqdn,
          txtMatched,
          aMatched: cnameMatched,
        },
      };
    }

    if (!cnameMatched || !txtMatched) {
      const reasonCode: DnsVerificationReasonCode =
        foundTargets.length > 0 && !cnameMatched
          ? "DNS_WRONG_TARGET"
          : cnameMatched || txtMatched
            ? "DNS_PROPAGATING_PARTIAL"
            : "DNS_MISSING_RECORDS";
      const detail =
        foundTargets.length > 0 && !cnameMatched
          ? `CNAME atual aponta para "${foundTargets.join(", ")}", mas deveria apontar para "${targetExpected}".`
          : `Verificação incompleta: confirme simultaneamente o CNAME para "${targetExpected}" e o registro TXT em "${expectedTxtFqdn}".`;

      const nextAttempts = prevAttempts + 1;
      const nextConsecutiveFailures = prevConsecutiveFailures + 1;
      const nextCheckAt = computeNextDomainCheckAt({
        now,
        dnsStatus: DnsStatus.FAILED,
        sslStatus: SslStatus.PENDING,
        transient: false,
        attempts: nextAttempts,
        consecutiveFailures: nextConsecutiveFailures,
        revalidateIntervalMs,
      });

      const updated = await prisma.customDomain.update({
        where: { id: row.id, lockedBy: lockOwner, lockedUntil: { gt: options?.now ?? new Date() } },
        data: {
          dnsStatus: DnsStatus.FAILED,
          sslStatus: SslStatus.PENDING,
          lastCheckedAt: now,
          nextCheckAt,
          checkAttempts: nextAttempts,
          consecutiveFailures: nextConsecutiveFailures,
          lastReasonCode: reasonCode,
          lastError: detail,
          lockedUntil: null,
          lockedBy: null,
        },
      });
      dbLeaseAcquired = false;
      await invalidateDomainMapping(parsed.canonicalDomain);

      return {
        domain: serializeDomain(updated, { env }),
        verified: false,
        reasonCode,
        transient: false,
        message: detail,
        diagnostics: {
          expectedIpv4: null,
          foundIpv4: [],
          foundIpv6: [],
          expectedTxtFqdn,
          txtMatched,
          aMatched: cnameMatched,
        },
      };
    }

    let nextSslStatus: SslStatus =
      row.sslStatus === SslStatus.ACTIVE ? SslStatus.ACTIVE : SslStatus.PROVISIONING;
    let diagnosticMessage = `DNS verificado com sucesso (${parsed.canonicalDomain}).`;

    if (contract.tlsProvider === "frontdoor") {
      const afdResult = await provisionAzureFrontDoorCustomDomain(row);
      nextSslStatus =
        row.sslStatus === SslStatus.ACTIVE && afdResult.sslStatus !== SslStatus.FAILED
          ? SslStatus.ACTIVE
          : afdResult.sslStatus;
      diagnosticMessage = afdResult.diagnosticMessage;
    }

    const nextAttempts =
      nextSslStatus === SslStatus.ACTIVE
        ? 0
        : row.dnsStatus === DnsStatus.VERIFIED
          ? prevAttempts + 1
          : 1;
    const nextCheckAt = computeNextDomainCheckAt({
      now,
      dnsStatus: DnsStatus.VERIFIED,
      sslStatus: nextSslStatus,
      transient: false,
      attempts: nextAttempts,
      consecutiveFailures: 0,
      revalidateIntervalMs,
    });

    const updated = await prisma.customDomain.update({
      where: { id: row.id, lockedBy: lockOwner, lockedUntil: { gt: options?.now ?? new Date() } },
      data: {
        dnsStatus: DnsStatus.VERIFIED,
        sslStatus: nextSslStatus,
        lastCheckedAt: now,
        nextCheckAt,
        checkAttempts: nextAttempts,
        consecutiveFailures: 0,
        lastReasonCode: "DNS_VERIFIED",
        lastError: nextSslStatus === SslStatus.FAILED ? diagnosticMessage : null,
        lockedUntil: null,
        lockedBy: null,
      },
    });
    dbLeaseAcquired = false;

    await invalidateDomainMapping(parsed.canonicalDomain);

    return {
      domain: serializeDomain(updated, { env }),
      verified: true,
      reasonCode: "DNS_VERIFIED",
      transient: false,
      message: diagnosticMessage,
      diagnostics: {
        expectedIpv4: null,
        foundIpv4: [],
        foundIpv6: [],
        expectedTxtFqdn,
        txtMatched: true,
        aMatched: true,
      },
    };
  } finally {
    if (inFlightDomainLocks.get(row.id)?.lockedBy === lockOwner) inFlightDomainLocks.delete(row.id);
    if (dbLeaseAcquired) {
      await prisma.customDomain
        .update({
          where: { id: row.id, lockedBy: lockOwner, lockedUntil: { gt: options?.now ?? new Date() } },
          data: { lockedUntil: null, lockedBy: null },
        })
        .catch(() => undefined);
    }
  }
}

export async function deleteCustomDomain(tenantId: string, domainId: string): Promise<void> {
  const cleanTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
  const cleanDomainId = typeof domainId === "string" ? domainId.trim() : "";
  if (!cleanTenantId || !cleanDomainId) {
    throw new DomainValidationError("Domínio não encontrado", 404);
  }

  let deletedDomainHost: string;
  try {
    deletedDomainHost = await prisma.$transaction(
      async (tx) => {
        const row = await tx.customDomain.findFirst({
          where: { id: cleanDomainId, tenantId: cleanTenantId },
        });
        if (!row) {
          throw new DomainValidationError("Domínio não encontrado ou não pertence a esta empresa.", 404);
        }

        // Impede exclusão enquanto houver LP publicada vinculada (não deixa onDelete SetNull criar órfã)
        const publishedLps = await tx.landingPage.findMany({
          where: {
            tenantId: cleanTenantId,
            customDomainId: row.id,
            status: LPStatus.PUBLISHED,
          },
          select: { id: true, slug: true },
          take: 5,
        });
        if (publishedLps.length > 0) {
          const slugs = publishedLps.map((l) => l.slug).join(", ");
          throw new DomainConflictError(
            `Não é possível excluir o domínio "${row.domain}" enquanto houver Landing Page(s) publicada(s) vinculada(s) (${slugs}). Despublique ou reassocie a(s) LP(s) para outro domínio antes de excluir.`
          );
        }

        // Limpa associações pertinentes em LPs não publicadas e eventual homeLandingPageId
        await tx.landingPage.updateMany({
          where: {
            tenantId: cleanTenantId,
            customDomainId: row.id,
            status: { not: LPStatus.PUBLISHED },
          },
          data: { customDomainId: null, editorialRevision: { increment: 1 } },
        });
        await tx.customDomain.update({
          where: { id: row.id },
          data: { homeLandingPageId: null },
        });

        const deleted = await tx.customDomain.deleteMany({
          where: { id: row.id, tenantId: cleanTenantId },
        });
        if (deleted.count === 0) {
          throw new DomainValidationError("Domínio não encontrado ou não pertence a esta empresa.", 404);
        }
        return row.domain;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    if (err instanceof DomainConflictError || err instanceof DomainValidationError) {
      throw err;
    }
    const prismaCode = (err as { code?: string })?.code;
    if (prismaCode === "P2034") {
      throw new DomainConcurrencyError(
        "Conflito de concorrência com publicação em andamento neste domínio. Tente novamente após concluir."
      );
    }
    throw err;
  }

  await invalidateDomainMapping(deletedDomainHost);
}

export const CADDY_ALLOW_DB_TIMEOUT_MS = 3000;
export const DOMAIN_TLS_MAX_VERIFICATION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias de janela máxima sem revalidação
export const DOMAIN_TLS_MAX_CONSECUTIVE_TRANSIENT_FAILURES = 5;

export type CaddyAllowDecisionReason =
  | "allowed"
  | "missing_domain"
  | "invalid_or_reserved_domain"
  | "non_canonical_domain"
  | "domain_not_found"
  | "tenant_inactive"
  | "dns_not_verified"
  | "verification_expired"
  | "database_error";

export type CaddyAllowDecision = {
  allowed: boolean;
  statusCode: 200 | 400 | 403 | 404 | 503;
  domain: string | null;
  tenantId: string | null;
  reason: CaddyAllowDecisionReason;
};

/**
 * Avalia de forma curta, indexada e somente-leitura se o Caddy pode emitir/renovar
 * certificado TLS sob demanda (`on_demand_tls` -> `ask`) para o hostname informado.
 *
 * Regras estritas:
 * - Exige hostname canônico válido e não reservado (recusa IP, localhost, host do painel,
 *   .stage.consult, sufixos públicos puros, portas, caminhos, wildcard ou formas não-canônicas).
 * - Consulta indexada por `CustomDomain.domain` (@unique), sem consultar DNS, sem emitir
 *   certificado e sem alterar nenhum estado no banco.
 * - Exige `tenant.isActive === true` e `dnsStatus === DnsStatus.VERIFIED` conforme a política de validade.
 * - NÃO exige `sslStatus === ACTIVE` nem LP publicada (autoriza a emissão do primeiro certificado).
 * - Qualquer falha ou indisponibilidade do banco nega a autorização (fail-closed -> HTTP 503).
 */
export async function checkCaddyOnDemandTlsAllow(
  rawDomain: string | null | undefined,
  options?: {
    env?: NodeJS.ProcessEnv;
    now?: Date;
    dbTimeoutMs?: number;
    maxVerificationAgeMs?: number;
    maxConsecutiveTransientFailures?: number;
  }
): Promise<CaddyAllowDecision> {
  if (typeof rawDomain !== "string" || rawDomain.trim().length === 0) {
    return {
      allowed: false,
      statusCode: 400,
      domain: null,
      tenantId: null,
      reason: "missing_domain",
    };
  }

  const env = options?.env ?? process.env;
  const trimmed = rawDomain.trim();

  let canonicalDomain: string;
  try {
    const parsed = parseCustomDomainHostname(trimmed, { env });
    canonicalDomain = parsed.canonicalDomain;
  } catch {
    return {
      allowed: false,
      statusCode: 403,
      domain: null,
      tenantId: null,
      reason: "invalid_or_reserved_domain",
    };
  }

  // Exige que o hostname solicitado no handshake SNI já esteja na representação canônica ASCII
  if (trimmed !== canonicalDomain) {
    return {
      allowed: false,
      statusCode: 403,
      domain: canonicalDomain,
      tenantId: null,
      reason: "non_canonical_domain",
    };
  }

  const dbTimeoutMs = options?.dbTimeoutMs ?? CADDY_ALLOW_DB_TIMEOUT_MS;
  const now = options?.now ? new Date(options.now.getTime()) : new Date();
  const maxVerificationAgeMs =
    options?.maxVerificationAgeMs ?? DOMAIN_TLS_MAX_VERIFICATION_AGE_MS;
  const maxTransientFailures =
    options?.maxConsecutiveTransientFailures ??
    DOMAIN_TLS_MAX_CONSECUTIVE_TRANSIENT_FAILURES;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const row = await Promise.race([
      prisma.customDomain.findUnique({
        where: { domain: canonicalDomain },
        select: {
          id: true,
          domain: true,
          tenantId: true,
          dnsStatus: true,
          sslStatus: true,
          lastCheckedAt: true,
          consecutiveFailures: true,
          lastReasonCode: true,
          tenant: {
            select: {
              id: true,
              isActive: true,
            },
          },
        },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Caddy allow DB query timed out"));
        }, dbTimeoutMs);
      }),
    ]);

    if (!row || row.domain !== canonicalDomain) {
      return {
        allowed: false,
        statusCode: 404,
        domain: canonicalDomain,
        tenantId: null,
        reason: "domain_not_found",
      };
    }

    if (!row.tenant || !row.tenant.isActive) {
      return {
        allowed: false,
        statusCode: 403,
        domain: canonicalDomain,
        tenantId: row.tenantId,
        reason: "tenant_inactive",
      };
    }

    if (row.dnsStatus !== DnsStatus.VERIFIED) {
      return {
        allowed: false,
        statusCode: 403,
        domain: canonicalDomain,
        tenantId: row.tenantId,
        reason: "dns_not_verified",
      };
    }

    // Política de validade da verificação DNS:
    // 1. Se houver código de falha definitiva de DNS registrado, nega.
    const DEFINITIVE_DNS_FAILURE_CODES = new Set([
      "DNS_MISSING_RECORDS",
      "DNS_PROPAGATING_PARTIAL",
      "DNS_WRONG_TARGET",
      "DNS_CONFLICTING_A_RECORDS",
      "DNS_WRONG_TXT_TOKEN",
      "DNS_AAAA_CONFLICT",
    ]);
    if (row.lastReasonCode && DEFINITIVE_DNS_FAILURE_CODES.has(row.lastReasonCode)) {
      return {
        allowed: false,
        statusCode: 403,
        domain: canonicalDomain,
        tenantId: row.tenantId,
        reason: "dns_not_verified",
      };
    }

    // 2. Excesso de falhas transitórias consecutivas ou verificação vencida além da janela máxima de validade
    const consecutiveFailures = row.consecutiveFailures ?? 0;
    if (consecutiveFailures > maxTransientFailures) {
      return {
        allowed: false,
        statusCode: 403,
        domain: canonicalDomain,
        tenantId: row.tenantId,
        reason: "verification_expired",
      };
    }

    if (row.lastCheckedAt) {
      const checkedMs = new Date(row.lastCheckedAt).getTime();
      if (!Number.isNaN(checkedMs) && now.getTime() - checkedMs > maxVerificationAgeMs) {
        return {
          allowed: false,
          statusCode: 403,
          domain: canonicalDomain,
          tenantId: row.tenantId,
          reason: "verification_expired",
        };
      }
    }

    return {
      allowed: true,
      statusCode: 200,
      domain: canonicalDomain,
      tenantId: row.tenantId,
      reason: "allowed",
    };
  } catch {
    // Fail-closed: qualquer erro ou timeout de banco nega a emissão do certificado
    return {
      allowed: false,
      statusCode: 503,
      domain: canonicalDomain,
      tenantId: null,
      reason: "database_error",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const DEFAULT_CADDY_TLS_TIMEOUT_MS = 10_000;

export type TlsVerificationReasonCode =
  | "TLS_ACTIVE"
  | "TLS_TIMEOUT"
  | "TLS_CONNECT_ERROR"
  | "TLS_UNTRUSTED_CHAIN"
  | "TLS_HOSTNAME_MISMATCH"
  | "TLS_CERT_EXPIRED"
  | "TLS_CERT_NOT_YET_VALID"
  | "TLS_INVALID_CERT"
  | "TLS_DNS_NOT_VERIFIED";

export type TlsPeerCertificateInfo = {
  subject?: { CN?: string; [k: string]: unknown };
  issuer?: { CN?: string; O?: string; [k: string]: unknown };
  subjectaltname?: string;
  valid_from: string;
  valid_to: string;
  fingerprint256?: string;
  serialNumber?: string;
  raw?: Buffer;
};

export type ControlledTlsHandshakeParams = {
  targetHost: string;
  targetPort: number;
  servername: string;
  timeoutMs: number;
  ca?: string | Buffer | Array<string | Buffer>;
  rejectUnauthorized?: boolean;
};

export type ControlledTlsHandshakeOutcome = {
  connected: boolean;
  authorized: boolean;
  authorizationError?: string | Error | null;
  peerCertificate: TlsPeerCertificateInfo | null;
  httpStatusCode?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type TlsHandshakeAdapter = (
  params: ControlledTlsHandshakeParams
) => Promise<ControlledTlsHandshakeOutcome>;

export type ReconcileCaddyTlsResult = {
  domain: CustomDomainWithInstructions;
  reconciled: boolean;
  sslStatus: SslStatus;
  reasonCode: TlsVerificationReasonCode;
  transient: boolean;
  message: string;
  diagnostics: {
    targetHost: string;
    targetPort: number;
    servername: string;
    httpStatusCode: number | null;
    validFrom: string | null;
    validTo: string | null;
    issuerCn: string | null;
    subjectCn: string | null;
  };
};

const UNTRUSTED_TLS_CHAIN_CODES = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_GET_CRL",
  "CERT_UNTRUSTED",
  "CERT_REJECTED",
  "INVALID_CA",
  "ERR_TLS_CERT_SIGNATURE_FAILURE",
]);

/**
 * Executa um handshake TLS controlado diretamente contra o endpoint aprovado do Caddy
 * (ex.: `caddy:443` ou `127.0.0.1:443`), enviando o SNI (`servername`) do domínio do cliente
 * e mantendo `rejectUnauthorized: true`.
 *
 * - Não permite desativar validação TLS (`rejectUnauthorized: false` lança erro).
 * - Envia `HEAD /` sobre o socket TLS autenticado (com `Connection: close`), sem seguir
 *   nenhum redirecionamento HTTP (`3xx`). Resposta `HTTP 404` antes da primeira LP é aceita.
 */
export async function defaultTlsHandshakeAdapter(
  params: ControlledTlsHandshakeParams
): Promise<ControlledTlsHandshakeOutcome> {
  if (params.rejectUnauthorized === false) {
    throw new DomainValidationError(
      "Desativação de validação TLS (rejectUnauthorized=false) é estritamente proibida."
    );
  }

  return new Promise<ControlledTlsHandshakeOutcome>((resolve) => {
    let settled = false;
    let peerCertSnapshot: TlsPeerCertificateInfo | null = null;
    let authorizedSnapshot = false;
    let authErrorSnapshot: string | Error | null = null;
    let httpStatusCode: number | null = null;

    const finish = (outcome: ControlledTlsHandshakeOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        // ignora
      }
      resolve(outcome);
    };

    const socket = tls.connect({
      host: params.targetHost,
      port: params.targetPort,
      servername: params.servername,
      rejectUnauthorized: true,
      ca: params.ca,
      // Mantém a verificação de identidade padrão do Node.js contra params.servername
      checkServerIdentity: (host, cert) => tls.checkServerIdentity(host, cert),
    });

    const timer = setTimeout(() => {
      finish({
        connected: false,
        authorized: false,
        authorizationError: null,
        peerCertificate: peerCertSnapshot,
        httpStatusCode: null,
        errorCode: "ETIMEOUT",
        errorMessage: `Tempo limite excedido (${params.timeoutMs}ms) no handshake TLS com ${params.targetHost}:${params.targetPort} (SNI: ${params.servername}).`,
      });
    }, params.timeoutMs);

    socket.once("secureConnect", () => {
      authorizedSnapshot = socket.authorized;
      authErrorSnapshot = socket.authorizationError ?? null;
      const rawCert = socket.getPeerCertificate(true);
      if (rawCert && Object.keys(rawCert).length > 0) {
        peerCertSnapshot = {
          subject: rawCert.subject as { CN?: string; [k: string]: unknown } | undefined,
          issuer: rawCert.issuer as { CN?: string; O?: string; [k: string]: unknown } | undefined,
          subjectaltname: rawCert.subjectaltname,
          valid_from: rawCert.valid_from,
          valid_to: rawCert.valid_to,
          fingerprint256: rawCert.fingerprint256,
          serialNumber: rawCert.serialNumber,
          raw: rawCert.raw,
        };
      }

      // Envia HEAD / sem seguir redirects; HTTP 404 antes da primeira LP publicada é válido.
      const headReq =
        `HEAD / HTTP/1.1\r\n` +
        `Host: ${params.servername}\r\n` +
        `User-Agent: stage-tls-reconciler/1.0\r\n` +
        `Connection: close\r\n\r\n`;
      socket.write(headReq);
    });

    let responseHeadBuf = "";
    socket.on("data", (chunk: Buffer) => {
      if (httpStatusCode !== null) return;
      responseHeadBuf += chunk.toString("latin1");
      const lineEnd = responseHeadBuf.indexOf("\r\n");
      if (lineEnd !== -1) {
        const statusLine = responseHeadBuf.slice(0, lineEnd);
        const match = /^HTTP\/1\.[01]\s+(\d{3})\b/i.exec(statusLine);
        if (match) {
          httpStatusCode = Number(match[1]);
        }
        finish({
          connected: true,
          authorized: authorizedSnapshot,
          authorizationError: authErrorSnapshot,
          peerCertificate: peerCertSnapshot,
          httpStatusCode,
          errorCode: null,
          errorMessage: null,
        });
      }
    });

    socket.once("end", () => {
      finish({
        connected: true,
        authorized: authorizedSnapshot,
        authorizationError: authErrorSnapshot,
        peerCertificate: peerCertSnapshot,
        httpStatusCode,
        errorCode: null,
        errorMessage: null,
      });
    });

    socket.once("close", () => {
      if (!settled && peerCertSnapshot) {
        finish({
          connected: true,
          authorized: authorizedSnapshot,
          authorizationError: authErrorSnapshot,
          peerCertificate: peerCertSnapshot,
          httpStatusCode,
          errorCode: null,
          errorMessage: null,
        });
      }
    });

    socket.once("error", (err: Error & { code?: string; cert?: TlsPeerCertificateInfo }) => {
      const code = String(err.code || "").trim();
      const errCert = err.cert;
      if (!peerCertSnapshot && errCert && typeof errCert === "object") {
        peerCertSnapshot = errCert;
      }
      finish({
        connected: false,
        authorized: false,
        authorizationError: err,
        peerCertificate: peerCertSnapshot,
        httpStatusCode: null,
        errorCode: code || "TLS_ERROR",
        errorMessage: err.message || "Falha no handshake TLS",
      });
    });
  });
}

function matchesDnsPattern(hostname: string, pattern: string): boolean {
  const cleanHost = hostname.trim().toLowerCase();
  const cleanPattern = pattern.trim().toLowerCase();
  if (!cleanHost || !cleanPattern) return false;
  if (cleanHost === cleanPattern) return true;
  if (cleanPattern.startsWith("*.")) {
    const suffix = cleanPattern.slice(1); // ".exemplo.com"
    if (!cleanHost.endsWith(suffix)) return false;
    const prefix = cleanHost.slice(0, -suffix.length);
    return prefix.length > 0 && !prefix.includes(".");
  }
  return false;
}

export function verifyCertificateHostname(
  expectedHostname: string,
  cert: TlsPeerCertificateInfo
): { valid: boolean; reason?: string } {
  const cleanExpected = expectedHostname.trim().toLowerCase();
  if (!cleanExpected) {
    return { valid: false, reason: "Hostname esperado vazio." };
  }

  // 1. Verifica via tls.checkServerIdentity nativo do Node.js
  try {
    const identityErr = tls.checkServerIdentity(
      cleanExpected,
      cert as unknown as tls.PeerCertificate
    );
    if (identityErr) {
      return { valid: false, reason: identityErr.message };
    }
  } catch (err) {
    return { valid: false, reason: (err as Error).message };
  }

  // 2. Confirmação explícita em subjectaltname (DNS:...) ou subject.CN
  if (typeof cert.subjectaltname === "string" && cert.subjectaltname.trim().length > 0) {
    const dnsEntries = cert.subjectaltname
      .split(",")
      .map((part) => part.trim())
      .filter((part) => /^DNS:/i.test(part))
      .map((part) => part.replace(/^DNS:/i, "").trim());

    if (dnsEntries.length > 0) {
      const matched = dnsEntries.some((pattern) => matchesDnsPattern(cleanExpected, pattern));
      if (!matched) {
        return {
          valid: false,
          reason: `O certificado apresentado (${dnsEntries.join(", ")}) não corresponde ao domínio "${cleanExpected}".`,
        };
      }
      return { valid: true };
    }
  }

  const cn = typeof cert.subject?.CN === "string" ? cert.subject.CN.trim() : "";
  if (cn && matchesDnsPattern(cleanExpected, cn)) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `O certificado apresentado (CN=${cn || "ausente"}) não corresponde ao domínio "${cleanExpected}".`,
  };
}

export function evaluateTlsHandshakeOutcome(
  canonicalDomain: string,
  outcome: ControlledTlsHandshakeOutcome,
  now: Date
): {
  valid: boolean;
  reasonCode: TlsVerificationReasonCode;
  transient: boolean;
  message: string;
} {
  const rawErrCode = String(
    outcome.errorCode ||
      (typeof outcome.authorizationError === "object" && outcome.authorizationError
        ? (outcome.authorizationError as { code?: string }).code
        : outcome.authorizationError) ||
      ""
  )
    .trim()
    .toUpperCase();
  const rawErrMsg = String(
    outcome.errorMessage ||
      (outcome.authorizationError instanceof Error
        ? outcome.authorizationError.message
        : outcome.authorizationError) ||
      ""
  ).trim();

  // 1. Classificação de erros ocorridos antes/durante a conclusão do handshake
  if (!outcome.connected) {
    if (
      rawErrCode === "ETIMEOUT" ||
      rawErrCode === "TLS_HANDSHAKE_TIMEOUT" ||
      /timed?\s*out/i.test(rawErrMsg)
    ) {
      return {
        valid: false,
        reasonCode: "TLS_TIMEOUT",
        transient: true,
        message: `Tempo limite excedido ao negociar certificado TLS para "${canonicalDomain}" no Caddy.`,
      };
    }

    if (
      rawErrCode === "ERR_TLS_CERT_ALTNAME_INVALID" ||
      /hostname\/ip does not match|altname/i.test(rawErrMsg)
    ) {
      return {
        valid: false,
        reasonCode: "TLS_HOSTNAME_MISMATCH",
        transient: false,
        message: `O certificado TLS retornado não pertence ao domínio "${canonicalDomain}" (${rawErrMsg || rawErrCode}).`,
      };
    }

    if (rawErrCode === "CERT_HAS_EXPIRED" || /certificate has expired/i.test(rawErrMsg)) {
      return {
        valid: false,
        reasonCode: "TLS_CERT_EXPIRED",
        transient: false,
        message: `O certificado TLS apresentado para "${canonicalDomain}" está expirado.`,
      };
    }

    if (rawErrCode === "CERT_NOT_YET_VALID" || /certificate is not yet valid/i.test(rawErrMsg)) {
      return {
        valid: false,
        reasonCode: "TLS_CERT_NOT_YET_VALID",
        transient: false,
        message: `O certificado TLS apresentado para "${canonicalDomain}" ainda não atingiu a data inicial de validade.`,
      };
    }

    if (
      UNTRUSTED_TLS_CHAIN_CODES.has(rawErrCode) ||
      /self[- ]signed|unable to verify the first certificate|untrusted/i.test(rawErrMsg)
    ) {
      return {
        valid: false,
        reasonCode: "TLS_UNTRUSTED_CHAIN",
        transient: false,
        message: `Cadeia de certificação TLS não confiável ou autoassinada para "${canonicalDomain}" (${rawErrCode || rawErrMsg}).`,
      };
    }

    return {
      valid: false,
      reasonCode: "TLS_CONNECT_ERROR",
      transient: true,
      message: `Certificado TLS em provisionamento ou conexão TLS indisponível para "${canonicalDomain}" (${rawErrCode || rawErrMsg || "aguardando emissão pelo Caddy"}).`,
    };
  }

  // 2. Verificação de presença do certificado
  const cert = outcome.peerCertificate;
  if (!cert || typeof cert !== "object" || Object.keys(cert).length === 0) {
    return {
      valid: false,
      reasonCode: "TLS_INVALID_CERT",
      transient: false,
      message: `Nenhum certificado X.509 foi apresentado pelo servidor para "${canonicalDomain}".`,
    };
  }

  // 3. Verificação da cadeia confiável (authorized === true e sem authorizationError)
  if (!outcome.authorized || outcome.authorizationError) {
    if (
      rawErrCode === "ERR_TLS_CERT_ALTNAME_INVALID" ||
      /hostname\/ip does not match|altname/i.test(rawErrMsg)
    ) {
      return {
        valid: false,
        reasonCode: "TLS_HOSTNAME_MISMATCH",
        transient: false,
        message: `O certificado TLS apresentado não corresponde ao hostname "${canonicalDomain}".`,
      };
    }
    if (rawErrCode === "CERT_HAS_EXPIRED" || /certificate has expired/i.test(rawErrMsg)) {
      return {
        valid: false,
        reasonCode: "TLS_CERT_EXPIRED",
        transient: false,
        message: `O certificado TLS apresentado para "${canonicalDomain}" está expirado.`,
      };
    }
    if (rawErrCode === "CERT_NOT_YET_VALID" || /certificate is not yet valid/i.test(rawErrMsg)) {
      return {
        valid: false,
        reasonCode: "TLS_CERT_NOT_YET_VALID",
        transient: false,
        message: `O certificado TLS apresentado para "${canonicalDomain}" ainda não é válido.`,
      };
    }
    return {
      valid: false,
      reasonCode: "TLS_UNTRUSTED_CHAIN",
      transient: false,
      message: `Cadeia de certificação TLS inválida ou não confiável para "${canonicalDomain}" (${rawErrCode || rawErrMsg || "untrusted_chain"}).`,
    };
  }

  // 4. Verificação estrita do hostname no certificado (SAN / CN)
  const hostCheck = verifyCertificateHostname(canonicalDomain, cert);
  if (!hostCheck.valid) {
    return {
      valid: false,
      reasonCode: "TLS_HOSTNAME_MISMATCH",
      transient: false,
      message:
        hostCheck.reason ||
        `O certificado TLS apresentado não é válido para o hostname "${canonicalDomain}".`,
    };
  }

  // 5. Verificação de validade temporal (valid_from <= now < valid_to)
  const validFromMs = typeof cert.valid_from === "string" ? Date.parse(cert.valid_from) : NaN;
  const validToMs = typeof cert.valid_to === "string" ? Date.parse(cert.valid_to) : NaN;
  if (Number.isNaN(validFromMs) || Number.isNaN(validToMs)) {
    return {
      valid: false,
      reasonCode: "TLS_INVALID_CERT",
      transient: false,
      message: `Datas de validade ausentes ou malformadas no certificado de "${canonicalDomain}".`,
    };
  }

  const nowMs = now.getTime();
  if (nowMs < validFromMs) {
    return {
      valid: false,
      reasonCode: "TLS_CERT_NOT_YET_VALID",
      transient: false,
      message: `Certificado TLS de "${canonicalDomain}" ainda não está vigente (valid_from: ${cert.valid_from}).`,
    };
  }

  if (nowMs >= validToMs) {
    return {
      valid: false,
      reasonCode: "TLS_CERT_EXPIRED",
      transient: false,
      message: `Certificado TLS de "${canonicalDomain}" expirou em ${cert.valid_to}.`,
    };
  }

  // 6. Sucesso: cadeia confiável, hostname compatível e validade temporal ativa.
  // Nota: HTTP 404 (antes da primeira LP publicada) é perfeitamente válido e não impede ativação TLS.
  const httpStatusNote =
    typeof outcome.httpStatusCode === "number" ? ` (HTTP ${outcome.httpStatusCode})` : "";
  return {
    valid: true,
    reasonCode: "TLS_ACTIVE",
    transient: false,
    message: `Certificado HTTPS de "${canonicalDomain}" validado e ativo no Caddy (válido até ${cert.valid_to})${httpStatusNote}.`,
  };
}

/**
 * Reconcilia o estado do certificado TLS de um domínio customizado junto ao Caddy:
 * - Exige que `dnsStatus === VERIFIED` já esteja persistido no banco.
 * - Inicia conexão TLS controlada ao destino aprovado pelo servidor (`resolveCaddyTlsProbeTarget`,
 *   ex.: `caddy:443` ou `127.0.0.1:443`) com SNI do domínio canônico do cliente.
 * - Valida cadeia confiável, identidade do hostname e validade temporal.
 * - Somente após sucesso marca `sslStatus = ACTIVE` (mesmo que o HTTP retorne 404 antes da 1ª LP).
 * - Na emissão inicial com timeout/provisionamento em curso, mantém `PROVISIONING` com retentativas;
 *   em falha de validação do certificado (nome incorreto, cadeia inválida, expirado), marca `FAILED` e registra diagnóstico.
 */
export async function reconcileCaddyDomainTls(
  tenantId: string,
  domainId: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    now?: Date;
    tlsHandshake?: TlsHandshakeAdapter;
    timeoutMs?: number;
    ca?: string | Buffer | Array<string | Buffer>;
    rejectUnauthorized?: boolean;
    revalidateIntervalMs?: number;
    workerId?: string;
  }
): Promise<ReconcileCaddyTlsResult> {
  if (options?.rejectUnauthorized === false) {
    throw new DomainValidationError(
      "Desativação de validação TLS (rejectUnauthorized=false) é estritamente proibida."
    );
  }

  const cleanTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
  const cleanDomainId = typeof domainId === "string" ? domainId.trim() : "";
  if (!cleanTenantId || !cleanDomainId) {
    throw new DomainValidationError("Domínio não encontrado");
  }

  const env = options?.env ?? process.env;
  let now = options?.now ? new Date(options.now.getTime()) : new Date();
  const revalidateIntervalMs =
    options?.revalidateIntervalMs ?? DOMAIN_ACTIVE_REVALIDATION_INTERVAL_MS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_CADDY_TLS_TIMEOUT_MS;

  const row = await prisma.customDomain.findFirst({
    where: { id: cleanDomainId, tenantId: cleanTenantId },
  });
  if (!row) {
    throw new DomainValidationError("Domínio não encontrado");
  }

  if (isDomainLockedAt(row, now)) {
    throw new DomainConcurrencyError(
      `Uma reconciliação já está em andamento para o domínio "${row.domain}". Aguarde alguns instantes.`
    );
  }

  const parsed = parseCustomDomainHostname(row.domain, { env });
  const target = resolveCaddyTlsProbeTarget(env);

  // Nunca dispara conexão TLS ao Caddy se o DNS não estiver VERIFIED persistido no banco
  if (row.dnsStatus !== DnsStatus.VERIFIED) {
    return {
      domain: serializeDomain(row, { env }),
      reconciled: false,
      sslStatus: row.sslStatus,
      reasonCode: "TLS_DNS_NOT_VERIFIED",
      transient: false,
      message: `Reconciliação TLS ignorada para "${parsed.canonicalDomain}": o DNS precisa estar VERIFIED antes de iniciar handshake no Caddy.`,
      diagnostics: {
        targetHost: target.host,
        targetPort: target.port,
        servername: parsed.canonicalDomain,
        httpStatusCode: null,
        validFrom: null,
        validTo: null,
        issuerCn: null,
        subjectCn: null,
      },
    };
  }

  if (!options?.now) now = new Date(); // lease starts at the actual claim, after DB/rate-limit work
  const lockOwner = `${options?.workerId || "domain"}:${randomUUID()}`;
  const leaseExpiresAt = new Date(now.getTime() + DOMAIN_LEASE_DURATION_MS);

  inFlightDomainLocks.set(row.id, {
    lockedBy: lockOwner,
    expiresAt: leaseExpiresAt.getTime(),
  });

  let dbLeaseAcquired = false;
  try {
    const claim = await prisma.customDomain.updateMany({
      where: { id: row.id, tenantId: cleanTenantId,
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
      data: { lockedUntil: leaseExpiresAt, lockedBy: lockOwner },
    });
    if (claim.count !== 1) throw new DomainConcurrencyError("Domínio já possui verificação em andamento");
    dbLeaseAcquired = true;

    const handshakeFn: TlsHandshakeAdapter =
      options?.tlsHandshake ?? defaultTlsHandshakeAdapter;

    // Conexão TLS executada FORA de qualquer transação de banco
    const outcome = await handshakeFn({
      targetHost: target.host,
      targetPort: target.port,
      servername: parsed.canonicalDomain,
      timeoutMs,
      ca: options?.ca,
      rejectUnauthorized: true,
    });

    const evaluation = evaluateTlsHandshakeOutcome(parsed.canonicalDomain, outcome, now);
    const prevAttempts = row.checkAttempts ?? 0;
    const prevConsecutiveFailures = row.consecutiveFailures ?? 0;

    if (evaluation.valid) {
      const nextCheckAt = computeNextDomainCheckAt({
        now,
        dnsStatus: DnsStatus.VERIFIED,
        sslStatus: SslStatus.ACTIVE,
        transient: false,
        attempts: 0,
        consecutiveFailures: 0,
        revalidateIntervalMs,
      });

      const updated = await prisma.customDomain.update({
        where: { id: row.id, lockedBy: lockOwner, lockedUntil: { gt: options?.now ?? new Date() } },
        data: {
          sslStatus: SslStatus.ACTIVE,
          lastCheckedAt: now,
          nextCheckAt,
          checkAttempts: 0,
          consecutiveFailures: 0,
          lastReasonCode: "TLS_ACTIVE",
          lastError: null,
          lockedUntil: null,
          lockedBy: null,
        },
      });
      dbLeaseAcquired = false;

      await invalidateDomainMapping(parsed.canonicalDomain);

      return {
        domain: serializeDomain(updated, { env }),
        reconciled: true,
        sslStatus: SslStatus.ACTIVE,
        reasonCode: "TLS_ACTIVE",
        transient: false,
        message: evaluation.message,
        diagnostics: {
          targetHost: target.host,
          targetPort: target.port,
          servername: parsed.canonicalDomain,
          httpStatusCode: outcome.httpStatusCode ?? null,
          validFrom: outcome.peerCertificate?.valid_from ?? null,
          validTo: outcome.peerCertificate?.valid_to ?? null,
          issuerCn:
            typeof outcome.peerCertificate?.issuer?.CN === "string"
              ? outcome.peerCertificate.issuer.CN
              : null,
          subjectCn:
            typeof outcome.peerCertificate?.subject?.CN === "string"
              ? outcome.peerCertificate.subject.CN
              : null,
        },
      };
    }

    const nextAttempts = prevAttempts + 1;
    const nextConsecutiveFailures = prevConsecutiveFailures + 1;

    let nextSslStatus: SslStatus;
    if (evaluation.transient) {
      // Em emissão inicial (PENDING/PROVISIONING), mantém PROVISIONING com retentativas.
      // Em revalidação de certificado já ACTIVE, preserva ACTIVE até o limite de falhas transitórias consecutivas.
      if (row.sslStatus === SslStatus.PENDING || row.sslStatus === SslStatus.PROVISIONING) {
        nextSslStatus = SslStatus.PROVISIONING;
      } else if (
        row.sslStatus === SslStatus.ACTIVE &&
        nextConsecutiveFailures <= DOMAIN_TLS_MAX_CONSECUTIVE_TRANSIENT_FAILURES
      ) {
        nextSslStatus = SslStatus.ACTIVE;
      } else {
        nextSslStatus = SslStatus.FAILED;
      }
    } else {
      // Falha definitiva de certificado (nome incorreto, cadeia não confiável, expirado): marca FAILED
      nextSslStatus = SslStatus.FAILED;
    }

    const nextCheckAt = computeNextDomainCheckAt({
      now,
      dnsStatus: DnsStatus.VERIFIED,
      sslStatus:
        nextSslStatus === SslStatus.ACTIVE ? SslStatus.PROVISIONING : nextSslStatus,
      transient: evaluation.transient,
      attempts: nextAttempts,
      consecutiveFailures: nextConsecutiveFailures,
      revalidateIntervalMs,
    });

    const updated = await prisma.customDomain.update({
      where: { id: row.id, lockedBy: lockOwner, lockedUntil: { gt: options?.now ?? new Date() } },
      data: {
        sslStatus: nextSslStatus,
        lastCheckedAt: now,
        nextCheckAt,
        checkAttempts: nextAttempts,
        consecutiveFailures: nextConsecutiveFailures,
        lastReasonCode: evaluation.reasonCode,
        lastError: evaluation.message,
        lockedUntil: null,
        lockedBy: null,
      },
    });
    dbLeaseAcquired = false;

    if (nextSslStatus === SslStatus.FAILED) {
      await invalidateDomainMapping(parsed.canonicalDomain);
    }

    return {
      domain: serializeDomain(updated, { env }),
      reconciled: false,
      sslStatus: nextSslStatus,
      reasonCode: evaluation.reasonCode,
      transient: evaluation.transient,
      message: evaluation.message,
      diagnostics: {
        targetHost: target.host,
        targetPort: target.port,
        servername: parsed.canonicalDomain,
        httpStatusCode: outcome.httpStatusCode ?? null,
        validFrom: outcome.peerCertificate?.valid_from ?? null,
        validTo: outcome.peerCertificate?.valid_to ?? null,
        issuerCn:
          typeof outcome.peerCertificate?.issuer?.CN === "string"
            ? outcome.peerCertificate.issuer.CN
            : null,
        subjectCn:
          typeof outcome.peerCertificate?.subject?.CN === "string"
            ? outcome.peerCertificate.subject.CN
            : null,
      },
    };
  } finally {
    if (inFlightDomainLocks.get(row.id)?.lockedBy === lockOwner) inFlightDomainLocks.delete(row.id);
    if (dbLeaseAcquired) {
      await prisma.customDomain
        .update({
          where: { id: row.id, lockedBy: lockOwner, lockedUntil: { gt: options?.now ?? new Date() } },
          data: { lockedUntil: null, lockedBy: null },
        })
        .catch(() => undefined);
    }
  }
}

