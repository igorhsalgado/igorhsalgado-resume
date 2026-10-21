// Busca, durante o build, os dados públicos que o site mostra: metadados de
// repositórios (último push, estrelas, links), as linguagens do código público
// do usuário e o avatar dele. O navegador do visitante nunca fala com a API.
//
// Os métodos rejeitam em qualquer falha (rede, timeout, HTTP de erro, JSON
// inesperado). Quem chama decide o fallback; o build registra um aviso e segue
// sem os dados.
import { httpURL, isGitHubLogin, isRepoName } from "./validate.ts";

/** Raiz da API REST do GitHub. */
export const DEFAULT_API_URL = "https://api.github.com";
/** Host que serve os avatares (redimensionados no servidor). */
export const DEFAULT_AVATAR_URL = "https://avatars.githubusercontent.com";
/** Limite de tempo de cada requisição, em milissegundos. */
export const DEFAULT_TIMEOUT_MS = 8000;

const USER_AGENT = "igorhsalgado-resume-build";
const MAX_JSON_BYTES = 1 << 20;
const MAX_AVATAR_BYTES = 5 << 20;
/** Tamanho de página máximo da API ao listar repositórios. */
const PER_PAGE = 100;
/** Limita a paginação (até 1000 repositórios). */
const MAX_REPO_PAGES = 10;
/** Quantas consultas de linguagens rodam ao mesmo tempo. */
const LANGUAGE_WORKERS = 4;
/** Descarta nomes de linguagem absurdos na resposta. */
const MAX_LANGUAGE_NAME = 64;

/** Campos de um repositório usados nos cards. Ausentes ou inválidos ficam com o valor zero. */
export interface Repo {
  pushedAt: Date | null;
  stars: number;
  htmlURL: string;
  homepage: string;
}

/** Resumo do código público de um usuário. */
export interface CodeStats {
  /** Total de repositórios públicos do usuário (com forks). */
  publicRepos: number;
  /** Quantos repositórios entraram na soma: os públicos do usuário, sem forks, mais os extras. */
  repos: number;
  /** Bytes de cada linguagem, como o GitHub conta. */
  languages: Map<string, number>;
}

/** Uma imagem baixada e já identificada. */
export interface Image {
  data: Uint8Array;
  /** Extensão do formato detectado: "jpg", "png" ou "webp". */
  ext: "jpg" | "png" | "webp";
}

/** O que o build usa da API do GitHub. GitHubClient implementa. */
export interface GitHubAPI {
  repo(name: string): Promise<Repo>;
  codeStats(login: string, extra: string[]): Promise<CodeStats>;
  avatar(userID: number, size: number): Promise<Image>;
}

/** Resposta HTTP fora da faixa 2xx. */
export class StatusError extends Error {
  override name = "StatusError";
  constructor(
    readonly statusCode: number,
    /** O limite de requisições da API acabou. */
    readonly rateLimited: boolean,
  ) {
    super(rateLimited ? `HTTP ${statusCode} (limite de requisições da API atingido)` : `HTTP ${statusCode}`);
  }
}

export class InvalidRepoError extends Error {
  override name = "InvalidRepoError";
  constructor(name: string) {
    super(`nome de repositório inválido: ${JSON.stringify(name)}`);
  }
}

export class InvalidLoginError extends Error {
  override name = "InvalidLoginError";
  constructor(login: string) {
    super(`login do GitHub inválido: ${JSON.stringify(login)}`);
  }
}

export interface ClientOptions {
  /** Opcional; com ele o limite de requisições da API é maior. */
  token?: string;
  apiURL?: string;
  avatarURL?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

/** Cliente da API do GitHub. Sem opções, usa os endereços padrão e DEFAULT_TIMEOUT_MS. */
export class GitHubClient implements GitHubAPI {
  readonly token: string;
  readonly apiURL: string;
  readonly avatarURL: string;
  readonly timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(opts: ClientOptions = {}) {
    this.token = opts.token ?? "";
    this.apiURL = (opts.apiURL || DEFAULT_API_URL).replace(/\/+$/, "");
    this.avatarURL = (opts.avatarURL || DEFAULT_AVATAR_URL).replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = opts.fetch ?? fetch;
  }

  /** Metadados públicos de um repositório ("dono/nome"). */
  async repo(name: string): Promise<Repo> {
    const body = await this.#getJSON(repoPath(name));
    if (!isObject(body)) throw invalidResponse("esperava um objeto");
    const stars = field(body, "stargazers_count", "number") ?? 0;
    const pushedRaw = field(body, "pushed_at", "string") ?? "";
    const pushed = RFC3339.test(pushedRaw) ? new Date(pushedRaw) : null;
    return {
      stars: Math.max(Math.trunc(stars), 0),
      // Links que não sejam http(s) (javascript:, data:...) são descartados.
      htmlURL: httpURL(field(body, "html_url", "string") ?? "") ?? "",
      homepage: httpURL(field(body, "homepage", "string") ?? "") ?? "",
      pushedAt: pushed && !Number.isNaN(pushed.getTime()) ? pushed : null,
    };
  }

