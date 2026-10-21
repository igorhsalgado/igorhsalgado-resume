// O Vite tem dois papéis aqui, e nenhum deles gera JavaScript para o navegador:
//
//  - `vite build` compila o gerador (src/build.ts, com os componentes React)
//    para .ssr/build.js, que o Node roda em seguida para pré-renderizar dist/;
//  - `vite` (npm run dev) serve a página renderizada no servidor a cada
//    acesso, com static/ no mesmo caminho base do GitHub Pages.
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { DEFAULT_BASE_PATH, GITHUB_USER_ID } from "./src/config.ts";
import { GitHubClient, memoizeGitHub } from "./src/github.ts";

const basePath = process.env.BASE_PATH ?? DEFAULT_BASE_PATH;
const base = basePath.replace(/^\/*/, "/").replace(/\/*$/, "/");

/**
 * Servidor de desenvolvimento: index.html renderizado com React a cada acesso
 * (recarregue o navegador depois de editar src/ ou data/), sem bundle de cliente.
 */
function prerenderDev(): Plugin {
  // Os dados do GitHub são buscados uma vez por execução do `npm run dev`.
  const github = memoizeGitHub(
    new GitHubClient({
      token: process.env.GITHUB_TOKEN ?? "",
      apiURL: process.env.GITHUB_API_URL ?? "",
      avatarURL: process.env.GITHUB_AVATAR_URL ?? "",
    }),
  );
  let generated = new Map<string, Uint8Array>();

  return {
    name: "prerender-dev",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
        const url = (req.url ?? "").split("?")[0]!;
        try {
          if (url === base || url === `${base}index.html`) {
            const mod = (await server.ssrLoadModule("/src/generate.ts")) as typeof import("./src/generate.ts");
            const out = await mod.generate({
              dataDir: "data",
              staticDir: "static",
              siteURL: `http://localhost:${server.config.server.port}`,
              basePath,
              github,
              avatarUserID: GITHUB_USER_ID,
            });
            generated = out.files;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(out.html);
            return;
          }
          const file = url.startsWith(base) ? generated.get(url.slice(base.length)) : undefined;
          if (file) {
            res.setHeader("Content-Type", url.endsWith(".png") ? "image/png" : url.endsWith(".webp") ? "image/webp" : "image/jpeg");
            res.end(file);
            return;
          }
        } catch (err) {
          next(err);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base,
  appType: "mpa",
  publicDir: "static",
  plugins: [prerenderDev()],
  server: { port: 8080 },
  preview: { port: 8080 },
  build: {
    ssr: "src/build.ts",
    outDir: ".ssr",
    emptyOutDir: true,
    copyPublicDir: false,
    target: "node22",
    minify: false,
  },
});

