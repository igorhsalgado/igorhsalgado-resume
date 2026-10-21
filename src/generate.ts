// Monta o site: lê o conteúdo, busca os dados do GitHub e renderiza
// index.html com React no servidor (Node), durante o build. O navegador recebe
// HTML pronto, sem JavaScript.
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { loadContent, type Content } from "./content.ts";
import type { GitHubAPI, Repo } from "./github.ts";
import { newCard, Paths, type CodeSummary, type Page, type Photo } from "./page.ts";
import { renderPage } from "./render.tsx";
import { githubLogin, newCodeSummary, newFacts } from "./summary.ts";

export interface Logger {
  warn(msg: string, attrs?: Record<string, unknown>): void;
}

/** Escreve avisos no stderr: `aviso: mensagem chave=valor ...`. */
export const stderrLogger: Logger = {
  warn(msg, attrs = {}) {
    const extra = Object.entries(attrs).map(([k, v]) => ` ${k}=${JSON.stringify(v instanceof Error ? v.message : v)}`);
    process.stderr.write(`aviso: ${msg}${extra.join("")}\n`);
  },
};

export interface Config {
  /** profile.json e projects.json. */
  dataDir: string;
  /** Arquivos copiados como estão para o site (style.css, fontes, foto, cv.pdf). */
  staticDir: string;
  /** Origem do site, ex.: https://igorhsalgado.github.io */
  siteURL: string;
  /** Caminho base, ex.: /igorhsalgado-resume */
  basePath: string;
  /** Fornece os dados dos cards, a seção "GitHub" e o avatar. null desliga os três. */
  github: GitHubAPI | null;
  /** ID numérico do usuário cujo avatar vira a foto do topo (0 desliga). Uma foto em staticDir sempre vence. */
  avatarUserID: number;
  logger?: Logger;
  now?: Date;
}

export interface Generated {
  page: Page;
  /** A página completa. */
  html: string;
  /** Arquivos gerados no build (avatares), por nome dentro do site. */
  files: Map<string, Uint8Array>;
}

/** Lado da foto em pixels CSS; a versão 2x serve telas de alta densidade. */
const PHOTO_SIZE = 144;
/** Nomes aceitos para a foto local em staticDir, em ordem de preferência. */
export const LOCAL_PHOTOS = ["foto.jpg", "foto.jpeg", "foto.png", "foto.webp"];

/**
 * Gera a página. Falhas da API do GitHub não interrompem: viram avisos no log
 * e a página sai sem os dados automáticos (os cards ficam só com o JSON, a
 * seção "GitHub" some e, sem foto local, a página sai sem foto).
 */
export async function generate(cfg: Config): Promise<Generated> {
  const logger = cfg.logger ?? stderrLogger;
  const now = cfg.now ?? new Date();
  const c = await loadContent(cfg.dataDir);
  const paths = new Paths(cfg.basePath);
  const style = await readFile(path.join(cfg.staticDir, "style.css"));
  const files = new Map<string, Uint8Array>();

  // Repositórios, linguagens e avatar são buscados em paralelo.
  const gh = cfg.github;
  const [repos, code, photo] = await Promise.all([
    Promise.all(
      c.projects.map(async (p): Promise<Repo | null> => {
        if (!gh) return null;
        try {
          return await gh.repo(p.repo);
        } catch (err) {
          logger.warn("dados do GitHub indisponíveis; card sai sem eles", { repo: p.repo, err });
          return null;
        }
      }),
    ),
    gh ? codeSummary(gh, c, logger) : Promise.resolve(null),
    resolvePhoto(cfg, paths, files, logger),
  ]);

  const { profile } = c;
  const page: Page = {
    title: `${profile.name} · Desenvolvedor Backend`,
    description: `${profile.name}, desenvolvedor backend em ${profile.location}. ${profile.pitch}`,
    canonical: cfg.siteURL.replace(/\/+$/, "") + paths.url(""),
    styleURL: `${paths.url("style.css")}?v=${shortHash(style)}`,
    faviconURL: paths.url("favicon.svg"),
    cvURL: (await isFile(path.join(cfg.staticDir, "cv.pdf"))) ? paths.url("cv.pdf") : "",
    profile,
    facts: newFacts(profile),
    projects: c.projects.map((p, i) => newCard(p, repos[i] ?? null)),
    code,
    photo,
    year: now.getFullYear(),
  };
  return { page, html: renderPage(page), files };
}

/**
 * Linguagens do código público do dono do perfil (login tirado de
 * contact.github) somadas às dos repositórios dos projetos. null, com um
 * aviso, se a API falhar: a seção sai da página.
 */
async function codeSummary(gh: GitHubAPI, c: Content, logger: Logger): Promise<CodeSummary | null> {
  const profileURL = c.profile.contact.github;
  const login = githubLogin(profileURL);
  if (!login) {
    logger.warn("contact.github não é um perfil do GitHub; seção GitHub sai da página", { url: profileURL });
    return null;
  }
  try {
    const stats = await gh.codeStats(
      login,
      c.projects.map((p) => p.repo),
    );
    return newCodeSummary(login, profileURL, stats);
  } catch (err) {
    logger.warn("linguagens do GitHub indisponíveis; seção GitHub sai da página", { err });
    return null;
  }
}

/**
 * Escolhe a foto do topo, nesta ordem:
 *  1. foto local em staticDir (copiada com o resto de static/): sempre vence;
 *  2. avatar do GitHub, baixado agora em 144 px e 288 px;
 *  3. nenhuma (null): a página sai sem foto.
 *
 * Falhas no download só geram aviso. Se só a versão 2x falhar, a foto sai sem srcset.
 */
export async function resolvePhoto(
  cfg: Config,
  paths: Paths,
  files: Map<string, Uint8Array>,
  logger: Logger,
): Promise<Photo | null> {
  for (const name of LOCAL_PHOTOS) {
    if (await isFile(path.join(cfg.staticDir, name))) return { src: paths.url(name), srcset: "" };
  }
  const gh = cfg.github;
  if (!gh || cfg.avatarUserID === 0) return null;

  const save = async (size: number) => {
    const img = await gh.avatar(cfg.avatarUserID, size);
    const name = `avatar-${size}.${img.ext}`;
    files.set(name, img.data);
    return paths.url(name);
  };

  let src: string;
  try {
    src = await save(PHOTO_SIZE);
  } catch (err) {
    logger.warn("avatar do GitHub indisponível; página sai sem foto", { err });
    return null;
  }
  try {
    const src2x = await save(2 * PHOTO_SIZE);
    return { src, srcset: `${src} 1x, ${src2x} 2x` };
  } catch (err) {
    logger.warn("avatar 2x do GitHub indisponível; foto sai só em 1x", { err });
    return { src, srcset: "" };
  }
}

export async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

function shortHash(b: Uint8Array): string {
  return createHash("sha256").update(b).digest("hex").slice(0, 10);
}
