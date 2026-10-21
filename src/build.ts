// Gera o portfólio estático em um diretório (dist/ por padrão). É o ponto de
// entrada que o Vite compila para .ssr/build.js; `npm run build` roda os dois.
//
//   npm run build                         # build em dist/
//   npm run build -- --out /tmp/site      # outro diretório
//   npm run build -- --base / --site https://exemplo.dev
//
// GITHUB_TOKEN, se definido, é usado nas chamadas à API do GitHub.
// GITHUB_API_URL e GITHUB_AVATAR_URL trocam os endereços da API (útil em testes).
import { parseArgs } from "node:util";
import { DEFAULT_BASE_PATH, DEFAULT_SITE_URL, GITHUB_USER_ID } from "./config.ts";
import { GitHubClient } from "./github.ts";
import { build } from "./output.ts";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      out: { type: "string", default: "dist" },
      base: { type: "string", default: process.env.BASE_PATH ?? DEFAULT_BASE_PATH },
      site: { type: "string", default: DEFAULT_SITE_URL },
    },
  });
  const start = performance.now();
  const env = process.env;
  await build({
    dataDir: "data",
    staticDir: "static",
    outDir: values.out,
    siteURL: values.site,
    basePath: values.base,
    github: new GitHubClient({
      token: env.GITHUB_TOKEN ?? "",
      apiURL: env.GITHUB_API_URL ?? "",
      avatarURL: env.GITHUB_AVATAR_URL ?? "",
    }),
    avatarUserID: GITHUB_USER_ID,
  });
  console.log(`site gerado em ${values.out} (${Math.round(performance.now() - start)} ms)`);
}

main().catch((err: unknown) => {
  console.error(`build falhou: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
