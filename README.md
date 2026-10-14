# igorhsalgado-resume

Portfólio de **Igor Hermann Salgado**, desenvolvedor backend (Go, Java e PostgreSQL), publicado no GitHub Pages:
<https://igorhsalgado.github.io/igorhsalgado-resume/>

O site é gerado por um pequeno gerador estático em Go (só biblioteca padrão): lê o conteúdo em JSON, busca dados públicos do GitHub **no build** e renderiza uma página HTML + CSS com `html/template`. Nenhum JavaScript é enviado ao navegador.

## Como rodar

Requer Go 1.27.2 ou mais recente (versão definida no `go.mod`).

```bash
go run ./cmd/site -serve :8080   # gera dist/ e serve em http://localhost:8080/igorhsalgado-resume/
go run ./cmd/site                # só gera o site em dist/
go test ./...                    # testes
```

Flags: `-out` (diretório de saída, padrão `dist`), `-base` (caminho base, padrão `/igorhsalgado-resume`), `-site` (origem usada no canonical, padrão `https://igorhsalgado.github.io`) e `-serve` (endereço do servidor local).

Opcional: defina `GITHUB_TOKEN` no ambiente para aumentar o limite de requisições à API do GitHub. Sem ele o build funciona do mesmo jeito.

## Conteúdo

Todo o texto do site sai de dois arquivos; não é preciso mexer no código para atualizá-lo:

| Arquivo | O que tem |
| --- | --- |
| `data/profile.json` | Nome, título, pitch, localização, "Sobre", experiência, formação, stack e contatos. |
| `data/projects.json` | Projetos: `slug`, `repo` (`dono/nome` no GitHub), `title`, `description`, `tags`, `meta` e, opcionalmente, `status` (`"em-desenvolvimento"`) e `showStars` (`false` esconde as estrelas). |

O build valida os dois arquivos e para com uma mensagem clara se faltar um campo obrigatório ou houver um campo desconhecido.

### Foto e currículo

Tudo o que está em `static/` é copiado para o site.

- **Foto**: por padrão é o avatar do GitHub, baixado a cada build em 144 px e 288 px. Para usar outra, adicione `static/foto.jpg` (ou `.jpeg`, `.png`, `.webp`): a foto local sempre vence o avatar. Use uma imagem **quadrada**, de 288 × 288 px ou mais e leve. Se nenhuma das duas estiver disponível, a página sai sem foto.
- **Currículo**: os botões de CV só aparecem se existir `static/cv.pdf`.

## Dados do GitHub e deploy

Durante o build, cada card de projeto consulta `https://api.github.com/repos/{repo}` e usa `pushed_at`, `stargazers_count`, `html_url` e `homepage`. Se a consulta falhar (sem rede, limite de taxa, repositório privado), o build segue e o card mostra só o que está no JSON.

O workflow `.github/workflows/deploy.yml` gera o site e publica no GitHub Pages:

- a cada push na `main`;
- todo dia às 06:00 UTC (`cron: '0 6 * * *'`), para atualizar os cards e a foto;
- manualmente, em **Actions → Deploy (GitHub Pages) → Run workflow**.

Pull requests passam pelo `.github/workflows/ci.yml`: `gofmt`, `go vet`, `go test` e build.

## Estrutura

```text
cmd/site/           ponto de entrada: flags, build e servidor local
internal/content/   tipos, leitura e validação de data/*.json
internal/github/    cliente da API do GitHub (repositórios e avatar)
internal/site/      montagem do site e templates HTML (embutidos no binário)
data/               profile.json e projects.json
static/             style.css, favicon.svg, fontes IBM Plex (licença OFL) e, opcionalmente, foto e cv.pdf
```
