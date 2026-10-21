import type { Page } from "../page.ts";

/** Topo: nome, cargo, pitch, ações e a foto opcional. */
export function Hero({ page }: { page: Page }) {
  const { profile, photo, cvURL } = page;
  return (
    <section id="inicio" aria-labelledby="hero-title" className="band">
      <div className="container flow">
        <p className="prompt" aria-hidden="true">
          <span className="ps">$</span>whoami
        </p>

        <div className={photo ? "hero-grid has-photo" : "hero-grid"}>
          <div className="flow hero-text">
            <div>
              <h1 id="hero-title" className="hero-title">
                {profile.name}
              </h1>
              <p className="hero-headline">{profile.headline}</p>
            </div>

            <p className="hero-pitch">{profile.pitch}</p>

            <div className="hero-actions">
              <a className="btn btn-primary" href="#projetos">
                Ver projetos
              </a>
              {cvURL && (
                <a className="btn" href={cvURL} download>
                  Baixar CV
                </a>
              )}
              <a className="btn btn-box" href={profile.contact.github} rel="me noopener">
                <span aria-hidden="true">↗</span>GitHub
              </a>
              <a className="btn btn-box" href={profile.contact.linkedin} rel="me noopener">
                <span aria-hidden="true">↗</span>LinkedIn
              </a>
            </div>

            <p className="hero-location">{profile.location}</p>
          </div>
          {photo && (
            <img
              className="hero-photo"
              src={photo.src}
              srcSet={photo.srcset || undefined}
              alt={`Foto de ${profile.name}`}
              width={144}
              height={144}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          )}
        </div>
      </div>
    </section>
  );
}
