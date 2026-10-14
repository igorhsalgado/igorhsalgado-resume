package site

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/igorhsalgado/igorhsalgado-resume/internal/content"
	"github.com/igorhsalgado/igorhsalgado-resume/internal/github"
)

// fakeGitHub responde com dados fixos; o que não estiver nos mapas vira erro.
type fakeGitHub struct {
	repos       map[string]github.Repo
	avatars     map[int]github.Image // por tamanho
	avatarCalls atomic.Int32
}

func (f *fakeGitHub) Repo(_ context.Context, name string) (github.Repo, error) {
	if r, ok := f.repos[name]; ok {
		return r, nil
	}
	return github.Repo{}, &github.StatusError{StatusCode: 403, RateLimited: true}
}

func (f *fakeGitHub) Avatar(_ context.Context, _ int64, size int) (github.Image, error) {
	f.avatarCalls.Add(1)
	if img, ok := f.avatars[size]; ok {
		return img, nil
	}
	return github.Image{}, errors.New("sem rede")
}

var (
	jpeg1x = github.Image{Data: []byte("jpeg-144"), Ext: "jpg"}
	jpeg2x = github.Image{Data: []byte("jpeg-288"), Ext: "jpg"}
)

func fullGitHub() *fakeGitHub {
	repo := github.Repo{
		PushedAt: time.Date(2026, 10, 12, 18, 0, 0, 0, time.UTC),
		Stars:    3,
		HTMLURL:  "https://github.com/exemplo/com-dados",
		Homepage: "https://exemplo.dev/",
	}
	hidden := repo
	hidden.HTMLURL = "https://github.com/exemplo/sem-estrelas"
	hidden.Homepage = ""
	return &fakeGitHub{
		repos:   map[string]github.Repo{"exemplo/com-dados": repo, "exemplo/sem-estrelas": hidden},
		avatars: map[int]github.Image{144: jpeg1x, 288: jpeg2x},
	}
}

// newStatic cria um diretório static/ mínimo com os arquivos extras dados.
func newStatic(t *testing.T, extra ...string) string {
	t.Helper()
	dir := t.TempDir()
	files := map[string]string{"style.css": "body{}", "favicon.svg": "<svg/>"}
	for _, name := range extra {
		files[name] = "x"
	}
	for name, body := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func testConfig(t *testing.T, gh GitHub, static string) (Config, *bytes.Buffer) {
	t.Helper()
	var logs bytes.Buffer
	return Config{
		DataDir:      "testdata",
		StaticDir:    static,
		OutDir:       filepath.Join(t.TempDir(), "dist"),
		SiteURL:      "https://exemplo.github.io/",
		BasePath:     "/portfolio/",
		GitHub:       gh,
		AvatarUserID: 145609906,
		Logger:       slog.New(slog.NewTextHandler(&logs, nil)),
		Now:          time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC),
	}, &logs
}

func build(t *testing.T, cfg Config) string {
	t.Helper()
	if err := Build(context.Background(), cfg); err != nil {
		t.Fatalf("Build: %v", err)
	}
	html, err := os.ReadFile(filepath.Join(cfg.OutDir, "index.html"))
	if err != nil {
		t.Fatal(err)
	}
	return string(html)
}

func assertContains(t *testing.T, html string, wants ...string) {
	t.Helper()
	for _, want := range wants {
		if !strings.Contains(html, want) {
			t.Errorf("HTML não contém %q", want)
		}
	}
}

func assertNotContains(t *testing.T, html string, unwanted ...string) {
	t.Helper()
	lower := strings.ToLower(html)
	for _, s := range unwanted {
		if strings.Contains(lower, strings.ToLower(s)) {
			t.Errorf("HTML não deveria conter %q", s)
		}
	}
}

