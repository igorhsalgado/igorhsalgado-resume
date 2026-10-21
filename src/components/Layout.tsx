import type { Page } from "../page.ts";
import { Hero } from "./Hero.tsx";
import { Nav } from "./Nav.tsx";
import { About, Contact, Experience, GitHubStats, Projects, Stack } from "./Sections.tsx";

/** O documento inteiro: head com as meta tags e a página em uma coluna. */
export function Layout({ page }: { page: Page }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#1E2226" />
        <title>{page.title}</title>
        <meta name="description" content={page.description} />
        <link rel="canonical" href={page.canonical} />
        <link rel="icon" type="image/svg+xml" href={page.faviconURL} />

        <meta property="og:type" content="website" />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:site_name" content={page.profile.name} />
        <meta property="og:title" content={page.title} />
        <meta property="og:description" content={page.description} />
        <meta property="og:url" content={page.canonical} />
        <meta name="twitter:card" content="summary" />

        <link rel="stylesheet" href={page.styleURL} />
      </head>
      <body>
        <a href="#conteudo" className="skip-link">
          Pular para o conteúdo
        </a>

        <div className="page">
          <Nav page={page} />

          <main id="conteudo">
            <Hero page={page} />
            <About page={page} />
            <Projects page={page} />
            <Experience page={page} />
            <Stack page={page} />
            <GitHubStats page={page} />
            <Contact page={page} />
          </main>

          <footer className="band band-tight site-footer">
            <div className="container footer-row">
              <span>{`© ${page.year} ${page.profile.name} · feito com React`}</span>
              <a href="#inicio" className="footer-top">
                ↑ topo
              </a>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
