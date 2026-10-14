// @ts-check
// Baixa o avatar do GitHub no início do build (e do `astro dev`) para
// src/assets/github-avatar.<ext>, de onde o <Image> do Astro o otimiza como
// qualquer imagem local. Assim a foto do site acompanha a foto do GitHub a
// cada rebuild (push na main, cron diário ou execução manual).
//
// Nunca derruba o build: sem rede, HTTP de erro, timeout ou arquivo que não
// seja imagem, só registra um aviso. Se já houver um avatar baixado antes,
// ele é mantido; se não houver, o site usa src/assets/foto.* ou fica sem foto.
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const TIMEOUT_MS = 8000;
const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONS = ['jpg', 'png', 'webp'];

/** Identifica o formato pelos primeiros bytes (não confia só no content-type). */
function sniff(/** @type {Uint8Array} */ b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

/**
 * @param {{ userId: number, size?: number }} options
 * @returns {import('astro').AstroIntegration}
 */
export default function githubAvatar({ userId, size = 600 }) {
  return {
    name: 'github-avatar',
    hooks: {
      'astro:config:setup': async ({ config, logger }) => {
        const url = `https://avatars.githubusercontent.com/u/${userId}?s=${size}`;
        const dir = new URL('assets/', config.srcDir);
        try {
          const res = await fetch(url, {
            headers: { 'User-Agent': 'igorhsalgado-resume-build' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error(`tamanho inesperado (${bytes.length} bytes)`);
          const ext = sniff(bytes);
          if (!ext) throw new Error('a resposta não é JPEG, PNG nem WebP');

          await mkdir(dir, { recursive: true });
          const target = fileURLToPath(new URL(`github-avatar.${ext}`, dir));
          await writeFile(`${target}.tmp`, bytes);
          await rename(`${target}.tmp`, target);
          // Remove um avatar antigo salvo com outra extensão.
          for (const other of EXTENSIONS.filter((e) => e !== ext)) {
            await rm(fileURLToPath(new URL(`github-avatar.${other}`, dir)), { force: true });
          }
          logger.info(`avatar do GitHub atualizado (${bytes.length} bytes)`);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          logger.warn(`não foi possível baixar o avatar do GitHub (${reason}); usando foto local ou avatar anterior, se houver`);
        }
      },
    },
  };
}
