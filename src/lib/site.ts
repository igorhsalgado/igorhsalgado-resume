import type { ImageMetadata } from 'astro';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Prefixa um caminho interno com o `base` do Astro (ex.: /igorhsalgado-resume). */
export function withBase(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const clean = path.replace(/^\/+/, '');
  return clean ? `${base}/${clean}` : `${base}/`;
}

/**
 * O botão "Baixar CV" só aparece se public/cv.pdf existir no momento do build.
 * O build roda a partir da raiz do projeto (npm run build / withastro/action).
 */
export const hasCv: boolean = existsSync(join(process.cwd(), 'public', 'cv.pdf'));
export const cvHref: string = withBase('cv.pdf');

/**
 * Foto do hero: só aparece se existir src/assets/foto.jpg (ou .jpeg, .png, .webp)
 * no momento do build. O glob é resolvido pelo Vite no build; sem arquivo, vem vazio
 * e o hero usa a largura toda. A imagem passa pelo <Image> do Astro (redimensionada
 * e convertida para webp).
 */
const photoFiles = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/foto.{jpg,jpeg,png,webp}',
  { eager: true },
);
export const photo: ImageMetadata | undefined = Object.values(photoFiles)[0]?.default;
