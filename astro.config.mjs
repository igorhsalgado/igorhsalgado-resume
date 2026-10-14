// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Site publicado como "project page" do GitHub Pages:
// https://igorhsalgado.github.io/igorhsalgado-resume/
export default defineConfig({
  site: 'https://igorhsalgado.github.io',
  base: '/igorhsalgado-resume',
  output: 'static',
  trailingSlash: 'ignore',
  vite: {
    plugins: [tailwindcss()],
  },
});
