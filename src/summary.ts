// Quadros de resumo do "Sobre" e o resumo de linguagens da seção "GitHub".
import type { Profile } from "./content.ts";
import type { CodeStats } from "./github.ts";
import type { CodeSummary, Fact, LanguageShare } from "./page.ts";
import { isGitHubLogin } from "./validate.ts";

/** Monta os quadros de resumo só com o que já está no perfil. Quadros sem dado não aparecem. */
export function newFacts(p: Profile): Fact[] {
  const facts: Fact[] = [];
  // "Atualmente" só vale para o emprego em curso (período terminado em "atual").
  const job = p.experience[0];
  if (job && isCurrent(job.period)) {
    facts.push({ label: "Atualmente", value: job.role, detail: `${job.company} · ${job.period}` });
  }
  const edu = p.education[0];
  if (edu) {
    const detail = edu.detail !== "" ? `${edu.institution} · ${edu.detail}` : edu.institution;
    facts.push({ label: "Formação", value: edu.course, detail });
  }
  if (p.focus !== "") facts.push({ label: "Foco", value: p.focus, detail: "" });
  if (p.location !== "") facts.push({ label: "Local", value: p.location, detail: "" });
  return facts;
}

function isCurrent(period: string): boolean {
  return period.trim().toLowerCase().endsWith("atual");
}

/** Quantas linguagens aparecem pelo nome; o resto vira "Outras". */
const TOP_LANGUAGES = 5;

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Transforma os bytes por linguagem em porcentagens: as TOP_LANGUAGES maiores
 * pelo nome e o resto somado em "Outras". Devolve null sem nenhum byte, para a
 * seção não sair vazia.
 */
export function newCodeSummary(login: string, profileURL: string, stats: CodeStats): CodeSummary | null {
  let langs = [...stats.languages].filter(([, n]) => n > 0).map(([name, bytes]) => ({ name, bytes }));
  const total = langs.reduce((sum, l) => sum + l.bytes, 0);
  if (total === 0) return null;
  // Maior primeiro; empate em ordem alfabética, para o build ser estável.
  langs.sort((a, b) => b.bytes - a.bytes || compareStrings(a.name, b.name));
  if (langs.length > TOP_LANGUAGES + 1) {
    const rest = langs.slice(TOP_LANGUAGES).reduce((sum, l) => sum + l.bytes, 0);
    langs = [...langs.slice(0, TOP_LANGUAGES), { name: "Outras", bytes: rest }];
  }

  const tenths = largestRemainder(
    langs.map((l) => l.bytes),
    total,
    1000,
  );
  const languages: LanguageShare[] = langs.map((l, i) => ({
    name: l.name,
    tenths: tenths[i]!,
    shade: langs.length > TOP_LANGUAGES && i === TOP_LANGUAGES ? "other" : String(i + 1),
  }));
  return { login, profileURL, publicRepos: stats.publicRepos, repos: stats.repos, languages };
}

/**
 * Reparte scale entre os valores, proporcional a cada um, em inteiros que
 * somam exatamente scale (as porcentagens fecham em 100,0%). Usa BigInt para
 * não perder precisão com somas grandes de bytes.
 */
export function largestRemainder(values: number[], total: number, scale: number): number[] {
  const t = BigInt(total);
  const out: number[] = [];
  const rems: bigint[] = [];
  let assigned = 0;
  for (const v of values) {
    const q = BigInt(v) * BigInt(scale);
    out.push(Number(q / t));
    rems.push(q % t);
    assigned += out[out.length - 1]!;
  }
  // Ordenação estável: maiores restos primeiro, empate na ordem original.
  const order = values.map((_, i) => i).sort((a, b) => (rems[b]! > rems[a]! ? 1 : rems[b]! < rems[a]! ? -1 : 0));
  for (const i of order.slice(0, scale - assigned)) out[i]!++;
  return out;
}

/** Extrai o login de uma URL de perfil (https://github.com/login), ou null. */
export function githubLogin(profileURL: string): string | null {
  let u: URL;
  try {
    u = new URL(profileURL);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.host.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;
  let login: string;
  try {
    login = decodeURIComponent(u.pathname).replace(/^\/+|\/+$/g, "");
  } catch {
    return null;
  }
  return isGitHubLogin(login) ? login : null;
}
