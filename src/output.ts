// Escreve o site gerado no disco: apaga e recria o diretório de saída, copia
// static/ e grava index.html e os avatares.
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { generate, type Logger } from "./generate.ts";
import type { GitHubAPI } from "./github.ts";

export interface BuildOptions {
  dataDir: string;
  staticDir: string;
  /** Apagado e recriado a cada build. */
  outDir: string;
  siteURL: string;
  basePath: string;
  github: GitHubAPI | null;
  avatarUserID: number;
  logger?: Logger;
}

/** Gera o site em opts.outDir. */
export async function build(opts: BuildOptions): Promise<void> {
  checkOutDir(opts);
  const out = await generate({
    dataDir: opts.dataDir,
    staticDir: opts.staticDir,
    siteURL: opts.siteURL,
    basePath: opts.basePath,
    github: opts.github,
    avatarUserID: opts.avatarUserID,
    ...(opts.logger ? { logger: opts.logger } : {}),
  });
  // Só mexe em outDir depois que o conteúdo foi validado e a página renderizada.
  await rm(opts.outDir, { recursive: true, force: true });
  await mkdir(opts.outDir, { recursive: true });
  await cp(opts.staticDir, opts.outDir, { recursive: true });
  for (const [name, data] of out.files) await writeFile(path.join(opts.outDir, name), data);
  await writeFile(path.join(opts.outDir, "index.html"), out.html);
}

/**
 * Recusa um outDir que se sobreponha ao diretório atual, a staticDir ou a
 * dataDir: como outDir é apagado a cada build, um --out errado (".",
 * "static", "data/x"...) apagaria o projeto ou o próprio conteúdo. outDir pode
 * ficar dentro do diretório atual (dist), mas não o contrário.
 */
export function checkOutDir(opts: Pick<BuildOptions, "outDir" | "staticDir" | "dataDir">): void {
  if (within(process.cwd(), opts.outDir)) {
    throw new Error(`diretório de saída "${opts.outDir}" contém o diretório atual; use um subdiretório como dist`);
  }
  for (const dir of [opts.staticDir, opts.dataDir]) {
    if (within(opts.outDir, dir) || within(dir, opts.outDir)) {
      throw new Error(`diretório de saída "${opts.outDir}" se sobrepõe a "${dir}"; use um diretório separado como dist`);
    }
  }
}

/** Informa se o caminho a é igual a b ou fica dentro de b. */
function within(a: string, b: string): boolean {
  const rel = path.relative(path.resolve(b), path.resolve(a));
  return rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel);
}
