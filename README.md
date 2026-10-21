<h1 align="center" style="font-weight: bold;">igorhsalgado-resume 💻</h1>

<p align="center">
 <a href="#tech">Tecnologias</a> •
 <a href="#started">Como começar</a> •
 <a href="#colab">Colaboradores</a> •
 <a href="#contribute">Contribuir</a>
</p>

<p align="center">
    <b>Portfólio de Igor Hermann Salgado, desenvolvedor backend (Go, Java e PostgreSQL). Site estático feito com React e pré-renderizado no build (Node + Vite): o navegador recebe só HTML e CSS, sem JavaScript.</b>
</p>

<p align="center">
     <a href="https://igorhsalgado.github.io/igorhsalgado-resume/">📱 Visitar o site</a>
</p>

<h2 id="layout">🎨 Layout</h2>

- Uma página só, em uma coluna: navegação, topo, Sobre, Projetos, Experiência, Stack, GitHub e Contato, cada seção aberta por um prompt (`$ cat sobre.md`, `$ ls ./projetos`...).
- O conteúdo ocupa toda a largura da tela, com respiro lateral fluido (16px no celular, até 48px). Quem preenche a largura são as grades: quadros de resumo do Sobre, cards de projeto (`auto-fit` de 22rem), grupos da Stack lado a lado (a partir de 1024px) e Formação ao lado da Experiência. Texto corrido nunca passa de ~75 caracteres por linha.
- Tema escuro com acento âmbar (usado no `$` dos prompts, nos links e no botão principal). A barra de linguagens da seção GitHub usa só tons de cinza.
- Fontes IBM Plex Sans e IBM Plex Mono, servidas pelo próprio site.
- A página é só HTML + CSS: os componentes React rodam no build e nenhum JavaScript é enviado ao navegador.
- Os cards de projeto mostram dados do GitHub (último push e estrelas), a seção GitHub mostra as linguagens do código público e a foto do topo é o avatar do GitHub, tudo buscado **no build**.

<h2 id="tech">💻 Tecnologias</h2>

