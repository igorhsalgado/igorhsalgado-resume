// Modelo da página: tudo o que os componentes recebem para montar index.html.
import { starsEnabled, type Profile, type Project } from "./content.ts";
import type { Repo } from "./github.ts";

export interface Page {
  title: string;
  description: string;
  canonical: string;
  styleURL: string;
  faviconURL: string;
  /** Vazio quando não há static/cv.pdf; os botões de CV somem. */
  cvURL: string;
  profile: Profile;
  /** Quadros de resumo abaixo do "Sobre". */
  facts: Fact[];
  projects: Card[];
  /** Seção "GitHub"; null quando a API falha, e a seção some. */
  code: CodeSummary | null;
  /** null quando não há foto; o texto do topo usa a largura toda. */
  photo: Photo | null;
  year: number;
}

/** A foto do topo. */
export interface Photo {
  src: string;
  srcset: string;
}

/** Um dos quadros de resumo abaixo do "Sobre". */
export interface Fact {
  label: string;
  value: string;
  /** Opcional, em tom secundário. */
  detail: string;
}

/** A seção "GitHub": linguagens do código público, já em porcentagem. */
export interface CodeSummary {
  login: string;
  profileURL: string;
  publicRepos: number;
  /** Repositórios somados nas linguagens. */
  repos: number;
  languages: LanguageShare[];
}

/** Um trecho da barra de linguagens. */
export interface LanguageShare {
  name: string;
  /** Porcentagem em décimos (413 = 41,3%). */
  tenths: number;
  /** Classe de tom de cinza: "1" a "5", ou "other". */
  shade: string;
}

/** Largura do trecho na barra, em CSS ("41.3%"). */
export function shareWidth(l: LanguageShare): string {
  return `${Math.trunc(l.tenths / 10)}.${l.tenths % 10}%`;
}

/** Porcentagem como aparece na legenda ("41,3%"). */
export function sharePercent(l: LanguageShare): string {
  return `${Math.trunc(l.tenths / 10)},${l.tenths % 10}%`;
}

/** Um item da linha de metadados do card. */
export type MetaItem =
  | { kind: "text"; text: string }
  | { kind: "pushed"; pushedAt: Date }
  | { kind: "stars"; stars: number };

/** Um projeto já combinado com os dados do GitHub. */
export interface Card extends Project {
  repoURL: string;
  homepage: string;
  metaItems: MetaItem[];
}

/**
 * Monta o card de p. repo é null quando os dados do GitHub não estão
 * disponíveis; nesse caso o card mostra só o que vem do JSON.
 */
export function newCard(p: Project, repo: Repo | null): Card {
  const card: Card = {
    ...p,
    repoURL: `https://github.com/${p.repo}`,
    homepage: "",
    metaItems: p.meta.map((text) => ({ kind: "text", text })),
  };
  if (!repo) return card;
  if (repo.htmlURL !== "") card.repoURL = repo.htmlURL;
  card.homepage = repo.homepage;
  if (repo.pushedAt) card.metaItems.push({ kind: "pushed", pushedAt: repo.pushedAt });
  if (starsEnabled(p) && repo.stars > 0) card.metaItems.push({ kind: "stars", stars: repo.stars });
  return card;
}

/**
 * Monta URLs internas sob o caminho base do site (ex.: /igorhsalgado-resume,
 * no GitHub Pages de projeto). "", "/" e "/x/" viram "", "" e "/x".
 */
export class Paths {
  readonly base: string;
  constructor(base: string) {
    const trimmed = base.replace(/^\/+|\/+$/g, "");
    this.base = trimmed === "" ? "" : `/${trimmed}`;
  }
  /** url("favicon.svg") é "/igorhsalgado-resume/favicon.svg" e url("") é "/igorhsalgado-resume/". */
  url(path: string): string {
    return `${this.base}/${path.replace(/^\/+/, "")}`;
  }
}

const MONTHS = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
const saoPaulo = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** Escreve t como "12 de out. de 2026", no horário de São Paulo. */
export function formatDate(t: Date): string {
  const parts = Object.fromEntries(saoPaulo.formatToParts(t).map((p) => [p.type, p.value]));
  return `${Number(parts.day)} de ${MONTHS[Number(parts.month) - 1]} de ${parts.year}`;
}

/** Data em RFC 3339, em UTC e sem frações de segundo ("2026-10-12T18:00:00Z"). */
export function isoDate(t: Date): string {
  return t.toISOString().replace(/\.\d+Z$/, "Z");
}