  /**
   * Quantos repositórios públicos login tem e a soma dos bytes por linguagem
   * dos repositórios públicos dele que não são fork, mais os de extra
   * ("dono/nome"; repetidos contam uma vez só).
   *
   * É tudo ou nada: se qualquer consulta falhar, rejeita, para a página nunca
   * mostrar uma soma parcial como se fosse completa.
   */
  async codeStats(login: string, extra: string[]): Promise<CodeStats> {
    if (!isGitHubLogin(login)) throw new InvalidLoginError(login);
    const userPath = `/users/${encodeURIComponent(login)}`;

    let publicRepos: number;
    try {
      const user = await this.#getJSON(userPath);
      if (!isObject(user)) throw invalidResponse("esperava um objeto");
      publicRepos = Math.max(Math.trunc(field(user, "public_repos", "number") ?? 0), 0);
    } catch (err) {
      throw wrap(`usuário ${login}`, err);
    }

    let owned: string[];
    try {
      owned = await this.#ownedRepos(userPath);
    } catch (err) {
      throw wrap(`repositórios de ${login}`, err);
    }

    const names = uniqueRepos([...owned, ...extra]);
    const languages = await this.#sumLanguages(names);
    return { publicRepos, repos: names.length, languages };
  }

  /** Bytes por linguagem de um repositório. Nomes vazios ou longos demais e contagens não positivas são descartados. */
  async languages(name: string, signal?: AbortSignal): Promise<Map<string, number>> {
    const body = await this.#getJSON(repoPath(name) + "/languages", undefined, signal);
    if (!isObject(body)) throw invalidResponse("esperava um objeto");
    const langs = new Map<string, number>();
    for (const [rawName, n] of Object.entries(body)) {
      if (typeof n !== "number" || !Number.isInteger(n)) throw invalidResponse(`bytes de ${JSON.stringify(rawName)}`);
      const lang = rawName.trim();
      if (lang === "" || new TextEncoder().encode(lang).length > MAX_LANGUAGE_NAME || n <= 0) continue;
      langs.set(lang, (langs.get(lang) ?? 0) + n);
    }
    return langs;
  }

  /**
   * Baixa o avatar do usuário com o ID numérico dado, em size×size (o GitHub
   * redimensiona no servidor). A resposta precisa declarar um Content-Type de
   * imagem e os bytes precisam ser JPEG, PNG ou WebP.
   */
  async avatar(userID: number, size: number): Promise<Image> {
    const resp = await this.#request(`${this.avatarURL}/u/${userID}?s=${size}`, { "User-Agent": USER_AGENT });
    checkStatus(resp);
    const declared = (resp.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!(declared in IMAGE_EXT)) {
      throw new Error(`Content-Type inesperado ${JSON.stringify(resp.headers.get("Content-Type") ?? "")}`);
    }
    const data = await readLimited(resp, MAX_AVATAR_BYTES);
    if (data === null || data.length === 0) throw new Error(`tamanho inesperado (${data?.length ?? "mais de 5 MiB de"} bytes)`);
    // Não confia só no cabeçalho: o formato vem dos primeiros bytes.
    const ext = sniffImage(data);
    if (!ext) throw new Error("o conteúdo não é JPEG, PNG nem WebP");
    return { data, ext };
  }

  /** Lista os repositórios públicos do usuário que não são fork. */
  async #ownedRepos(userPath: string): Promise<string[]> {
    const names: string[] = [];
    for (let page = 1; page <= MAX_REPO_PAGES; page++) {
      const query = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE), type: "owner" });
      const repos = await this.#getJSON(`${userPath}/repos`, query);
      if (!Array.isArray(repos)) throw invalidResponse("esperava uma lista");
      for (const r of repos) {
        if (!isObject(r)) throw invalidResponse("esperava um objeto");
        const fullName = field(r, "full_name", "string") ?? "";
        // Com token, a API pode listar privados; eles nunca entram.
        if (!field(r, "fork", "boolean") && !field(r, "private", "boolean")) names.push(fullName);
      }
      if (repos.length < PER_PAGE) break;
    }
    return names;
  }

  /** Consulta as linguagens de cada repositório em paralelo e soma os bytes. Para no primeiro erro. */
  async #sumLanguages(names: string[]): Promise<Map<string, number>> {
    const abort = new AbortController();
    const total = new Map<string, number>();
    let next = 0;
    let firstErr: Error | null = null;
    const worker = async () => {
      while (next < names.length && firstErr === null) {
        const name = names[next++]!;
        try {
          const langs = await this.languages(name, abort.signal);
          for (const [lang, n] of langs) total.set(lang, (total.get(lang) ?? 0) + n);
        } catch (err) {
          if (firstErr === null) {
            firstErr = wrap(`linguagens de ${name}`, err);
            abort.abort();
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(LANGUAGE_WORKERS, names.length) }, worker));
    if (firstErr !== null) throw firstErr;
    return total;
  }

  /** GET em path (relativo à raiz da API), com query opcional, e decodifica o JSON. */
  async #getJSON(path: string, query?: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
    let endpoint = this.apiURL + path;
    if (query && [...query].length > 0) {
      query.sort();
      endpoint += "?" + query.toString();
    }
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
    };
    if (this.token !== "") headers.Authorization = `Bearer ${this.token}`;

    const resp = await this.#request(endpoint, headers, signal);
    checkStatus(resp);
    const data = await readLimited(resp, MAX_JSON_BYTES);
    if (data === null) throw invalidResponse("resposta maior que 1 MiB");
    try {
      return JSON.parse(new TextDecoder().decode(data));
    } catch (err) {
      throw invalidResponse((err as Error).message);
    }
  }

  async #request(url: string, headers: Record<string, string>, signal?: AbortSignal): Promise<Response> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    try {
      return await this.#fetch(url, { headers, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    } catch (err) {
      if (timeout.aborted) throw new Error(`tempo esgotado (${this.timeoutMs} ms)`);
      throw describeFetchError(err);
    }
  }
}

