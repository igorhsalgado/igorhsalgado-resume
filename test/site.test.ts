import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Project } from "../src/content.ts";
import { generate, resolvePhoto, type Config } from "../src/generate.ts";
import { StatusError, type CodeStats, type GitHubAPI, type Image, type Repo } from "../src/github.ts";
import { build, checkOutDir } from "../src/output.ts";
import { formatDate, newCard, Paths, sharePercent, shareWidth } from "../src/page.ts";
import { githubLogin, newCodeSummary, newFacts } from "../src/summary.ts";

const dataDir = path.join(import.meta.dirname, "fixtures/site");

/** Responde com dados fixos; o que não estiver nos mapas (ou stats null) vira erro. */
class FakeGitHub implements GitHubAPI {
  avatarCalls = 0;
  statsArgs: [string, string[]] | null = null;
  constructor(
    readonly repos: Record<string, Repo> = {},
    readonly stats: CodeStats | null = null,
    readonly avatars: Record<number, Image> = {},
  ) {}
  async repo(name: string) {
    const r = this.repos[name];
    if (!r) throw new StatusError(403, true);
    return r;
  }
  async codeStats(login: string, extra: string[]) {
    this.statsArgs = [login, extra];
    if (!this.stats) throw new StatusError(403, true);
    return this.stats;
  }
  async avatar(_id: number, size: number) {
    this.avatarCalls++;
    const img = this.avatars[size];
    if (!img) throw new Error("sem rede");
    return img;
  }
}

const jpeg1x: Image = { data: new TextEncoder().encode("jpeg-144"), ext: "jpg" };
const jpeg2x: Image = { data: new TextEncoder().encode("jpeg-288"), ext: "jpg" };

function fullGitHub() {
  const repo: Repo = {
    pushedAt: new Date("2026-10-12T18:00:00Z"),
    stars: 3,
    htmlURL: "https://github.com/exemplo/com-dados",
    homepage: "https://exemplo.dev/",
  };
  return new FakeGitHub(
    {
      "exemplo/com-dados": repo,
      "exemplo/sem-estrelas": { ...repo, htmlURL: "https://github.com/exemplo/sem-estrelas", homepage: "" },
    },
    {
      publicRepos: 5,
      repos: 7,
      languages: new Map(Object.entries({ Go: 600, Java: 250, CSS: 100, HTML: 30, Python: 15, Shell: 4, Dockerfile: 1 })),
    },
    { 144: jpeg1x, 288: jpeg2x },
  );
}

/** Cria um static/ mínimo com os arquivos extras dados. */
async function newStatic(...extra: string[]) {
  const dir = await mkdtemp(path.join(tmpdir(), "static-"));
  await writeFile(path.join(dir, "style.css"), "body{}");
  await writeFile(path.join(dir, "favicon.svg"), "<svg/>");
  for (const name of extra) await writeFile(path.join(dir, name), "x");
  return dir;
}

async function testConfig(github: GitHubAPI | null, staticDir?: string) {
  const logs: string[] = [];
  const cfg: Config = {
    dataDir,
    staticDir: staticDir ?? (await newStatic()),
    siteURL: "https://exemplo.github.io/",
    basePath: "/portfolio/",
    github,
    avatarUserID: 145609906,
    logger: { warn: (msg, attrs) => logs.push(`${msg} ${JSON.stringify(attrs, (_, v) => (v instanceof Error ? v.message : v))}`) },
    now: new Date("2026-10-14T12:00:00Z"),
  };
  return { cfg, logs };
}