- [React](https://react.dev) 19 com TypeScript, renderizado no servidor (`renderToStaticMarkup`) só durante o build
- [Vite](https://vite.dev) 8: compila o gerador e serve a página no `npm run dev`
- [Vitest](https://vitest.dev) para os testes
- CSS puro (escrito à mão, sem Tailwind nem CSS-in-JS) e fontes IBM Plex (licença OFL) servidas pelo próprio site
- API do GitHub (consultada só durante o build, pelo Node)
- GitHub Actions + GitHub Pages

<h2 id="started">🚀 Como começar</h2>

<h3>Pré-requisitos</h3>

- [Node.js](https://nodejs.org) 22 ou mais recente (versão definida no `.nvmrc`)
- [Git](https://git-scm.com)

<h3>Clonando</h3>

```bash
git clone https://github.com/igorhsalgado/igorhsalgado-resume.git
cd igorhsalgado-resume
```

<h3>Rodando</h3>

```bash
npm ci              # instala as dependências (versões travadas no package-lock.json)
npm run dev         # serve a página em http://localhost:8080/igorhsalgado-resume/, renderizada a cada acesso
npm run build       # gera o site em dist/
npm run preview     # serve dist/ em http://localhost:8080/igorhsalgado-resume/, como no GitHub Pages
npm test            # testes
npm run typecheck   # checagem de tipos
```

No `npm run dev`, a página é renderizada de novo a cada recarregamento, então mudanças em `src/` e `data/` aparecem ao atualizar o navegador. Os dados do GitHub são buscados uma vez só por execução.

O `npm run build` tem duas etapas: o Vite compila o gerador (`src/build.ts` e os componentes React) para `.ssr/build.js`, e o Node roda esse arquivo para gerar `dist/`. Opções do gerador (todas opcionais), passadas depois de `--` (ex.: `npm run build -- --out /tmp/site`):

| Opção | Padrão | Para que serve |
| --- | --- | --- |
| `--out` | `dist` | Diretório de saída, apagado e recriado a cada build. Não pode ser o diretório atual (nem um acima dele) nem se sobrepor a `static/` ou `data/`. |
| `--base` | `/igorhsalgado-resume` | Caminho base onde o site é publicado. Também pode vir da variável `BASE_PATH`, que vale para o `dev` e o `preview`. |
| `--site` | `https://igorhsalgado.github.io` | Origem do site, usada no canonical e no `og:url`. |

Opcional: defina `GITHUB_TOKEN` no ambiente para aumentar o limite de requisições à API do GitHub. Sem ele o build funciona do mesmo jeito. Para testes, `GITHUB_API_URL` e `GITHUB_AVATAR_URL` trocam os endereços da API e dos avatares.

<h3>Onde fica o conteúdo</h3>

Todo o texto do site sai de dois arquivos JSON, lidos e validados por `src/content.ts`. Não é preciso mexer no código para atualizar o conteúdo:

| Arquivo | O que tem |
| --- | --- |
| `data/profile.json` | Nome, handle, título, pitch, localização, foco (`focus`, opcional), "Sobre", experiência, formação, grupos da stack e contatos. |
| `data/projects.json` | Projetos: `slug`, `repo` (`dono/nome` no GitHub), `title`, `description`, `tags`, `meta` e, opcionalmente, `status` (`"em-desenvolvimento"`) e `showStars` (`false` esconde as estrelas). |

O build para com uma mensagem clara se faltar um campo obrigatório, se houver um campo desconhecido (um erro de digitação, por exemplo), se um `slug` não for só letras minúsculas, números e hífens ou estiver repetido, se `repo` não estiver no formato `dono/nome`, se uma linha de `meta` estiver vazia, se as URLs de contato (`linkedin`, `github`) não forem http(s) válidas ou tiverem espaços no começo ou no fim, ou se `status` tiver outro valor. Sem `status`, o projeto é tratado como concluído e o badge não aparece.

Os quadros de resumo abaixo do "Sobre" saem desses mesmos dados, sem texto novo: **Atualmente** (o primeiro item de `experience`, só se o período terminar em "atual"), **Formação** (o primeiro item de `education`), **Foco** (`focus`) e **Local** (`location`). Quadro sem dado não aparece.

<h3>Foto e currículo</h3>

Tudo o que está em `static/` é copiado como está para o site.

- **Foto:** por padrão é o avatar do GitHub (`igorhsalgado`), baixado a cada build em 144 px e 288 px. Para usar outra, adicione `static/foto.jpg` (também vale `.jpeg`, `.png` ou `.webp`): a foto local sempre vence o avatar. Ela não é redimensionada no build, então use uma imagem **quadrada**, de 288 × 288 px ou mais, e leve. Se nenhuma das duas estiver disponível, a página sai sem foto.
- **Currículo:** os botões de CV só aparecem se existir `static/cv.pdf`.

<h3>Dados do GitHub</h3>

Durante o build, `src/github.ts` consulta `https://api.github.com/repos/{repo}` para cada projeto e usa `pushed_at`, `stargazers_count`, `html_url` e `homepage`. O navegador do visitante nunca chama a API. Se a consulta falhar (sem rede, limite de taxa, repositório privado), o build segue com um aviso no log e o card mostra só o que está no JSON.

A seção **GitHub** (`$ github --stats`) usa o usuário de `contact.github`: o total de repositórios públicos (`/users/{login}`) e a soma dos bytes por linguagem (`/repos/{repo}/languages`) dos repositórios públicos dele que não são fork, mais os repositórios dos projetos. As cinco maiores aparecem pelo nome, o resto vira "Outras". É tudo ou nada: se qualquer consulta falhar, a seção inteira sai da página (com um aviso no log), para nunca mostrar uma soma parcial. Ela não entra na navegação.

<h3>Deploy</h3>

O workflow `.github/workflows/deploy.yml` instala as dependências com `npm ci`, gera o site com `npm run build` e publica `dist/` no GitHub Pages:

- a cada push na branch `main`;
- todo dia às 06:00 UTC (`cron: '0 6 * * *'`), para atualizar os cards e a foto;
- manualmente, em **Actions → Deploy (GitHub Pages) → Run workflow**.

O GitHub desativa workflows agendados depois de 60 dias sem atividade no repositório, o que pararia o rebuild diário. Para reativar, use a aba **Actions** (qualquer push também mantém o agendamento ativo).

Pull requests passam pelo `.github/workflows/ci.yml`: `npm run typecheck`, `npm test`, build e uma checagem de que `dist/` não tem JavaScript.

Configuração necessária (uma vez só): **Settings → Pages → Build and deployment → Source: GitHub Actions**.

<h3>Estrutura</h3>

```text
.github/workflows/  ci.yml (checagens em PRs) e deploy.yml (GitHub Pages)
data/               profile.json e projects.json (conteúdo)
src/build.ts        ponto de entrada do build: opções e geração de dist/
src/output.ts       grava dist/ (copia static/, index.html e avatares) e protege --out
src/generate.ts     lê o conteúdo, busca os dados do GitHub, escolhe a foto e renderiza a página
src/content.ts      tipos, leitura estrita e validação de data/*.json
src/github.ts       cliente da API do GitHub: repositórios, linguagens e avatar
src/summary.ts      quadros do "Sobre" e porcentagens de linguagens
src/page.ts         modelo da página, cards, caminho base e datas
src/validate.ts     regras de formato compartilhadas (repositório dono/nome, URLs http(s), login)
src/render.tsx      renderToStaticMarkup do documento inteiro
src/components/     componentes React (Layout, Nav, Hero, Sections, ProjectCard)
static/             style.css, favicon.svg e fonts/ (IBM Plex em woff2 + OFL.txt);
                    opcionalmente foto.jpg e cv.pdf
test/               testes (Vitest) e fixtures
vite.config.ts      build do gerador e servidor de desenvolvimento
package.json        scripts e dependências (package-lock.json trava as versões)
```

<h2 id="colab">🤝 Colaboradores</h2>

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/igorhsalgado">
        <img src="https://avatars.githubusercontent.com/u/145609906?v=4" width="100px;" alt="Foto de Igor Hermann Salgado"/><br>
        <sub>
          <b>Igor Hermann Salgado</b>
        </sub>
      </a>
    </td>
  </tr>
</table>

<h2 id="contribute">📫 Contribuir</h2>

1. `git clone https://github.com/igorhsalgado/igorhsalgado-resume.git`
2. `git checkout -b feat/NOME`
3. Rode `npm run typecheck`, `npm test` e `npm run build` antes de commitar (são as mesmas checagens do CI)
4. Abra um Pull Request explicando o que mudou; se houver mudança visual, inclua um print

<h3>Documentações que podem ajudar</h3>

[📝 Como criar um Pull Request](https://www.atlassian.com/br/git/tutorials/making-a-pull-request)

[💾 Padrão de commits](https://gist.github.com/joshbuchea/6f47e86d2510bce28f8e7f42ae84c716)
