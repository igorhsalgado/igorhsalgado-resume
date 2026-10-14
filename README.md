# igorhsalgado-resume

Portfólio de **Igor Hermann Salgado**, desenvolvedor backend (Go, Java e PostgreSQL).

Site estático feito com [Astro](https://astro.build) e [Tailwind CSS](https://tailwindcss.com), publicado no GitHub Pages:
<https://igorhsalgado.github.io/igorhsalgado-resume/>

- Tema escuro em tons de cinza (baseado no wireframe aprovado), fontes IBM Plex Sans e IBM Plex Mono (servidas pelo próprio site via `@fontsource`).
- Nenhum JavaScript é enviado ao navegador: a página é HTML + CSS.
- Os cards de projeto mostram dados do GitHub (último push e estrelas) e a foto do topo é o avatar do GitHub, tudo buscado **no build**.

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

### Foto

A foto do topo vem do **avatar do GitHub** (usuário `igorhsalgado`, id `145609906`). Ela é baixada de `https://avatars.githubusercontent.com/u/145609906` no início de cada build, então acompanha a foto do GitHub sozinha a cada rebuild (push na `main`, agendamento diário ou execução manual). O download é feito por `integrations/github-avatar.mjs` e salvo em `src/assets/github-avatar.jpg`, que fica fora do git.

Para usar outra foto no lugar do avatar, adicione `src/assets/foto.jpg` (também vale `foto.png`, `foto.jpeg` ou `foto.webp`; use só um deles) e publique: **a foto local sempre vence o avatar**. Para voltar ao avatar, apague o arquivo.

O build nunca falha por causa da foto: se o avatar não puder ser baixado (sem rede, erro HTTP, timeout ou resposta que não seja imagem), o build segue com a foto local, ou com um avatar baixado antes, ou sem foto (nesse caso o texto do topo ocupa a largura toda).

- Formato: **quadrado (1:1)**. Fotos em outra proporção são recortadas pelo centro.
- Tamanho recomendado para a foto local: **600 × 600 px** ou mais (o mínimo útil é 288 × 288 px).
- No build, o Astro redimensiona a imagem (144 px e 288 px, para telas comuns e de alta densidade) e converte para WebP; o arquivo original não é publicado.
- No computador a foto fica à direita do nome; no celular, acima dele.

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
  assets/       foto.jpg opcional (vence o avatar) e github-avatar.jpg (baixado no build)
public/         favicon.svg (e cv.pdf, quando existir)
integrations/   github-avatar.mjs (baixa o avatar do GitHub no build)
```
