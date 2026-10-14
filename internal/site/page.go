package site

import (
	"strings"
	"time"

	"github.com/igorhsalgado/igorhsalgado-resume/internal/content"
	"github.com/igorhsalgado/igorhsalgado-resume/internal/github"
)

// Page é tudo o que os templates recebem para montar index.html.
type Page struct {
	Title       string
	Description string
	Canonical   string
	StyleURL    string
	FaviconURL  string
	// CVURL fica vazio quando não há static/cv.pdf; os botões de CV somem.
	CVURL    string
	Profile  content.Profile
	Projects []Card
	// Photo é nil quando não há foto; o texto do topo usa a largura toda.
	Photo *Photo
	Year  int
}

// Photo é a foto do topo.
type Photo struct {
	Src    string
	Srcset string
}

// Card é um projeto já combinado com os dados do GitHub.
type Card struct {
	content.Project
	RepoURL   string
	Homepage  string
	MetaItems []MetaItem
}

// MetaKind diz que tipo de item da linha de metadados um MetaItem é.
// Os templates comparam com os valores em texto ("text", "pushed", "stars").
type MetaKind string

const (
	MetaText   MetaKind = "text"   // linha fixa do JSON, em Text
	MetaPushed MetaKind = "pushed" // data do último push, em PushedAt
	MetaStars  MetaKind = "stars"  // estrelas do GitHub, em Stars
)

// MetaItem é um item da linha de metadados do card. Kind diz qual dos
// outros campos vale.
type MetaItem struct {
	Kind     MetaKind
	Text     string
	PushedAt time.Time
	Stars    int
}

// NewCard monta o card de p. repo é nil quando os dados do GitHub não
// estão disponíveis; nesse caso o card mostra só o que vem do JSON.
func NewCard(p content.Project, repo *github.Repo) Card {
	card := Card{Project: p, RepoURL: "https://github.com/" + p.Repo}
	for _, text := range p.Meta {
		card.MetaItems = append(card.MetaItems, MetaItem{Kind: MetaText, Text: text})
	}
	if repo == nil {
		return card
	}
	if repo.HTMLURL != "" {
		card.RepoURL = repo.HTMLURL
	}
	card.Homepage = repo.Homepage
	if !repo.PushedAt.IsZero() {
		card.MetaItems = append(card.MetaItems, MetaItem{Kind: MetaPushed, PushedAt: repo.PushedAt})
	}
	if p.StarsEnabled() && repo.Stars > 0 {
		card.MetaItems = append(card.MetaItems, MetaItem{Kind: MetaStars, Stars: repo.Stars})
	}
	return card
}

// Paths monta URLs internas sob o caminho base do site
// (ex.: /igorhsalgado-resume, no GitHub Pages de projeto).
type Paths struct {
	base string
}

// NewPaths normaliza base: "", "/" e "/x/" viram "", "" e "/x".
func NewPaths(base string) Paths {
	base = strings.Trim(base, "/")
	if base == "" {
		return Paths{}
	}
	return Paths{base: "/" + base}
}

// Base devolve o caminho base sem barra final ("" na raiz do domínio).
func (p Paths) Base() string { return p.base }

// URL prefixa path com o caminho base: URL("favicon.svg") é
// "/igorhsalgado-resume/favicon.svg" e URL("") é "/igorhsalgado-resume/".
func (p Paths) URL(path string) string {
	return p.base + "/" + strings.TrimLeft(path, "/")
}
