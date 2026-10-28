<h1 align="center" style="font-weight: bold;">igorhsalgado-resume 💻</h1>

<p align="center">
 <a href="#tech">Tecnologias</a> •
 <a href="#started">Como abrir</a> •
 <a href="#colab">Colaboradores</a> •
 <a href="#contribute">Contribuir</a>
</p>

<p align="center">
    <b>Portfólio de Igor Hermann Salgado, desenvolvedor fullstack (.NET e Angular; Go, Java e PostgreSQL nos projetos). Site de uma página feito só com HTML, CSS e JavaScript, escritos à mão, sem build e sem dependências.</b>
</p>

<p align="center">
     <a href="https://igorhsalgado.github.io/igorhsalgado-resume/">📱 Visitar o site</a>
</p>

<h2 id="layout">🎨 Layout</h2>

- Uma página só: navegação, topo, Sobre, Projetos, Experiência, Stack, GitHub e Contato, cada seção aberta por um prompt de terminal (`$ cat sobre.md`, `$ ls ./projetos`...).
- Tema escuro com destaque âmbar (no `$` dos prompts, nos links e no botão principal). Fontes IBM Plex Sans e IBM Plex Mono, servidas pelo próprio site.
- O conteúdo ocupa toda a largura da tela, com respiro lateral de 16px no celular até 48px; texto corrido nunca passa de ~75 caracteres por linha.
- A página funciona inteira sem JavaScript. O `script.js` só acrescenta extras (veja abaixo).

<h2 id="tech">💻 Tecnologias</h2>

- HTML semântico
- CSS puro (camadas `@layer`, grid e flexbox, sem frameworks)
- JavaScript puro (sem bibliotecas, sem módulos)
- GitHub Actions + GitHub Pages

<h2 id="started">🚀 Como abrir</h2>

Não precisa instalar nada. Clone o repositório e abra `site/index.html` no navegador (duplo clique serve: a página usa só caminhos relativos e funciona direto do disco, via `file://`).

```bash
git clone https://github.com/igorhsalgado/igorhsalgado-resume.git
cd igorhsalgado-resume
```

Se preferir um servidor local, qualquer um serve, por exemplo `python3 -m http.server -d site 8080` e depois `http://localhost:8080`.

<h3>Dados congelados</h3>

Os dados vindos do GitHub (data do último push e estrelas dos cards, linguagens e total de repositórios da seção GitHub, e a foto, que é o avatar) estão **congelados em 21/10/2026**: estão escritos no HTML e em `site/img/`, e **não se atualizam sozinhos**. Para mudar qualquer texto, edite `site/index.html`.

A versão anterior do site gerava a página com React e buscava esses dados a cada build. Essa automação saiu nesta versão e deve voltar depois; o código antigo continua no histórico do git.

<h3>O que o JavaScript faz</h3>

`site/script.js` tem três extras pequenos, todos opcionais:

- destaca na navegação a seção que está na tela, usando `IntersectionObserver`;
- mostra o botão "copiar e-mail" no Contato, com o aviso "copiado!";
- mostra um botão flutuante "↑ topo" depois de rolar uma tela e faz a volta ao topo com rolagem suave (desligada para quem prefere menos movimento).

Sem JavaScript, os botões extras não aparecem e o resto da página fica igual; o link "↑ topo" do rodapé continua funcionando.

<h3>Deploy</h3>

O workflow `.github/workflows/deploy.yml` publica a pasta `site/` no GitHub Pages como ela está, sem build:

- a cada push na branch `main`;
- manualmente, em **Actions → Deploy (GitHub Pages) → Run workflow**.

Pull requests passam pelo `.github/workflows/ci.yml`, que roda `python3 .github/scripts/verificar_site.py site`: confere tags fechadas, ids repetidos, links internos (`#...`), arquivos locais citados no HTML e no CSS, e que nada é carregado de outro site. Dá para rodar o mesmo comando localmente (só precisa de Python 3).

Configuração necessária (uma vez só): **Settings → Pages → Build and deployment → Source: GitHub Actions**.

<h3>Estrutura</h3>

```text
site/index.html     a página inteira (todo o conteúdo está aqui)
site/style.css      estilos (cores, tipografia e layout)
site/script.js      extras: navegação ativa, copiar e-mail e voltar ao topo
site/favicon.svg    ícone da aba
site/img/           foto (avatar do GitHub em 144 e 288 px)
site/fonts/         IBM Plex Sans e Mono em woff2, com a licença (OFL.txt)
.github/workflows/  ci.yml (checagem em PRs) e deploy.yml (GitHub Pages)
.github/scripts/    verificar_site.py, a checagem usada no CI
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
3. Abra `site/index.html` no navegador para conferir e rode `python3 .github/scripts/verificar_site.py site` antes de commitar (é a mesma checagem do CI)
4. Abra um Pull Request explicando o que mudou; se houver mudança visual, inclua um print

<h3>Documentações que podem ajudar</h3>

[📝 Como criar um Pull Request](https://www.atlassian.com/br/git/tutorials/making-a-pull-request)

[💾 Padrão de commits](https://gist.github.com/joshbuchea/6f47e86d2510bce28f8e7f42ae84c716)
