// Command site gera o portfólio estático em um diretório (dist/ por padrão)
// e, opcionalmente, serve o resultado para pré-visualização local.
//
//	go run ./cmd/site                # build em dist/
//	go run ./cmd/site -serve :8080   # build e servidor local
//
// GITHUB_TOKEN, se definido, é usado nas chamadas à API do GitHub.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/igorhsalgado/igorhsalgado-resume/internal/github"
	"github.com/igorhsalgado/igorhsalgado-resume/internal/site"
)

// githubUserID é o ID numérico de @igorhsalgado; o avatar dele é a foto do topo.
const githubUserID = 145609906

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	slog.SetDefault(logger)
	if err := run(); err != nil {
		logger.Error(err.Error())
		os.Exit(1)
	}
}

func run() error {
	out := flag.String("out", "dist", "diretório de saída (apagado e recriado a cada build)")
	base := flag.String("base", "/igorhsalgado-resume", "caminho base onde o site é publicado")
	siteURL := flag.String("site", "https://igorhsalgado.github.io", "origem do site, usada no canonical e no og:url")
	serve := flag.String("serve", "", "depois do build, serve o site neste endereço (ex.: :8080)")
	flag.Parse()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	start := time.Now()
	err := site.Build(ctx, site.Config{
		DataDir:      "data",
		StaticDir:    "static",
		OutDir:       *out,
		SiteURL:      *siteURL,
		BasePath:     *base,
		GitHub:       github.NewClient(os.Getenv("GITHUB_TOKEN")),
		AvatarUserID: githubUserID,
	})
	if err != nil {
		return err
	}
	slog.Info("site gerado", "dir", *out, "tempo", time.Since(start).Round(time.Millisecond))

	if *serve == "" {
		return nil
	}
	return serveDir(ctx, *serve, *out, site.NewPaths(*base))
}

// serveDir serve dir sob o caminho base, como no GitHub Pages, até ctx ser cancelado.
func serveDir(ctx context.Context, addr, dir string, paths site.Paths) error {
	mux := http.NewServeMux()
	files := http.FileServer(http.Dir(dir))
	if paths.Base() == "" {
		mux.Handle("/", files)
	} else {
		mux.Handle(paths.URL(""), http.StripPrefix(paths.Base(), files))
		mux.Handle("/{$}", http.RedirectHandler(paths.URL(""), http.StatusFound))
	}

	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	errc := make(chan error, 1)
	go func() { errc <- srv.ListenAndServe() }()
	slog.Info("servindo o site", "url", fmt.Sprintf("http://%s%s", displayHost(addr), paths.URL("")))

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}

// displayHost transforma ":8080" em "localhost:8080" para o link do log.
func displayHost(addr string) string {
	if len(addr) > 0 && addr[0] == ':' {
		return "localhost" + addr
	}
	return addr
}
