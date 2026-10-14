# igorhsalgado-resume

Portfólio de **Igor Hermann Salgado**, desenvolvedor backend (Go, Java e PostgreSQL).

Site estático feito com [Astro](https://astro.build) e [Tailwind CSS](https://tailwindcss.com), publicado no GitHub Pages:
<https://igorhsalgado.github.io/igorhsalgado-resume/>

- Tema escuro, fontes IBM Plex Sans e IBM Plex Mono (servidas pelo próprio site via `@fontsource`).
- Nenhum JavaScript é enviado ao navegador: a página é HTML + CSS.
- Os cards de projeto mostram dados do GitHub (último push e estrelas) buscados **no build**.

## Como rodar

Requer Node.js 22.12 ou mais recente.

```bash
npm install      # instala as dependências
npm run dev      # servidor local em http://localhost:4321/igorhsalgado-resume/
npm run build    # gera o site estático em dist/
npm run preview  # serve o dist/ localmente
npm run check    # checagem de tipos (astro check)
```

Opcional: defina `GITHUB_TOKEN` no ambiente para aumentar o limite de requisições à API do GitHub durante o build. Sem ele o build funciona do mesmo jeito.

## Onde fica o conteúdo

Todo o texto do site sai de dois arquivos JSON — não é preciso mexer nos componentes para atualizar o conteúdo:

| Arquivo | O que tem |
| --- | --- |
| `src/data/profile.json` | Nome, título, pitch, localização, texto do "Sobre", experiência, formação, grupos da stack e contatos. |
| `src/data/projects.json` | Lista de projetos: `slug`, `repo` (`dono/nome` no GitHub), `title`, `description`, `tags`, `meta` e, opcionalmente, `status` (`"em-desenvolvimento"`) e `showStars` (`false` para esconder as estrelas). |

Para adicionar um projeto, inclua um novo objeto em `projects.json`. Para marcar um projeto como concluído, remova o campo `status` (o badge some).

### Currículo em PDF

O botão "Baixar CV" só aparece se existir o arquivo `public/cv.pdf` no momento do build. Basta adicionar o PDF nesse caminho e publicar.

## Como os cards de projeto se atualizam

`src/lib/github.ts` consulta `https://api.github.com/repos/{repo}` para cada projeto **durante o build** e usa `pushed_at`, `stargazers_count`, `html_url` e `homepage`. O navegador do visitante nunca chama a API.

Se a consulta falhar (sem rede, limite de taxa, repositório privado ou removido), o build continua normalmente e o card apenas omite esses campos.

Os dados são atualizados sempre que o site é reconstruído:

- a cada push na branch `main`;
- uma vez por dia, pelo agendamento (`cron: '0 6 * * *'`, 06:00 UTC) do workflow de deploy;
- manualmente, em **Actions → Deploy (GitHub Pages) → Run workflow**.

## Deploy

O deploy é feito pelo workflow `.github/workflows/deploy.yml`, usando a action oficial `withastro/action` e `actions/deploy-pages`. Pull requests passam pelo `.github/workflows/ci.yml`, que só roda o build.

Configuração necessária (uma vez só) no repositório do GitHub:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Pronto: o próximo push na `main` publica o site.

O site é uma *project page*, por isso `astro.config.mjs` define `site: 'https://igorhsalgado.github.io'` e `base: '/igorhsalgado-resume'`. Links e arquivos internos usam esse `base` (veja `withBase` em `src/lib/site.ts`). Se um dia o site for movido para um domínio próprio ou para o repositório `igorhsalgado.github.io`, ajuste esses dois valores.

## Estrutura

```text
src/
  components/   Nav, cabeçalho de seção e card de projeto
  data/         profile.json e projects.json (conteúdo)
  layouts/      HTML base, meta tags e fontes
  lib/          leitura do conteúdo, API do GitHub e helpers de caminho
  pages/        index.astro (página inicial)
  styles/       global.css (tokens do design system + Tailwind)
public/         favicon.svg (e cv.pdf, quando existir)
```