func TestBuildRendersPage(t *testing.T) {
	cfg, _ := testConfig(t, fullGitHub(), newStatic(t))
	html := build(t, cfg)

	t.Run("seções e âncoras", func(t *testing.T) {
		assertContains(t, html,
			`<main id="conteudo">`,
			`<section id="inicio" aria-labelledby="hero-title"`,
			`<h1 id="hero-title"`,
			`<nav class="container nav" aria-label="Navegação principal">`,
		)
		for _, id := range []string{"sobre", "projetos", "experiencia", "stack", "contato"} {
			assertContains(t, html,
				`<section id="`+id+`" aria-labelledby="`+id+`-title"`,
				`<h2 id="`+id+`-title" class="prompt">`,
				`href="#`+id+`"`,
			)
		}
	})

	t.Run("link para pular a navegação", func(t *testing.T) {
		assertContains(t, html, `<a href="#conteudo" class="skip-link">Pular para o conteúdo</a>`)
	})

	t.Run("sem JavaScript", func(t *testing.T) {
		assertNotContains(t, html, "<script", "javascript:", " onclick=")
	})

	t.Run("sem frases de procura de emprego", func(t *testing.T) {
		assertNotContains(t, html,
			"aberto a oportunidades", "aberto a novas oportunidades", "busco vaga",
			"buscando oportunidades", "procurando emprego", "disponível para contratação",
			"open to work",
		)
	})

	t.Run("caminho base e meta tags", func(t *testing.T) {
		assertContains(t, html,
			`<link rel="canonical" href="https://exemplo.github.io/portfolio/">`,
			`<meta property="og:url" content="https://exemplo.github.io/portfolio/">`,
			`<link rel="icon" type="image/svg+xml" href="/portfolio/favicon.svg">`,
			`<link rel="stylesheet" href="/portfolio/style.css?v=`,
			`src="/portfolio/avatar-144.jpg" srcset="/portfolio/avatar-144.jpg 1x, /portfolio/avatar-288.jpg 2x"`,
		)
	})

	t.Run("cards com dados do GitHub", func(t *testing.T) {
		assertContains(t, html,
			`<span>equipe de 3</span><span aria-hidden="true"> · </span><span>último push: <time datetime="2026-10-12T18:00:00Z">12 de out. de 2026</time></span>`,
			`<span aria-hidden="true">★ 3</span><span class="sr-only">3 estrelas no GitHub</span>`,
			`<a href="https://exemplo.dev/" rel="noopener">Demo<span class="sr-only"> de Com Dados</span></a>`,
			`<span class="status"><span aria-hidden="true">●</span> em desenvolvimento</span>`,
		)
		if n := strings.Count(html, "★"); n != 1 {
			t.Errorf("★ aparece %d vezes; o card com showStars false não deveria mostrar estrelas", n)
		}
		if n := strings.Count(html, `class="status"`); n != 1 {
			t.Errorf("%d badges de status; só o projeto em desenvolvimento deveria ter", n)
		}
	})

	t.Run("sem CV", func(t *testing.T) {
		assertNotContains(t, html, "cv.pdf", "Baixar CV")
	})

	t.Run("arquivos gerados", func(t *testing.T) {
		for _, name := range []string{"index.html", "style.css", "favicon.svg", "avatar-144.jpg", "avatar-288.jpg"} {
			if !fileExists(filepath.Join(cfg.OutDir, name)) {
				t.Errorf("%s não foi gerado", name)
			}
		}
	})
}

// Sem API do GitHub e sem avatar o build segue: cards só com o JSON e sem foto.
func TestBuildFallbackWithoutGitHub(t *testing.T) {
	cfg, logs := testConfig(t, &fakeGitHub{}, newStatic(t))
	html := build(t, cfg)

	assertContains(t, html,
		`<div class="hero-grid">`,
		`<a href="https://github.com/exemplo/com-dados" rel="noopener">Repositório`,
		`<p class="card-meta"><span>equipe de 3</span></p>`,
	)
	assertNotContains(t, html, "<img", "has-photo", "último push", "★", "Demo")
	if !strings.Contains(logs.String(), "limite de requisições") {
		t.Errorf("o aviso deveria citar o motivo da falha; logs:\n%s", logs)
	}
}

func TestBuildWithCV(t *testing.T) {
	cfg, _ := testConfig(t, fullGitHub(), newStatic(t, "cv.pdf"))
	html := build(t, cfg)
	assertContains(t, html,
		`<a href="/portfolio/cv.pdf" class="btn btn-small" download>cv.pdf</a>`,
		`<a class="btn" href="/portfolio/cv.pdf" download>Baixar CV</a>`,
		`<a href="/portfolio/cv.pdf" download>Baixar CV (PDF)</a>`,
	)
}

