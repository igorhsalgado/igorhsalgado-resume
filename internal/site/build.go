// Package site monta o site estático: lê o conteúdo, busca os dados do
// GitHub, copia os arquivos estáticos e renderiza index.html.
package site

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/igorhsalgado/igorhsalgado-resume/internal/content"
	"github.com/igorhsalgado/igorhsalgado-resume/internal/github"
)

// GitHub é o que o build usa da API do GitHub. *github.Client implementa.
type GitHub interface {
	Repo(ctx context.Context, name string) (github.Repo, error)
	CodeStats(ctx context.Context, login string, extra []string) (github.CodeStats, error)
	Avatar(ctx context.Context, userID int64, size int) (github.Image, error)
}

// Config descreve um build.
type Config struct {
	DataDir   string // profile.json e projects.json
	StaticDir string // copiado como está para OutDir
	OutDir    string // apagado e recriado a cada build

	SiteURL  string // origem do site, ex.: https://igorhsalgado.github.io
	BasePath string // caminho base, ex.: /igorhsalgado-resume

	// GitHub fornece os dados dos cards, a seção "GitHub" e o avatar.
	// Nil desliga os três.
	GitHub GitHub
	// AvatarUserID é o ID numérico do usuário cujo avatar vira a foto do topo
	// (0 desliga). Uma foto em StaticDir sempre vence o avatar.
	AvatarUserID int64

	Logger *slog.Logger
	Now    time.Time
}

// Build gera o site em cfg.OutDir. Falhas da API do GitHub não interrompem
// o build: viram avisos no log e a página sai sem os dados automáticos (os
// cards ficam só com o JSON e a seção "GitHub" some).
// Já um ctx cancelado (Ctrl+C) interrompe: Build devolve ctx.Err() e não
// grava index.html.
func Build(ctx context.Context, cfg Config) error {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	if cfg.Now.IsZero() {
		cfg.Now = time.Now()
	}

	if err := checkOutDir(cfg); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("build interrompido: %w", err)
	}
	c, err := content.Load(cfg.DataDir)
	if err != nil {
		return err
	}
	if err := resetDir(cfg.OutDir); err != nil {
		return err
	}
	if err := os.CopyFS(cfg.OutDir, os.DirFS(cfg.StaticDir)); err != nil {
		return fmt.Errorf("copiando %s: %w", cfg.StaticDir, err)
	}

	paths := NewPaths(cfg.BasePath)
	style, err := os.ReadFile(filepath.Join(cfg.StaticDir, "style.css"))
	if err != nil {
		return err
	}

	page := &Page{
		Title:       c.Profile.Name + " · Desenvolvedor Backend",
		Description: fmt.Sprintf("%s, desenvolvedor backend em %s. %s", c.Profile.Name, c.Profile.Location, c.Profile.Pitch),
		Canonical:   strings.TrimRight(cfg.SiteURL, "/") + paths.URL(""),
		StyleURL:    paths.URL("style.css") + "?v=" + shortHash(style),
		FaviconURL:  paths.URL("favicon.svg"),
		Profile:     c.Profile,
		Facts:       newFacts(c.Profile),
		Year:        cfg.Now.Year(),
	}
	if fileExists(filepath.Join(cfg.StaticDir, "cv.pdf")) {
		page.CVURL = paths.URL("cv.pdf")
	}

	// Repositórios, linguagens e avatar são buscados em paralelo.
	repos := make([]*github.Repo, len(c.Projects))
	var wg sync.WaitGroup
	if cfg.GitHub != nil {
		wg.Go(func() {
			page.Code = codeSummary(ctx, cfg, c)
		})
		for i, p := range c.Projects {
			wg.Go(func() {
				repo, err := cfg.GitHub.Repo(ctx, p.Repo)
				if err != nil {
					cfg.Logger.Warn("dados do GitHub indisponíveis; card sai sem eles", "repo", p.Repo, "err", err)
					return
				}
				repos[i] = &repo
			})
		}
	}
	wg.Go(func() {
		page.Photo = resolvePhoto(ctx, cfg, paths)
	})
	wg.Wait()
	// Com ctx cancelado as buscas falham como se o GitHub estivesse fora do
	// ar; gravar a página assim deixaria um site incompleto com sucesso.
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("build interrompido: %w", err)
	}

	for i, p := range c.Projects {
		page.Projects = append(page.Projects, NewCard(p, repos[i]))
	}

	// Renderiza em memória para não deixar index.html pela metade.
	var html bytes.Buffer
	if err := Render(&html, page); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(cfg.OutDir, "index.html"), html.Bytes(), 0o644)
}

// codeSummary busca as linguagens do código público do dono do perfil
// (login tirado de contact.github) somadas às dos repositórios dos projetos.
// Devolve nil, com um aviso, se a API falhar: a seção sai da página.
func codeSummary(ctx context.Context, cfg Config, c *content.Content) *CodeSummary {
	profileURL := c.Profile.Contact.GitHub
	login, ok := githubLogin(profileURL)
	if !ok {
		cfg.Logger.Warn("contact.github não é um perfil do GitHub; seção GitHub sai da página", "url", profileURL)
		return nil
	}
	extra := make([]string, len(c.Projects))
	for i, p := range c.Projects {
		extra[i] = p.Repo
	}
	stats, err := cfg.GitHub.CodeStats(ctx, login, extra)
	if err != nil {
		cfg.Logger.Warn("linguagens do GitHub indisponíveis; seção GitHub sai da página", "err", err)
		return nil
	}
	return newCodeSummary(login, profileURL, stats)
}

// checkOutDir recusa um OutDir que se sobreponha ao diretório atual, a
// StaticDir ou a DataDir: como OutDir é apagado a cada build, um -out errado
// (".", "static", "data/x"...) apagaria o projeto ou o próprio conteúdo.
// OutDir pode ficar dentro do diretório atual (dist), mas não o contrário.
func checkOutDir(cfg Config) error {
	wd, err := os.Getwd()
	if err != nil {
		return err
	}
	if within(wd, cfg.OutDir) {
		return fmt.Errorf("diretório de saída %q contém o diretório atual; use um subdiretório como dist", cfg.OutDir)
	}
	for _, dir := range []string{cfg.StaticDir, cfg.DataDir} {
		if within(cfg.OutDir, dir) || within(dir, cfg.OutDir) {
			return fmt.Errorf("diretório de saída %q se sobrepõe a %q; use um diretório separado como dist", cfg.OutDir, dir)
		}
	}
	return nil
}

// within informa se o caminho a é igual a b ou fica dentro de b.
func within(a, b string) bool {
	absA, err := filepath.Abs(a)
	if err != nil {
		return false
	}
	absB, err := filepath.Abs(b)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(absB, absA)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// resetDir apaga e recria dir. Quem chama já conferiu dir com checkOutDir.
func resetDir(dir string) error {
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	return os.MkdirAll(dir, 0o755)
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}

func shortHash(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:5])
}
