import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { findCause, GitHubClient, InvalidLoginError, InvalidRepoError, StatusError } from "../src/github.ts";

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;
const servers: http.Server[] = [];

async function clientFor(handler: Handler, opts: { token?: string; timeoutMs?: number } = {}) {
  const srv = http.createServer(handler);
  servers.push(srv);
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  return new GitHubClient({ apiURL: url, avatarURL: url, ...opts });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

const send = (res: http.ServerResponse, body: string, status = 200, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body);
};

// PNG 1x1 válido.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABc3UBGAAAAABJRU5ErkJggg==",
  "base64",
);

describe("repo", () => {
  it("lê os campos usados nos cards", async () => {
    const c = await clientFor((req, res) => {
      expect(req.url).toBe("/repos/igorhsalgado/igorhsalgado-resume");
      expect(req.headers.authorization).toBe("Bearer s3cr3t");
      send(
        res,
        JSON.stringify({
          pushed_at: "2026-10-12T18:00:00Z",
          stargazers_count: 7,
          html_url: "https://github.com/igorhsalgado/igorhsalgado-resume",
          homepage: "https://igorhsalgado.github.io/igorhsalgado-resume/",
          ignored: true,
        }),
      );
    }, { token: "s3cr3t" });
    const got = await c.repo("igorhsalgado/igorhsalgado-resume");
    expect(got).toEqual({
      pushedAt: new Date("2026-10-12T18:00:00Z"),
      stars: 7,
      htmlURL: "https://github.com/igorhsalgado/igorhsalgado-resume",
      homepage: "https://igorhsalgado.github.io/igorhsalgado-resume/",
    });
  });

  it("sem token, não manda Authorization", async () => {
    const c = await clientFor((req, res) => {
      expect(req.headers.authorization).toBeUndefined();
      send(res, "{}");
    });
    await c.repo("a/b");
  });

  // Campos ausentes, nulos ou com URL que não seja http(s) viram valor zero.
  it("limpa os campos", async () => {
    const c = await clientFor((_, res) => send(res, '{"pushed_at": "ontem", "html_url": "javascript:alert(1)", "homepage": null}'));
    expect(await c.repo("a/b")).toEqual({ pushedAt: null, stars: 0, htmlURL: "", homepage: "" });
  });

  it("404", async () => {
    const c = await clientFor((_, res) => send(res, '{"message":"Not Found"}', 404));
    const err = await c.repo("a/b").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StatusError);
    expect(err).toMatchObject({ statusCode: 404, rateLimited: false });
  });

  it("403 por limite de requisições", async () => {
    const c = await clientFor((_, res) => send(res, "{}", 403, { "X-RateLimit-Remaining": "0" }));
    const err = await c.repo("a/b").catch((e: unknown) => e);
    expect(err).toMatchObject({ statusCode: 403, rateLimited: true });
    expect((err as Error).message).toContain("limite de requisições");
  });

  it("JSON inválido", async () => {
    const c = await clientFor((_, res) => send(res, '{"stargazers_count": "muitas"'));
    await expect(c.repo("a/b")).rejects.toThrow("resposta inválida");
  });

  it("tipo errado", async () => {
    const c = await clientFor((_, res) => send(res, '{"stargazers_count": "muitas"}'));
    await expect(c.repo("a/b")).rejects.toThrow("resposta inválida");
  });

  it("timeout", async () => {
    const c = await clientFor(() => {}, { timeoutMs: 50 });
    await expect(c.repo("a/b")).rejects.toThrow("tempo esgotado");
  });

  it("sem rede", async () => {
    const c = new GitHubClient({ apiURL: "http://127.0.0.1:1" });
    await expect(c.repo("a/b")).rejects.toThrow("fetch failed");
  });

  it("nome inválido não faz requisição", async () => {
    const c = await clientFor(() => {
      throw new Error("requisição inesperada");
    });
    for (const name of ["", "sem-barra", "a/b/c", "../etc", "a/..", "a/b?x=1"]) {
      await expect(c.repo(name)).rejects.toBeInstanceOf(InvalidRepoError);
    }
  });

  it("escapa o caminho", async () => {
    const c = await clientFor((req, res) => {
      expect(req.url).toBe("/repos/Dono.X/repo_y.go");
      send(res, "{}");
    });
    await c.repo("Dono.X/repo_y.go");
  });
});

