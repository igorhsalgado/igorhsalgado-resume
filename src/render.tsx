// Renderiza a página com React no servidor. renderToStaticMarkup gera HTML
// puro, sem marcadores de hidratação: nenhum JavaScript vai para o navegador.
import { renderToStaticMarkup } from "react-dom/server";
import { Layout } from "./components/Layout.tsx";
import type { Page } from "./page.ts";

/** Devolve o documento completo, com o doctype. */
export function renderPage(page: Page): string {
  return "<!doctype html>\n" + renderToStaticMarkup(<Layout page={page} />) + "\n";
}
