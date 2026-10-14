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
 * Foto do topo, resolvida no build pelo Vite (o glob vem vazio se não houver arquivo):
 *  1. src/assets/foto.jpg (ou .jpeg, .png, .webp), se existir: a foto local sempre vence;
 *  2. senão, o avatar do GitHub baixado no início do build para src/assets/github-avatar.*
 *     (veja integrations/github-avatar.mjs);
 *  3. senão, sem foto: o texto do topo usa a largura toda.
 * A imagem passa pelo <Image> do Astro (recorte quadrado, redimensionada e convertida para webp).
 */
const localPhoto = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/foto.{jpg,jpeg,png,webp}',
  { eager: true },
);
const avatarPhoto = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/github-avatar.{jpg,png,webp}',
  { eager: true },
);
export const photo: ImageMetadata | undefined =
  Object.values(localPhoto)[0]?.default ?? Object.values(avatarPhoto)[0]?.default;