describe("avatar", () => {
  it.each([
    ["png", "image/png", 200, png, null],
    ["404", "image/png", 404, png, "HTTP 404"],
    ["content-type não é imagem", "text/html; charset=utf-8", 200, png, "Content-Type inesperado"],
    ["bytes não são imagem", "image/png", 200, Buffer.from("<html>oi</html>"), "não é JPEG"],
    ["vazio", "image/jpeg", 200, Buffer.alloc(0), "tamanho inesperado"],
  ])("%s", async (_name, type, status, body, wantErr) => {
    const c = await clientFor((req, res) => {
      expect(req.url).toBe("/u/145609906?s=144");
      res.writeHead(status, { "Content-Type": type });
      res.end(body);
    });
    const got = c.avatar(145609906, 144);
    if (wantErr) await expect(got).rejects.toThrow(wantErr);
    else expect(await got).toEqual({ ext: "png", data: new Uint8Array(png) });
  });
});

// Simula as rotas usadas por codeStats. Rotas fora do mapa respondem 404;
// fail força um 403 de limite numa rota.
const statsRoutes: Record<string, string> = {
  "/users/igorhsalgado": '{"public_repos": 5}',
  "/users/igorhsalgado/repos?page=1": JSON.stringify([
    { full_name: "igorhsalgado/igorhsalgado-resume", fork: false },
    { full_name: "igorhsalgado/Java", fork: false },
    { full_name: "igorhsalgado/um-fork", fork: true },
    { full_name: "igorhsalgado/privado", fork: false, private: true },
    { full_name: "igorhsalgado/vazio", fork: false },
  ]),
  "/repos/igorhsalgado/igorhsalgado-resume/languages": '{"Go": 55000, "CSS": 16000, "HTML": 9000}',
  "/repos/igorhsalgado/Java/languages": '{"Java": 40000, "": 7, "Lixo": -3}',
  "/repos/igorhsalgado/vazio/languages": "{}",
  "/repos/Equipe/projeto/languages": '{"Go": 1000, "TypeScript": 2000}',
};

function statsClient(routes: Record<string, string>, fail?: string) {
  return clientFor((req, res) => {
    const u = new URL(req.url!, "http://x");
    let key = u.pathname;
    if (key === "/users/igorhsalgado/repos") {
      expect(u.searchParams.get("type")).toBe("owner");
      expect(u.searchParams.get("per_page")).toBe("100");
      key += `?page=${u.searchParams.get("page")}`;
    }
    if (key === fail) return send(res, '{"message":"rate limit"}', 403, { "X-RateLimit-Remaining": "0" });
    const body = routes[key];
    if (body === undefined) return send(res, '{"message":"Not Found"}', 404);
    send(res, body);
  });
}

describe("codeStats", () => {
  it("soma as linguagens", async () => {
    const c = await statsClient(statsRoutes);
    // O extra repetido (outra caixa) conta uma vez só; o inválido é ignorado.
    const got = await c.codeStats("igorhsalgado", ["Equipe/projeto", "IGORHSALGADO/java", "invalido"]);
    expect(got.publicRepos).toBe(5);
    expect(got.repos).toBe(4);
    expect(Object.fromEntries(got.languages)).toEqual({ Go: 56000, CSS: 16000, HTML: 9000, Java: 40000, TypeScript: 2000 });
  });

  it("pagina", async () => {
    const page1 = JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ full_name: `igorhsalgado/fork-${i}`, fork: true })));
    const c = await statsClient({
      "/users/igorhsalgado": '{"public_repos": 101}',
      "/users/igorhsalgado/repos?page=1": page1,
      "/users/igorhsalgado/repos?page=2": '[{"full_name": "igorhsalgado/ultimo", "fork": false}]',
      "/repos/igorhsalgado/ultimo/languages": '{"Go": 10}',
    });
    const got = await c.codeStats("igorhsalgado", []);
    expect(got.repos).toBe(1);
    expect(got.languages.get("Go")).toBe(10);
  });

  // Qualquer consulta que falhe derruba o resultado inteiro: nada de soma parcial.
  it.each([
    "/users/igorhsalgado",
    "/users/igorhsalgado/repos?page=1",
    "/repos/igorhsalgado/Java/languages",
    "/repos/Equipe/projeto/languages",
  ])("tudo ou nada: falha em %s", async (route) => {
    const c = await statsClient(statsRoutes, route);
    const err = await c.codeStats("igorhsalgado", ["Equipe/projeto"]).catch((e: unknown) => e);
    expect(findCause(err, StatusError)).toMatchObject({ rateLimited: true });
  });

  it("login inválido não faz requisição", async () => {
    const c = await clientFor(() => {
      throw new Error("requisição inesperada");
    });
    for (const login of ["", "../x", "a/b", "-a"]) {
      await expect(c.codeStats(login, [])).rejects.toBeInstanceOf(InvalidLoginError);
    }
  });
});