describe("generate", async () => {
  const gh = fullGitHub();
  const { cfg } = await testConfig(gh);
  const { html, files } = await generate(cfg);

  it("seções e âncoras", () => {
    expect(html).toContain('<main id="conteudo">');
    expect(html).toContain('<section id="inicio" aria-labelledby="hero-title"');
    expect(html).toContain('<h1 id="hero-title"');
    expect(html).toContain('<nav class="container nav" aria-label="Navegação principal">');
    for (const id of ["sobre", "projetos", "experiencia", "stack", "contato"]) {
      expect(html).toContain(`<section id="${id}" aria-labelledby="${id}-title"`);
      expect(html).toContain(`<h2 id="${id}-title" class="prompt">`);
      expect(html).toContain(`href="#${id}"`);
    }
  });

  it("link para pular a navegação", () => {
    expect(html).toContain('<a href="#conteudo" class="skip-link">Pular para o conteúdo</a>');
  });

  it("sem JavaScript", () => {
    for (const s of ["<script", "javascript:", " onclick=", " onload=", " onerror=", "<!--"]) {
      expect(html.toLowerCase()).not.toContain(s);
    }
  });

  it("quadros de resumo do Sobre", () => {
    expect(html).toContain('<dl class="facts">');
    expect(html).toContain(
      '<dt class="label">Atualmente</dt><dd class="fact-value">Desenvolvedor Power Platform — Estágio</dd><dd class="fact-detail">Prosperi · mar/2026 – atual</dd>',
    );
    expect(html).toContain(
      '<dt class="label">Formação</dt><dd class="fact-value">Análise e Desenvolvimento de Sistemas</dd><dd class="fact-detail">FAESA · 4º período</dd>',
    );
    expect(html).toContain('<dt class="label">Foco</dt><dd class="fact-value">Backend, integração entre serviços e sistemas multi-tenant</dd></div>');
    expect(html).toContain('<dt class="label">Local</dt><dd class="fact-value">Vitória (ES)</dd></div>');
  });

  it("seção GitHub", () => {
    expect(html).toContain('<section id="github" aria-labelledby="github-title" class="band section">');
    expect(html).toContain(
      '<h2 id="github-title" class="prompt"><span aria-hidden="true"><span class="ps">$</span>github --stats</span><span class="sr-only">GitHub</span></h2>',
    );
    expect(html).toContain('<a href="https://github.com/igorhsalgado" rel="me noopener">github.com/igorhsalgado</a>');
    expect(html).toContain("<span>5 repositórios públicos</span>");
    // 600 de 1000 bytes; as duas menores (Shell e Dockerfile) viram "Outras".
    expect(html).toContain('<span class="lang-seg shade-1" style="width:60.0%"></span>');
    expect(html).toContain('<li><span class="lang-swatch shade-1" aria-hidden="true"></span>Go <span class="lang-pct">60,0%</span></li>');
    expect(html).toContain('<li><span class="lang-swatch shade-5" aria-hidden="true"></span>Python <span class="lang-pct">1,5%</span></li>');
    expect(html).toContain('<li><span class="lang-swatch shade-other" aria-hidden="true"></span>Outras <span class="lang-pct">0,5%</span></li>');
    expect(html).toContain("Por bytes de código em 7 repositórios: os públicos de igorhsalgado, sem forks, e os dos projetos acima.");
    for (const s of ["Shell", "Dockerfile", 'href="#github"']) expect(html).not.toContain(s);
  });

  it("seção GitHub soma os repositórios dos projetos", () => {
    expect(gh.statsArgs).toEqual(["igorhsalgado", ["exemplo/com-dados", "exemplo/sem-estrelas"]]);
  });

  it("sem frases de procura de emprego", () => {
    for (const s of ["aberto a oportunidades", "busco vaga", "procurando emprego", "open to work"]) {
      expect(html.toLowerCase()).not.toContain(s);
    }
  });

  it("caminho base e meta tags", () => {
    expect(html).toContain('<link rel="canonical" href="https://exemplo.github.io/portfolio/"/>');
    expect(html).toContain('<meta property="og:url" content="https://exemplo.github.io/portfolio/"/>');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/portfolio/favicon.svg"/>');
    expect(html).toContain('<link rel="stylesheet" href="/portfolio/style.css?v=');
    expect(html).toContain('src="/portfolio/avatar-144.jpg" srcSet="/portfolio/avatar-144.jpg 1x, /portfolio/avatar-288.jpg 2x"');
    expect(html).toContain("© 2026 Igor Hermann Salgado · feito com React");
  });

  it("cards com dados do GitHub", () => {
    expect(html).toContain(
      '<span>equipe de 3</span><span aria-hidden="true"> · </span><span>último push: <time dateTime="2026-10-12T18:00:00Z">12 de out. de 2026</time></span>',
    );
    expect(html).toContain('<span aria-hidden="true">★ 3</span><span class="sr-only">3 estrelas no GitHub</span>');
    expect(html).toContain('<a href="https://exemplo.dev/" rel="noopener">Demo<span class="sr-only"> de Com Dados</span></a>');
    expect(html).toContain('<span class="status"><span aria-hidden="true">●</span> em desenvolvimento</span>');
    expect(html.split("★")).toHaveLength(2); // showStars false esconde as estrelas do outro card
    expect(html.split('class="status"')).toHaveLength(2);
  });

  it("sem CV", () => {
    expect(html).not.toContain("cv.pdf");
    expect(html).not.toContain("Baixar CV");
  });

  it("avatares gerados", () => {
    expect([...files.keys()]).toEqual(["avatar-144.jpg", "avatar-288.jpg"]);
  });
});

