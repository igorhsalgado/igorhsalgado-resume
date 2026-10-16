package github

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"sync"

	"github.com/igorhsalgado/igorhsalgado-resume/internal/validate"
)

const (
	// perPage é o tamanho de página máximo da API ao listar repositórios.
	perPage = 100
	// maxRepoPages limita a paginação (até 1000 repositórios).
	maxRepoPages = 10
	// languageWorkers é quantas consultas de linguagens rodam ao mesmo tempo.
	languageWorkers = 4
	// maxLanguageName descarta nomes de linguagem absurdos na resposta.
	maxLanguageName = 64
)

// ErrInvalidLogin é devolvido quando o usuário não é um login válido do GitHub.
var ErrInvalidLogin = errors.New("login do GitHub inválido")

// CodeStats resume o código público de um usuário.
type CodeStats struct {
	// PublicRepos é o total de repositórios públicos do usuário (com forks).
	PublicRepos int
	// Repos é quantos repositórios entraram na soma de Languages: os
	// públicos do usuário, sem forks, mais os extras pedidos.
	Repos int
	// Languages soma os bytes de cada linguagem, como o GitHub conta.
	Languages map[string]int64
}

// CodeStats busca quantos repositórios públicos login tem e soma os bytes
// por linguagem dos repositórios públicos dele que não são fork, mais os
// repositórios em extra ("dono/nome"; repetidos contam uma vez só).
//
// É tudo ou nada: se qualquer consulta falhar, devolve erro, para a página
// nunca mostrar uma soma parcial como se fosse completa.
func (c *Client) CodeStats(ctx context.Context, login string, extra []string) (CodeStats, error) {
	if !validate.GitHubLogin(login) {
		return CodeStats{}, fmt.Errorf("%w: %q", ErrInvalidLogin, login)
	}
	userPath := "/users/" + url.PathEscape(login)

	var user struct {
		PublicRepos int `json:"public_repos"`
	}
	if err := c.getJSON(ctx, userPath, nil, &user); err != nil {
		return CodeStats{}, fmt.Errorf("usuário %s: %w", login, err)
	}

	owned, err := c.ownedRepos(ctx, userPath)
	if err != nil {
		return CodeStats{}, fmt.Errorf("repositórios de %s: %w", login, err)
	}

	names := uniqueRepos(append(owned, extra...))
	langs, err := c.sumLanguages(ctx, names)
	if err != nil {
		return CodeStats{}, err
	}
	return CodeStats{
		PublicRepos: max(user.PublicRepos, 0),
		Repos:       len(names),
		Languages:   langs,
	}, nil
}

// ownedRepos lista os repositórios públicos do usuário que não são fork.
func (c *Client) ownedRepos(ctx context.Context, userPath string) ([]string, error) {
	var names []string
	for page := 1; page <= maxRepoPages; page++ {
		query := url.Values{
			"type":     {"owner"},
			"per_page": {strconv.Itoa(perPage)},
			"page":     {strconv.Itoa(page)},
		}
		var repos []struct {
			FullName string `json:"full_name"`
			Fork     bool   `json:"fork"`
			Private  bool   `json:"private"`
		}
		if err := c.getJSON(ctx, userPath+"/repos", query, &repos); err != nil {
			return nil, err
		}
		for _, r := range repos {
			// Com token, a API pode listar privados; eles nunca entram.
			if !r.Fork && !r.Private {
				names = append(names, r.FullName)
			}
		}
		if len(repos) < perPage {
			return names, nil
		}
	}
	return names, nil
}

// uniqueRepos tira os repetidos (sem diferenciar maiúsculas) e os nomes
// fora do formato dono/nome, mantendo a ordem.
func uniqueRepos(names []string) []string {
	seen := make(map[string]bool, len(names))
	var out []string
	for _, name := range names {
		key := strings.ToLower(name)
		if seen[key] || !validate.RepoName(name) {
			continue
		}
		seen[key] = true
		out = append(out, name)
	}
	return out
}

// sumLanguages consulta as linguagens de cada repositório em paralelo e
// soma os bytes. Para no primeiro erro.
func (c *Client) sumLanguages(ctx context.Context, names []string) (map[string]int64, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var (
		mu       sync.Mutex
		total    = make(map[string]int64)
		firstErr error
		wg       sync.WaitGroup
		jobs     = make(chan string)
	)
	for range min(languageWorkers, len(names)) {
		wg.Go(func() {
			for name := range jobs {
				langs, err := c.Languages(ctx, name)
				mu.Lock()
				if err != nil {
					if firstErr == nil {
						firstErr = fmt.Errorf("linguagens de %s: %w", name, err)
						cancel()
					}
				} else {
					for lang, n := range langs {
						total[lang] += n
					}
				}
				mu.Unlock()
			}
		})
	}
	for _, name := range names {
		jobs <- name
	}
	close(jobs)
	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	return total, nil
}

// Languages devolve os bytes por linguagem de um repositório ("dono/nome").
// Nomes vazios ou longos demais e contagens não positivas são descartados.
func (c *Client) Languages(ctx context.Context, name string) (map[string]int64, error) {
	path, err := repoPath(name)
	if err != nil {
		return nil, err
	}
	var body map[string]int64
	if err := c.getJSON(ctx, path+"/languages", nil, &body); err != nil {
		return nil, err
	}
	langs := make(map[string]int64, len(body))
	for lang, n := range body {
		lang = strings.TrimSpace(lang)
		if lang == "" || len(lang) > maxLanguageName || n <= 0 {
			continue
		}
		langs[lang] += n
	}
	return langs, nil
}
