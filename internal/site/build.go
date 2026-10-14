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

	if err := checkOutDir(cfg); err != nil {
		return err
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