// Sem API do GitHub e sem avatar a página sai do mesmo jeito: cards só com o JSON e sem foto.
it("fallback sem GitHub", async () => {
  const { cfg, logs } = await testConfig(new FakeGitHub());
  const { html } = await generate(cfg);
  expect(html).toContain('<div class="hero-grid">');
  expect(html).toContain('<a href="https://github.com/exemplo/com-dados" rel="noopener">Repositório');
  expect(html).toContain('<p class="card-meta"><span>equipe de 3</span></p>');
  for (const s of ["<img", "has-photo", "último push", "★", "Demo", 'id="github"', "github --stats", "lang-bar", "linguagens-title"]) {
    expect(html).not.toContain(s);
  }
  expect(html).toContain('<dl class="facts">');
  expect(html).toContain('<section id="contato"');
  expect(logs.join("\n")).toContain("limite de requisições");
  expect(logs.join("\n")).toContain("seção GitHub sai da página");
});

it("sem cliente do GitHub, nada de seção nem de foto", async () => {
  const { cfg } = await testConfig(null);
  const { html } = await generate(cfg);
  expect(html).not.toContain('id="github"');
  expect(html).not.toContain("<img");
  expect(html).toContain('<dl class="facts">');
});

it("sem bytes de linguagem, a seção some", async () => {
  const gh = fullGitHub();
  const { cfg } = await testConfig(new FakeGitHub(gh.repos, { publicRepos: 2, repos: 2, languages: new Map() }, gh.avatars));
  const { html } = await generate(cfg);
  expect(html).not.toContain('id="github"');
  expect(html).not.toContain("lang-bar");
});

it("com CV", async () => {
  const { cfg } = await testConfig(fullGitHub(), await newStatic("cv.pdf"));
  const { html } = await generate(cfg);
  expect(html).toContain('<a href="/portfolio/cv.pdf" class="btn btn-small" download="">cv.pdf</a>');
  expect(html).toContain('<a class="btn" href="/portfolio/cv.pdf" download="">Baixar CV</a>');
  expect(html).toContain('<a href="/portfolio/cv.pdf" download="">Baixar CV (PDF)</a>');
});

it("conteúdo inválido falha", async () => {
  const { cfg } = await testConfig(fullGitHub());
  cfg.dataDir = await mkdtemp(path.join(tmpdir(), "vazio-"));
  await expect(generate(cfg)).rejects.toThrow("profile.json");
});

