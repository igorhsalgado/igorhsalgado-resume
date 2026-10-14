<h1 align="center" style="font-weight: bold;">igorhsalgado-resume 💻</h1>

<p align="center">
 <a href="#tech">Tecnologias</a> •
 <a href="#started">Como começar</a> •
 <a href="#colab">Colaboradores</a> •
 <a href="#contribute">Contribuir</a>
</p>

<p align="center">
    <b>Portfólio de Igor Hermann Salgado, desenvolvedor backend (Go, Java e PostgreSQL). Site estático gerado em Go (só biblioteca padrão), sem Node e sem JavaScript no navegador.</b>
</p>

<p align="center">
     <a href="https://igorhsalgado.github.io/igorhsalgado-resume/">📱 Visitar o site</a>
</p>

<h2 id="layout">🎨 Layout</h2>

- Tema escuro com acento âmbar (usado no `$` dos prompts, nos links e no botão principal).
- Fontes IBM Plex Sans e IBM Plex Mono, servidas pelo próprio site.
- A página é só HTML + CSS: nenhum JavaScript é enviado ao navegador.
- Os cards de projeto mostram dados do GitHub (último push e estrelas) e a foto do topo é o avatar do GitHub, tudo buscado **no build**.

<h2 id="tech">💻 Tecnologias</h2>

- [Go](https://go.dev) 1.25 ou mais recente, só biblioteca padrão (sem dependências externas)
- `html/template`, com os templates embutidos no binário
- CSS puro e fontes IBM Plex (licença OFL) servidas pelo próprio site
- API do GitHub (consultada só durante o build)
- GitHub Actions + GitHub Pages

<h2 id="started">🚀 Como começar</h2>

<h3>Pré-requisitos</h3>

- [Go](https://go.dev/dl/) 1.25 ou mais recente (versão definida no `go.mod`)
- [Git](https://git-scm.com)

<h3>Clonando</h3>

```bash
git clone https://github.com/igorhsalgado/igorhsalgado-resume.git
cd igorhsalgado-resume
```

<h3>Rodando</h3>

```bash
go run ./cmd/site -serve :8080   # gera dist/ e serve em http://localhost:8080/igorhsalgado-resume/
go run ./cmd/site                # só gera o site em dist/
go test ./...                    # testes
```

Flags de `cmd/site` (todas opcionais):

| Flag | Padrão | Para que serve |
| --- | --- | --- |
| `-out` | `dist` | Diretório de saída, apagado e recriado a cada build. Não pode ser o diretório atual (nem um acima dele) nem se sobrepor a `static/` ou `data/`. |
| `-base` | `/igorhsalgado-resume` | Caminho base onde o site é publicado. |
| `-site` | `https://igorhsalgado.github.io` | Origem do site, usada no canonical e no `og:url`. |
| `-serve` | (vazio) | Depois do build, serve o site neste endereço (ex.: `:8080`). |

Opcional: defina `GITHUB_TOKEN` no ambiente para aumentar o limite de requisições à API do GitHub. Sem ele o build funciona do mesmo jeito.

<h3>Onde fica o conteúdo</h3>

Todo o texto do site sai de dois arquivos JSON, lidos e validados por `internal/content`. Não é preciso mexer no código para atualizar o conteúdo:

| Arquivo | O que tem |
| --- | --- |
| `data/profile.json` | Nome, handle, título, pitch, localização, "Sobre", experiência, formação, grupos da stack e contatos. |
| `data/projects.json` | Projetos: `slug`, `repo` (`dono/nome` no GitHub), `title`, `description`, `tags`, `meta` e, opcionalmente, `status` (`"em-desenvolvimento"`) e `showStars` (`false` esconde as estrelas). |

O build para com uma mensagem clara se faltar um campo obrigatório, se houver um campo desconhecido (um erro de digitação, por exemplo), se um `slug` não for só letras minúsculas, números e hífens ou estiver repetido, se `repo` não estiver no formato `dono/nome`, se uma linha de `meta` estiver vazia, se as URLs de contato (`linkedin`, `github`) não forem http(s) válidas ou tiverem espaços no começo ou no fim, ou se `status` tiver outro valor. Sem `status`, o projeto é tratado como concluído e o badge não aparece.

<h3>Foto e currículo</h3>

Tudo o que está em `static/` é copiado como está para o site.

- **Foto:** por padrão é o avatar do GitHub (`igorhsalgado`), baixado a cada build em 144 px e 288 px. Para usar outra, adicione `static/foto.jpg` (também vale `.jpeg`, `.png` ou `.webp`): a foto local sempre vence o avatar. Ela não é redimensionada no build, então use uma imagem **quadrada**, de 288 × 288 px ou mais, e leve. Se nenhuma das duas estiver disponível, a página sai sem foto.
- **Currículo:** os botões de CV só aparecem se existir `static/cv.pdf`.

<h3>Dados do GitHub</h3>

Durante o build, `internal/github` consulta `https://api.github.com/repos/{repo}` para cada projeto e usa `pushed_at`, `stargazers_count`, `html_url` e `homepage`. O navegador do visitante nunca chama a API. Se a consulta falhar (sem rede, limite de taxa, repositório privado), o build segue com um aviso no log e o card mostra só o que está no JSON.

<h3>Deploy</h3>

O workflow `.github/workflows/deploy.yml` gera o site com `go run ./cmd/site -out dist` e publica no GitHub Pages:

- a cada push na branch `main`;
- todo dia às 06:00 UTC (`cron: '0 6 * * *'`), para atualizar os cards e a foto;
- manualmente, em **Actions → Deploy (GitHub Pages) → Run workflow**.

O GitHub desativa workflows agendados depois de 60 dias sem atividade no repositório, o que pararia o rebuild diário. Para reativar, use a aba **Actions** (qualquer push também mantém o agendamento ativo).

Pull requests passam pelo `.github/workflows/ci.yml`: `gofmt -l .`, `go vet ./...`, `go test -race ./...` e build.

Configuração necessária (uma vez só): **Settings → Pages → Build and deployment → Source: GitHub Actions**.

<h3>Estrutura</h3>

```text
.github/workflows/  ci.yml (checagens em PRs) e deploy.yml (GitHub Pages)
cmd/site/           main.go: flags, build e servidor local
data/               profile.json e projects.json (conteúdo)
internal/content/   tipos, leitura e validação de data/*.json
internal/github/    cliente da API do GitHub (github.go) e avatar (avatar.go)
internal/site/      build.go, page.go, photo.go, render.go e templates/ (HTML embutido)
internal/validate/  regras de formato compartilhadas (repositório dono/nome, URLs http(s))
static/             style.css, favicon.svg e fonts/ (IBM Plex em woff2 + OFL.txt);
                    opcionalmente foto.jpg e cv.pdf
go.mod
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
3. Rode `gofmt -l .`, `go vet ./...` e `go test -race ./...` antes de commitar (são as mesmas checagens do CI)
4. Abra um Pull Request explicando o que mudou; se houver mudança visual, inclua um print

<h3>Documentações que podem ajudar</h3>

[📝 Como criar um Pull Request](https://www.atlassian.com/br/git/tutorials/making-a-pull-request)

[💾 Padrão de commits](https://gist.github.com/joshbuchea/6f47e86d2510bce28f8e7f42ae84c716)
