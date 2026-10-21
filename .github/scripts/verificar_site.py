"""Checagem simples do site em site/, sem dependências (só a biblioteca padrão).

Confere:
  - tags HTML abertas e fechadas na ordem certa;
  - ids únicos e links internos (#algo) apontando para ids que existem;
  - arquivos locais citados no HTML (href, src, srcset) e no CSS (url(...));
  - nenhum script ou folha de estilo vindo de outro site (a página abre offline).

Uso: python3 .github/scripts/verificar_site.py [pasta]   (padrão: site)
"""

import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

# Elementos sem tag de fechamento.
VAZIOS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class Leitor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.pilha = []
        self.ids = []
        self.ancoras = []
        self.arquivos = []
        self.erros = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag not in VAZIOS and self.pilha is not None:
            self.pilha.append((tag, self.getpos()[0]))
        if a.get("id"):
            self.ids.append(a["id"])
        for nome in ("href", "src"):
            if a.get(nome):
                self.anotar(a[nome], tag)
        if a.get("srcset"):
            for parte in a["srcset"].split(","):
                self.anotar(parte.strip().split(" ")[0], tag)

    def handle_startendtag(self, tag, attrs):
        # <img ... /> conta como abertura sem fechamento.
        self.handle_starttag(tag, attrs)
        if tag not in VAZIOS and self.pilha is not None:
            self.pilha.pop()

    def handle_endtag(self, tag):
        if tag in VAZIOS or self.pilha is None:
            return
        if not self.pilha or self.pilha[-1][0] != tag:
            topo = self.pilha[-1] if self.pilha else ("nada", 0)
            self.erros.append(f"linha {self.getpos()[0]}: </{tag}> fecha <{topo[0]}> (aberta na linha {topo[1]})")
            # Depois do primeiro erro de estrutura o resto vira ruído: para de conferir.
            self.pilha = None
            return
        self.pilha.pop()

    def anotar(self, url, tag):
        u = urlparse(url)
        if u.scheme in ("http", "https", "mailto"):
            if tag in ("script", "link") and u.scheme != "mailto" and not self.e_meta_link():
                self.erros.append(f"<{tag}> carrega algo de fora: {url}")
            return
        if url.startswith("#"):
            self.ancoras.append(url[1:])
        elif url:
            self.arquivos.append(u.path)

    def e_meta_link(self):
        # <link rel="canonical"> aponta para fora de propósito.
        return self.get_starttag_text() and 'rel="canonical"' in self.get_starttag_text()


def verificar(pasta: Path) -> list[str]:
    erros = []
    for html in sorted(pasta.glob("*.html")):
        leitor = Leitor()
        leitor.feed(html.read_text(encoding="utf-8"))
        leitor.close()
        erros += [f"{html.name}: {e}" for e in leitor.erros]
        erros += [f"{html.name}: <{t}> aberta na linha {l} e nunca fechada" for t, l in leitor.pilha or []]

        repetidos = {i for i in leitor.ids if leitor.ids.count(i) > 1}
        erros += [f"{html.name}: id repetido: {i}" for i in sorted(repetidos)]
        erros += [f"{html.name}: link para #{a}, mas esse id não existe" for a in leitor.ancoras if a not in leitor.ids]
        erros += [f"{html.name}: arquivo não encontrado: {f}" for f in leitor.arquivos if not (pasta / f).is_file()]

    for css in sorted(pasta.glob("*.css")):
        for url in re.findall(r"url\(\s*['\"]?([^'\")]+)", css.read_text(encoding="utf-8")):
            if not (css.parent / url).is_file():
                erros.append(f"{css.name}: arquivo não encontrado: {url}")
    return erros


if __name__ == "__main__":
    pasta = Path(sys.argv[1] if len(sys.argv) > 1 else "site")
    if not (pasta / "index.html").is_file():
        sys.exit(f"{pasta}/index.html não existe")
    erros = verificar(pasta)
    for e in erros:
        print(e)
    if erros:
        sys.exit(1)
    print(f"{pasta}/: tudo certo")
