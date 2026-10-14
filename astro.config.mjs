// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import githubAvatar from './integrations/github-avatar.mjs';

// Site publicado como "project page" do GitHub Pages:
// https://igorhsalgado.github.io/igorhsalgado-resume/
export default defineConfig({
  site: 'https://igorhsalgado.github.io',
  base: '/igorhsalgado-resume',
  output: 'static',
  trailingSlash: 'ignore',
  // Foto do topo: avatar do GitHub (id 145609906), baixado a cada build.
  integrations: [githubAvatar({ userId: 145609906 })],
  vite: {
    plugins: [tailwindcss()],
  },
});
