import { sharePercent, shareWidth, type Page } from "../page.ts";
import { ProjectCard } from "./ProjectCard.tsx";

/**
 * Cabeçalho de seção: o prompt de terminal é o que aparece; o título real
 * fica no heading, só para leitores de tela.
 */
function SectionHeading({ id, command, title }: { id: string; command: string; title: string }) {
  return (
    <h2 id={id} className="prompt">
      <span aria-hidden="true">
        <span className="ps">$</span>
        {command}
      </span>
      <span className="sr-only">{title}</span>
    </h2>
  );
}

export function About({ page }: { page: Page }) {
  return (
    <section id="sobre" aria-labelledby="sobre-title" className="band section">
      <div className="container flow">
        <SectionHeading id="sobre-title" command="cat sobre.md" title="Sobre" />
        <p className="measure">{page.profile.about}</p>
        {page.facts.length > 0 && (
          <dl className="facts">
            {page.facts.map((fact) => (
              <div key={fact.label} className="fact">
                <dt className="label">{fact.label}</dt>
                <dd className="fact-value">{fact.value}</dd>
                {fact.detail && <dd className="fact-detail">{fact.detail}</dd>}
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

export function Projects({ page }: { page: Page }) {
  return (
    <section id="projetos" aria-labelledby="projetos-title" className="band section">
      <div className="container flow">
        <SectionHeading id="projetos-title" command="ls ./projetos" title="Projetos" />
        <div className="project-grid">
          {page.projects.map((card) => (
            <ProjectCard key={card.slug} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function Experience({ page }: { page: Page }) {
  return (
    <section id="experiencia" aria-labelledby="experiencia-title" className="band section">
      <div className="container flow">
        <SectionHeading id="experiencia-title" command="cat experiencia.md" title="Experiência" />
        <div className="xp">
          <div className="flow">
            {page.profile.experience.map((job, i) => (
              <article key={i} className="job">
                <div>
                  <h3 className="job-role">{job.role}</h3>
                  <p className="job-org">{`${job.company} · ${job.period}`}</p>
                </div>
                <ul className="job-highlights">
                  {job.highlights.map((h, j) => (
                    <li key={j}>{h}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="education">
            <h3 className="label">Formação</h3>
            {page.profile.education.map((edu, i) => (
              <p key={i}>
                {`${edu.course} — ${edu.institution}`}
                {edu.detail && <span>{` · ${edu.detail}`}</span>}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Stack({ page }: { page: Page }) {
  return (
    <section id="stack" aria-labelledby="stack-title" className="band section">
      <div className="container flow">
        <SectionHeading id="stack-title" command="stack --list" title="Stack" />
        <dl className="stack-list">
          {page.profile.stack.map((group, i) => (
            <div key={i} className="stack-group">
              <dt className="stack-label">{group.label}</dt>
              <dd>
                <ul className="chips">
                  {group.items.map((item, j) => (
                    <li key={j} className={group.secondary ? "chip chip-secondary" : "chip"}>
                      {item}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** Seção "GitHub": só existe quando a API respondeu (page.code não é null). */
export function GitHubStats({ page }: { page: Page }) {
  const code = page.code;
  if (!code) return null;
  return (
    <section id="github" aria-labelledby="github-title" className="band section">
      <div className="container flow">
        <SectionHeading id="github-title" command="github --stats" title="GitHub" />
        <p className="gh-meta">
          <a href={code.profileURL} rel="me noopener">{`github.com/${code.login}`}</a>
          <span aria-hidden="true">{" · "}</span>
          <span>{`${code.publicRepos} ${code.publicRepos === 1 ? "repositório público" : "repositórios públicos"}`}</span>
        </p>

        <div className="langs">
          <h3 id="linguagens-title" className="label">
            Linguagens
          </h3>
          <div className="lang-bar" aria-hidden="true">
            {code.languages.map((l) => (
              <span key={l.name} className={`lang-seg shade-${l.shade}`} style={{ width: shareWidth(l) }}></span>
            ))}
          </div>
          <ul className="lang-list" aria-labelledby="linguagens-title">
            {code.languages.map((l) => (
              <li key={l.name}>
                <span className={`lang-swatch shade-${l.shade}`} aria-hidden="true"></span>
                {`${l.name} `}
                <span className="lang-pct">{sharePercent(l)}</span>
              </li>
            ))}
          </ul>
          <p className="gh-note">
            {`Por bytes de código em ${code.repos} ${code.repos === 1 ? "repositório" : "repositórios"}: os públicos de ${code.login}, sem forks, e os dos projetos acima.`}
          </p>
        </div>
      </div>
    </section>
  );
}

export function Contact({ page }: { page: Page }) {
  const { contact } = page.profile;
  return (
    <section id="contato" aria-labelledby="contato-title" className="band section">
      <div className="container flow">
        <SectionHeading id="contato-title" command="contato" title="Contato" />
        <ul className="contact-list">
          <li>
            <a href={`mailto:${contact.email}`}>{contact.email}</a>
          </li>
          <li>
            <a href={contact.linkedin} rel="me noopener">
              LinkedIn
            </a>
          </li>
          <li>
            <a href={contact.github} rel="me noopener">
              GitHub
            </a>
          </li>
          {page.cvURL && (
            <li>
              <a href={page.cvURL} download>
                Baixar CV (PDF)
              </a>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
