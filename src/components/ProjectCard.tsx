import { statusLabel } from "../content.ts";
import { formatDate, isoDate, type Card, type MetaItem } from "../page.ts";

function Meta({ item }: { item: MetaItem }) {
  switch (item.kind) {
    case "stars":
      return (
        <span>
          <span aria-hidden="true">{`★ ${item.stars}`}</span>
          <span className="sr-only">{`${item.stars} ${item.stars === 1 ? "estrela" : "estrelas"} no GitHub`}</span>
        </span>
      );
    case "pushed":
      return (
        <span>
          último push: <time dateTime={isoDate(item.pushedAt)}>{formatDate(item.pushedAt)}</time>
        </span>
      );
    case "text":
      return <span>{item.text}</span>;
  }
}

/** Card de projeto, já com os dados do GitHub (quando a API respondeu). */
export function ProjectCard({ card }: { card: Card }) {
  return (
    <article className="card" aria-labelledby={`proj-${card.slug}`}>
      <h3 id={`proj-${card.slug}`} className="card-title" aria-label={card.title}>
        <span className="card-title-prefix">./</span>
        {`${card.slug}/`}
      </h3>
      {card.status && (
        <span className="status">
          <span aria-hidden="true">●</span> {statusLabel(card.status)}
        </span>
      )}

      <p>{card.description}</p>

      <ul className="tags" aria-label="Tecnologias">
        {card.tags.map((tag, i) => (
          <li key={i} className="tag">
            {tag}
          </li>
        ))}
      </ul>

      <p className="card-meta">
        {card.metaItems.map((item, i) => [
          i > 0 && (
            <span key={`sep-${i}`} aria-hidden="true">
              {" · "}
            </span>
          ),
          <Meta key={i} item={item} />,
        ])}
      </p>

      <div className="card-links">
        <a href={card.repoURL} rel="noopener">
          Repositório<span className="sr-only">{` de ${card.title} no GitHub`}</span>
        </a>
        {card.homepage && (
          <a href={card.homepage} rel="noopener">
            Demo<span className="sr-only">{` de ${card.title}`}</span>
          </a>
        )}
      </div>
    </article>
  );
}