describe("resolvePhoto", () => {
  it.each<{ name: string; local: string[]; avatars: Record<number, Image>; userID: number; want: unknown; calls: number }>([
    { name: "foto local vence o avatar", local: ["foto.png"], avatars: { 144: jpeg1x, 288: jpeg2x }, userID: 1, want: { src: "/b/foto.png", srcset: "" }, calls: 0 },
    { name: "avatar em 1x e 2x", local: [], avatars: { 144: jpeg1x, 288: jpeg2x }, userID: 1, want: { src: "/b/avatar-144.jpg", srcset: "/b/avatar-144.jpg 1x, /b/avatar-288.jpg 2x" }, calls: 2 },
    { name: "avatar 2x falha: só 1x", local: [], avatars: { 144: jpeg1x }, userID: 1, want: { src: "/b/avatar-144.jpg", srcset: "" }, calls: 2 },
    { name: "avatar falha: sem foto", local: [], avatars: {}, userID: 1, want: null, calls: 1 },
    { name: "avatar desligado", local: [], avatars: { 144: jpeg1x }, userID: 0, want: null, calls: 0 },
  ])("$name", async ({ local, avatars, userID, want, calls }) => {
    const gh = new FakeGitHub({}, null, avatars);
    const { cfg } = await testConfig(gh, await newStatic(...local));
    cfg.avatarUserID = userID;
    const got = await resolvePhoto(cfg, new Paths("/b"), new Map(), cfg.logger!);
    expect(got).toEqual(want);
    expect(gh.avatarCalls).toBe(calls);
  });
});

it("newCard", () => {
  const p: Project = { slug: "x", repo: "dono/x", title: "X", description: "", tags: [], meta: ["solo"], status: "", showStars: false };
  let card = newCard(p, null);
  expect(card.repoURL).toBe("https://github.com/dono/x");
  expect(card.metaItems).toHaveLength(1);

  const pushed = new Date("2026-01-02T03:04:05Z");
  card = newCard(p, { pushedAt: pushed, stars: 9, htmlURL: "https://github.com/Dono/X", homepage: "" });
  expect(card.repoURL).toBe("https://github.com/Dono/X");
  // Estrelas escondidas não entram.
  expect(card.metaItems).toEqual([{ kind: "text", text: "solo" }, { kind: "pushed", pushedAt: pushed }]);

  card = newCard({ ...p, showStars: null }, { pushedAt: null, stars: 9, htmlURL: "", homepage: "" });
  expect(card.metaItems).toEqual([{ kind: "text", text: "solo" }, { kind: "stars", stars: 9 }]);
});

it.each([
  ["/igorhsalgado-resume", "favicon.svg", "/igorhsalgado-resume/favicon.svg"],
  ["igorhsalgado-resume/", "/style.css", "/igorhsalgado-resume/style.css"],
  ["/igorhsalgado-resume", "", "/igorhsalgado-resume/"],
  ["", "favicon.svg", "/favicon.svg"],
  ["/", "", "/"],
])("Paths(%j).url(%j) = %j", (base, p, want) => {
  expect(new Paths(base).url(p)).toBe(want);
});

it.each([
  ["2026-10-12T18:00:00Z", "12 de out. de 2026"],
  // 02:00 UTC ainda é o dia anterior em São Paulo (UTC-3).
  ["2026-10-12T02:00:00Z", "11 de out. de 2026"],
  ["2026-05-05T12:00:00Z", "5 de mai. de 2026"],
  ["2027-01-01T02:59:00Z", "31 de dez. de 2026"],
])("formatDate(%s) = %s", (iso, want) => {
  expect(formatDate(new Date(iso))).toBe(want);
});

describe("checkOutDir", () => {
  const base = { dataDir: "data", staticDir: "static" };
  it.each([".", "..", "/", "", "static", "static/", "./static", "static/dist", "data", "data/x"])("recusa %j", (out) => {
    expect(() => checkOutDir({ ...base, outDir: out })).toThrow();
  });
  it.each(["dist", "../dist", "staticx", tmpdir() + "/saida"])("aceita %j", (out) => {
    expect(() => checkOutDir({ ...base, outDir: out })).not.toThrow();
  });
});

