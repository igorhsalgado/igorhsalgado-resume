<h1 align="center" style="font-weight: bold;">igorhsalgado-resume 💻</h1>

<p align="center">
 <a href="#tech">Tecnologias</a> •
 <a href="#started">Como começar</a> •
 <a href="#colab">Colaboradores</a> •
 <a href="#contribute">Contribuir</a>
</p>

<p align="center">
    <b>Portfólio de Igor Hermann Salgado, desenvolvedor backend (Go, Java e PostgreSQL). Site estático gerado em Go, sem Node e sem JavaScript no navegador.</b>
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

- [Go](https://go.dev) com `html/template` (templates embutidos no binário)
- CSS puro
- API do GitHub (consultada só durante o build)
- GitHub Actions + GitHub Pages

<h2 id="started">🚀 Como começar</h2>

<h3>Pré-requisitos</h3>

- [Go](https://go.dev/dl/) (versão definida no `go.mod`)
- [Git](https://git-scm.com)

<h3>Clonando</h3>

```bash
git clone https://github.com/igorhsalgado/igorhsalgado-resume.git
cd igorhsalgado-resume
```

<h3>Rodando</h3>

```bash
# servidor local em http://localhost:8080/
go run ./cmd/site -serve :8080

# gera o site estático em dist/, com o mesmo base e domínio do GitHub Pages
go run ./cmd/site -out dist -base /igorhsalgado-resume -site https://igorhsalgado.github.io

# testes
go test ./...
```

Flags de `cmd/site`:

| Flag | Para que serve |
| --- | --- |
| `-out` | Pasta de saída do site estático (ex.: `dist`). |
| `-base` | Caminho base dos links (`/igorhsalgado-resume` no GitHub Pages). |
| `-site` | Domínio do site (`https://igorhsalgado.github.io`). |
| `-serve` | Endereço para servir o site localmente (ex.: `:8080`). |

Opcional: defina `GITHUB_TOKEN` no ambiente para aumentar o limite de requisições à API do GitHub durante o build. Sem ele o build funciona do mesmo jeito.

<h3>Onde fica o conteúdo</h3>

Todo o texto do site sai de dois arquivos JSON, lidos por `internal/content`. Não é preciso mexer nos templates para atualizar o conteúdo:

| Arquivo | O que tem |
| --- | --- |
| `data/profile.json` | Nome, título, pitch, localização, texto do "Sobre", experiência, formação, grupos da stack e contatos. |
| `data/projects.json` | Lista de projetos com o repositório no GitHub (`dono/nome`), título, descrição, tags e status. |

- **Foto:** por padrão é o avatar do GitHub (`igorhsalgado`). Para usar outra, adicione `static/foto.jpg` (quadrada, 1:1); a foto local sempre vence o avatar.
- **Currículo em PDF:** o botão "Baixar CV" só aparece se existir `static/cv.pdf` no momento do build.
- **Dados do GitHub:** `internal/github` consulta a API para cada projeto. Se a consulta falhar (sem rede, limite de taxa, repositório privado), o build continua e o card apenas omite esses campos.

<h3>Estrutura</h3>

```text
cmd/site/          ponto de entrada (build estático e servidor local)
internal/content/  leitura de data/profile.json e data/projects.json
internal/github/   dados da API do GitHub (com fallback) e avatar
internal/site/     templates html/template embutidos
data/              conteúdo do site (JSON)
static/            CSS, fontes IBM Plex, favicon (e foto.jpg / cv.pdf opcionais)
```

<h3>Deploy</h3>

O deploy é feito por GitHub Actions no GitHub Pages:

- a cada push na branch `main`;
- uma vez por dia, às 06:00 UTC (atualiza último push e estrelas dos cards);
- manualmente, em **Actions → Run workflow**.

Pull requests passam pelo CI, que roda `gofmt`, `go vet`, `go test` e o build.

Configuração necessária (uma vez só): **Settings → Pages → Build and deployment → Source: GitHub Actions**.

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
3. Rode `gofmt -l .`, `go vet ./...` e `go test ./...` antes de commitar
4. Abra um Pull Request explicando o que mudou; se houver mudança visual, inclua um print

<h3>Documentações que podem ajudar</h3>

[📝 Como criar um Pull Request](https://www.atlassian.com/br/git/tutorials/making-a-pull-request)

[💾 Padrão de commits](https://gist.github.com/joshbuchea/6f47e86d2510bce28f8e7f42ae84c716)