func TestBuildInvalidContent(t *testing.T) {
	cfg, _ := testConfig(t, fullGitHub(), newStatic(t))
	cfg.DataDir = t.TempDir()
	if err := Build(context.Background(), cfg); err == nil {
		t.Fatal("Build deveria falhar sem os JSON de conteúdo")
	}
}

// Um build cancelado (Ctrl+C) falha em vez de gerar o site sem os dados do GitHub.
func TestBuildCanceled(t *testing.T) {
	for _, when := range []string{"antes", "durante"} {
		t.Run(when, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			gh := &cancelingGitHub{fakeGitHub: fullGitHub()}
			if when == "antes" {
				cancel()
			} else {
				gh.cancel = cancel
			}
			cfg, _ := testConfig(t, gh, newStatic(t))
			err := Build(ctx, cfg)
			if !errors.Is(err, context.Canceled) {
				t.Fatalf("Build err = %v, want context.Canceled", err)
			}
			if fileExists(filepath.Join(cfg.OutDir, "index.html")) {
				t.Error("index.html não deveria ser gravado num build cancelado")
			}
		})
	}
}

// cancelingGitHub cancela o build na primeira busca de repositório.
type cancelingGitHub struct {
	*fakeGitHub
	cancel context.CancelFunc
}

func (g *cancelingGitHub) Repo(ctx context.Context, name string) (github.Repo, error) {
	if g.cancel != nil {
		g.cancel()
	}
	if err := ctx.Err(); err != nil {
		return github.Repo{}, err
	}
	return g.fakeGitHub.Repo(ctx, name)
}

func TestResolvePhoto(t *testing.T) {
	tests := []struct {
		name      string
		static    []string
		avatars   map[int]github.Image
		userID    int64
		want      *Photo
		wantCalls int32
	}{
		{
			name:    "foto local vence o avatar",
			static:  []string{"foto.png"},
			avatars: map[int]github.Image{144: jpeg1x, 288: jpeg2x},
			userID:  1,
			want:    &Photo{Src: "/b/foto.png"},
		},
		{
			name:      "avatar em 1x e 2x",
			avatars:   map[int]github.Image{144: jpeg1x, 288: jpeg2x},
			userID:    1,
			want:      &Photo{Src: "/b/avatar-144.jpg", Srcset: "/b/avatar-144.jpg 1x, /b/avatar-288.jpg 2x"},
			wantCalls: 2,
		},
		{
			name:      "avatar 2x falha: só 1x",
			avatars:   map[int]github.Image{144: jpeg1x},
			userID:    1,
			want:      &Photo{Src: "/b/avatar-144.jpg"},
			wantCalls: 2,
		},
		{
			name:      "avatar falha: sem foto",
			userID:    1,
			wantCalls: 1,
		},
		{
			name:    "avatar desligado",
			avatars: map[int]github.Image{144: jpeg1x},
			userID:  0,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gh := &fakeGitHub{avatars: tt.avatars}
			cfg, _ := testConfig(t, gh, newStatic(t, tt.static...))
			cfg.AvatarUserID = tt.userID
			if err := os.MkdirAll(cfg.OutDir, 0o755); err != nil {
				t.Fatal(err)
			}

			got := resolvePhoto(context.Background(), cfg, NewPaths("/b"))
			switch {
			case tt.want == nil && got != nil:
				t.Errorf("resolvePhoto = %+v, want nil", *got)
			case tt.want != nil && (got == nil || *got != *tt.want):
				t.Errorf("resolvePhoto = %+v, want %+v", got, *tt.want)
			}
			if calls := gh.avatarCalls.Load(); calls != tt.wantCalls {
				t.Errorf("Avatar chamado %d vezes, want %d", calls, tt.wantCalls)
			}
		})
	}
}

