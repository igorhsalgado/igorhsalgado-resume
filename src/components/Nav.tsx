import type { Page } from "../page.ts";

const LINKS = [
  ["sobre", "Sobre"],
  ["projetos", "Projetos"],
  ["experiencia", "Experiência"],
  ["stack", "Stack"],
  ["contato", "Contato"],
] as const;

/** Cabeçalho com a marca e a navegação. A seção GitHub não entra aqui. */
export function Nav({ page }: { page: Page }) {
  return (
    <header className="band band-tight site-header">
      <nav className="container nav" aria-label="Navegação principal">
        <a href="#inicio" className="nav-brand">
          {page.profile.handle}
          <span className="nav-brand-prompt" aria-hidden="true">
            :~$
          </span>
        </a>
        <ul className="nav-links">
          {LINKS.map(([id, label], i) => (
            <li key={id} className="nav-item">
              <a href={`#${id}`} className="nav-link">
                {label}
              </a>
              {i < LINKS.length - 1 && (
                <span className="nav-sep" aria-hidden="true">
                  ·
                </span>
              )}
            </li>
          ))}
          {page.cvURL && (
            <li>
              <a href={page.cvURL} className="btn btn-small" download>
                cv.pdf
              </a>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}