const IMAGE_EXT: Record<string, Image["ext"]> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Identifica JPEG, PNG ou WebP pelos primeiros bytes (as mesmas assinaturas do http.DetectContentType do Go). */
export function sniffImage(b: Uint8Array): Image["ext"] | null {
  const starts = (sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
  if (starts([0xff, 0xd8, 0xff])) return "jpg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50, 0x56, 0x50], 8)) return "webp";
  return null;
}

/** Valida name ("dono/nome") e devolve o caminho /repos/dono/nome, com cada parte escapada. */
function repoPath(name: string): string {
  if (!isRepoName(name)) throw new InvalidRepoError(name);
  const [owner, repo] = name.split("/") as [string, string];
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

/** Tira os repetidos (sem diferenciar maiúsculas) e os nomes fora do formato dono/nome, mantendo a ordem. */
export function uniqueRepos(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key) || !isRepoName(name)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function checkStatus(resp: Response): void {
  if (resp.status >= 200 && resp.status < 300) return;
  const limited = (resp.status === 403 || resp.status === 429) && resp.headers.get("X-RateLimit-Remaining") === "0";
  // Descarta o corpo para liberar a conexão.
  resp.body?.cancel().catch(() => {});
  throw new StatusError(resp.status, limited);
}

/** Lê o corpo inteiro, ou devolve null se passar de limit bytes. */
async function readLimited(resp: Response, limit: number): Promise<Uint8Array | null> {
  if (!resp.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of resp.body) {
    size += chunk.length;
    if (size > limit) {
      await resp.body.cancel().catch(() => {});
      return null;
    }
    chunks.push(chunk);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Lê um campo da resposta: ausente ou null vira undefined; tipo errado é resposta inválida. */
function field<T extends "string" | "number" | "boolean">(
  obj: Record<string, unknown>,
  key: string,
  type: T,
): (T extends "string" ? string : T extends "number" ? number : boolean) | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== type) throw invalidResponse(`campo ${key}: esperava ${type}`);
  return v as never;
}

function invalidResponse(detail: string): Error {
  return new Error(`resposta inválida: ${detail}`);
}

function wrap(context: string, err: unknown): Error {
  const e = err instanceof Error ? err : new Error(String(err));
  const out = new Error(`${context}: ${e.message}`, { cause: e });
  return out;
}

function describeFetchError(err: unknown): Error {
  if (!(err instanceof Error)) return new Error(String(err));
  const cause = err.cause as { code?: string; message?: string } | undefined;
  const detail = cause?.code ?? cause?.message;
  return new Error(detail ? `${err.message} (${detail})` : err.message, { cause: err });
}

/** Encontra, numa cadeia de causas, o primeiro erro do tipo pedido. */
export function findCause<T extends Error>(err: unknown, type: new (...args: never[]) => T): T | null {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if (e instanceof type) return e;
  }
  return null;
}

/**
 * Guarda as respostas de api (sucesso ou falha) para não repetir consultas.
 * Usado no servidor de desenvolvimento, que renderiza a página a cada acesso.
 */
export function memoizeGitHub(api: GitHubAPI): GitHubAPI {
  const cache = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    if (!cache.has(key)) cache.set(key, fn());
    return cache.get(key) as Promise<T>;
  };
  return {
    repo: (name) => once(`repo:${name}`, () => api.repo(name)),
    codeStats: (login, extra) => once(`stats:${login}:${extra.join(",")}`, () => api.codeStats(login, extra)),
    avatar: (userID, size) => once(`avatar:${userID}:${size}`, () => api.avatar(userID, size)),
  };
}