// Um --out que aponta para static/ falha antes de apagar qualquer coisa.
it.each(["", "dist"])("build recusa outDir dentro de static (%j)", async (sub) => {
  const staticDir = await newStatic("foto.jpg");
  const opts = { dataDir, staticDir, outDir: path.join(staticDir, sub), siteURL: "https://x.dev", basePath: "/", github: null, avatarUserID: 0 };
  await expect(build(opts)).rejects.toThrow("se sobrepõe");
  expect(existsSync(path.join(staticDir, "foto.jpg"))).toBe(true);
});

it("build grava o site", async () => {
  const staticDir = await newStatic();
  const outDir = path.join(await mkdtemp(path.join(tmpdir(), "out-")), "dist");
  await build({ dataDir, staticDir, outDir, siteURL: "https://x.dev", basePath: "/b", github: fullGitHub(), avatarUserID: 1, logger: { warn() {} } });
  for (const name of ["index.html", "style.css", "favicon.svg", "avatar-144.jpg", "avatar-288.jpg"]) {
    expect(existsSync(path.join(outDir, name)), name).toBe(true);
  }
  expect(await readFile(path.join(outDir, "index.html"), "utf8")).toMatch(/^<!doctype html>\n<html lang="pt-BR">/);
});

it("newCodeSummary", () => {
  // 1/3 de cada: 33,3% + 33,3% + 33,3% fecharia em 99,9%.
  const got = newCodeSummary("igorhsalgado", "https://github.com/igorhsalgado", {
    publicRepos: 3,
    repos: 4,
    languages: new Map(Object.entries({ Go: 1, Java: 1, SQL: 1, Vazia: 0 })),
  })!;
  expect(got.languages.map((l) => l.name)).toEqual(["Go", "Java", "SQL"]);
  expect(got.languages.reduce((s, l) => s + l.tenths, 0)).toBe(1000);
  expect(shareWidth(got.languages[0]!)).toBe("33.4%");
  expect(sharePercent(got.languages[0]!)).toBe("33,4%");

  // Seis linguagens aparecem todas pelo nome; com sete, as duas menores viram "Outras".
  const six = new Map(Object.entries({ A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 }));
  const s6 = newCodeSummary("x", "", { publicRepos: 0, repos: 0, languages: six })!;
  expect(s6.languages.map((l) => l.name)).toEqual(["A", "B", "C", "D", "E", "F"]);
  six.set("G", 1);
  const s7 = newCodeSummary("x", "", { publicRepos: 0, repos: 0, languages: six })!;
  expect(s7.languages).toHaveLength(6);
  expect(s7.languages.at(-1)).toMatchObject({ name: "Outras", shade: "other" });

  expect(newCodeSummary("x", "", { publicRepos: 0, repos: 0, languages: new Map() })).toBeNull();
});

it("newFacts", async () => {
  const { loadContent } = await import("../src/content.ts");
  const { profile } = await loadContent(dataDir);
  const p = {
    ...profile,
    focus: "",
    location: "Vitória (ES)",
    experience: [{ role: "Dev", company: "Empresa", period: "jan/2025 – dez/2025", highlights: [] }],
    education: [{ course: "ADS", institution: "FAESA", detail: "" }],
  };
  // Emprego encerrado não vira "Atualmente"; sem foco, sem o quadro Foco.
  expect(newFacts(p).map((f) => `${f.label}=${f.value}|${f.detail}`)).toEqual(["Formação=ADS|FAESA", "Local=Vitória (ES)|"]);
});

it.each([
  ["https://github.com/igorhsalgado", "igorhsalgado"],
  ["https://www.github.com/igorhsalgado/", "igorhsalgado"],
  ["https://gitlab.com/igorhsalgado", null],
  ["https://github.com/a/b", null],
  ["https://github.com/", null],
  ["javascript:alert(1)", null],
])("githubLogin(%j) = %j", (url, want) => {
  expect(githubLogin(url)).toBe(want);
});