func TestNewCard(t *testing.T) {
	hide := false
	p := content.Project{Slug: "x", Repo: "dono/x", Title: "X", Meta: []string{"solo"}, ShowStars: &hide}

	card := NewCard(p, nil)
	if card.RepoURL != "https://github.com/dono/x" || len(card.MetaItems) != 1 {
		t.Errorf("sem dados: %+v", card)
	}

	pushed := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	card = NewCard(p, &github.Repo{PushedAt: pushed, Stars: 9, HTMLURL: "https://github.com/Dono/X"})
	if card.RepoURL != "https://github.com/Dono/X" {
		t.Errorf("RepoURL = %q", card.RepoURL)
	}
	if len(card.MetaItems) != 2 || card.MetaItems[0].Kind != MetaText ||
		card.MetaItems[1].Kind != MetaPushed || !card.MetaItems[1].PushedAt.Equal(pushed) {
		t.Errorf("MetaItems = %+v; estrelas escondidas não deveriam entrar", card.MetaItems)
	}

	p.ShowStars = nil
	card = NewCard(p, &github.Repo{Stars: 9})
	if len(card.MetaItems) != 2 || card.MetaItems[1] != (MetaItem{Kind: MetaStars, Stars: 9}) {
		t.Errorf("MetaItems = %+v; sem push, só as estrelas deveriam entrar", card.MetaItems)
	}
}

func TestPaths(t *testing.T) {
	tests := []struct{ base, path, want string }{
		{"/igorhsalgado-resume", "favicon.svg", "/igorhsalgado-resume/favicon.svg"},
		{"igorhsalgado-resume/", "/style.css", "/igorhsalgado-resume/style.css"},
		{"/igorhsalgado-resume", "", "/igorhsalgado-resume/"},
		{"", "favicon.svg", "/favicon.svg"},
		{"/", "", "/"},
	}
	for _, tt := range tests {
		if got := NewPaths(tt.base).URL(tt.path); got != tt.want {
			t.Errorf("NewPaths(%q).URL(%q) = %q, want %q", tt.base, tt.path, got, tt.want)
		}
	}
}

func TestFormatDate(t *testing.T) {
	tests := []struct {
		in   time.Time
		want string
	}{
		{time.Date(2026, 10, 12, 18, 0, 0, 0, time.UTC), "12 de out. de 2026"},
		// 02:00 UTC ainda é o dia anterior em São Paulo (UTC-3).
		{time.Date(2026, 10, 12, 2, 0, 0, 0, time.UTC), "11 de out. de 2026"},
		{time.Date(2026, 5, 5, 12, 0, 0, 0, time.UTC), "5 de mai. de 2026"},
		{time.Date(2027, 1, 1, 2, 59, 0, 0, time.UTC), "31 de dez. de 2026"},
	}
	for _, tt := range tests {
		if got := FormatDate(tt.in); got != tt.want {
			t.Errorf("FormatDate(%s) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestCheckOutDir(t *testing.T) {
	cfg := Config{DataDir: "data", StaticDir: "static"}
	refused := []string{".", "..", "/", "", "static", "static/", "./static", "static/dist", "data", "data/x"}
	for _, out := range refused {
		cfg.OutDir = out
		if err := checkOutDir(cfg); err == nil {
			t.Errorf("checkOutDir(%q) deveria recusar", out)
		}
	}
	for _, out := range []string{"dist", "../dist", "staticx", t.TempDir()} {
		cfg.OutDir = out
		if err := checkOutDir(cfg); err != nil {
			t.Errorf("checkOutDir(%q): %v", out, err)
		}
	}
}

// Um -out que aponta para static/ falha antes de apagar qualquer coisa.
func TestBuildRefusesOutDirOverStatic(t *testing.T) {
	for _, sub := range []string{"", "dist"} {
		static := newStatic(t, "foto.jpg")
		cfg, _ := testConfig(t, fullGitHub(), static)
		cfg.OutDir = filepath.Join(static, sub)
		if err := Build(context.Background(), cfg); err == nil {
			t.Errorf("Build com OutDir %q deveria falhar", cfg.OutDir)
		}
		if !fileExists(filepath.Join(static, "foto.jpg")) {
			t.Errorf("OutDir %q: foto.jpg foi apagada", cfg.OutDir)
		}
	}
}
