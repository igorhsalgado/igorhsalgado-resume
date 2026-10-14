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
	Avatar(ctx context.Context, userID int64, size int) (github.Image, error)
}

// Config descreve um build.
type Config struct {
	DataDir   string // profile.json e projects.json
	StaticDir string // copiado como está para OutDir
	OutDir    string // apagado e recriado a cada build

	SiteURL  string // origem do site, ex.: https://igorhsalgado.github.io
	BasePath string // caminho base, ex.: /igorhsalgado-resume

	// GitHub fornece os dados dos cards e o avatar. Nil desliga os dois.
	GitHub GitHub
	// AvatarUserID é o ID numérico do usuário cujo avatar vira a foto do topo
	// (0 desliga). Uma foto em StaticDir sempre vence o avatar.
	AvatarUserID int64

	Logger *slog.Logger
	Now    time.Time
}

// Build gera o site em cfg.OutDir. Falhas da API do GitHub não interrompem
// o build: viram avisos no log e a página sai sem os dados automáticos.
func Build(ctx context.Context, cfg Config) error {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	if cfg.Now.IsZero() {
		cfg.Now = time.Now()
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
		Year:        cfg.Now.Year(),
	}
	if fileExists(filepath.Join(cfg.StaticDir, "cv.pdf")) {
		page.CVURL = paths.URL("cv.pdf")
	}

	// Repositórios e avatar são buscados em paralelo.
	repos := make([]*github.Repo, len(c.Projects))
	var wg sync.WaitGroup
	if cfg.GitHub != nil {
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

	for i, p := range c.Projects {
		page.Projects = append(page.Projects, NewCard(p, repos[i]))
	}

	var html bytes.Buffer
	if err := Render(&html, page); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(cfg.OutDir, "index.html"), html.Bytes(), 0o644)
}

// resetDir apaga e recria dir. Recusa o diretório atual e os que estão acima
// dele, para um -out errado não apagar o projeto.
func resetDir(dir string) error {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return err
	}
	wd, err := os.Getwd()
	if err != nil {
		return err
	}
	if rel, err := filepath.Rel(abs, wd); err == nil && !escapes(rel) {
		return fmt.Errorf("diretório de saída %q contém o diretório atual; use um subdiretório como dist", dir)
	}
	if err := os.RemoveAll(abs); err != nil {
		return err
	}
	return os.MkdirAll(abs, 0o755)
}

// escapes informa se o caminho relativo rel sai do diretório de referência.
func escapes(rel string) bool {
	return rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}

func shortHash(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:5])
}
