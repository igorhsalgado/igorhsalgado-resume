// Dados do GitHub buscados SOMENTE no build (nunca no navegador).
// Qualquer falha (rede, rate limit, 404, JSON inesperado) devolve `null`
// e o card simplesmente omite os campos automáticos.

export interface RepoInfo {
  pushedAt: string | null;
  stars: number | null;
  htmlUrl: string | null;
  homepage: string | null;
}

const API = 'https://api.github.com/repos/';
const TIMEOUT_MS = 8000;
const cache = new Map<string, Promise<RepoInfo | null>>();

function token(): string | undefined {
  const fromProcess = typeof process !== 'undefined' ? process.env.GITHUB_TOKEN : undefined;
  return fromProcess || import.meta.env.GITHUB_TOKEN || undefined;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function httpUrl(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  try {
    const url = new URL(s);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

async function load(repo: string): Promise<RepoInfo | null> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    console.warn(`[github] repo inválido: "${repo}"`);
    return null;
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'igorhsalgado-resume-build',
  };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;

  try {
    const res = await fetch(API + repo, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[github] ${repo}: HTTP ${res.status} — usando fallback sem dados automáticos`);
      return null;
    }
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;

    const pushed = str(d.pushed_at);
    return {
      pushedAt: pushed && !Number.isNaN(Date.parse(pushed)) ? pushed : null,
      stars: typeof d.stargazers_count === 'number' ? d.stargazers_count : null,
      htmlUrl: httpUrl(d.html_url),
      homepage: httpUrl(d.homepage),
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[github] ${repo}: ${reason} — usando fallback sem dados automáticos`);
    return null;
  }
}

/** Busca (com cache por build) os metadados públicos de um repositório. */
export function getRepoInfo(repo: string): Promise<RepoInfo | null> {
  let pending = cache.get(repo);
  if (!pending) {
    pending = load(repo);
    cache.set(repo, pending);
  }
  return pending;
}

const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

/** "2026-10-12T18:00:00Z" → "12 de out. de 2026" */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}
