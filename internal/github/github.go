// Package github busca, durante o build, os dados públicos que o site mostra:
// metadados de repositórios (último push, estrelas, links) e o avatar do
// usuário. O navegador do visitante nunca fala com a API.
//
// Os métodos devolvem erro em qualquer falha (rede, timeout, HTTP de erro,
// JSON inesperado). Quem chama decide o fallback; o build registra um aviso e
// segue sem os dados.
package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const (
	// DefaultAPIURL é a raiz da API REST do GitHub.
	DefaultAPIURL = "https://api.github.com"
	// DefaultAvatarURL é o host que serve os avatares (redimensionados no servidor).
	DefaultAvatarURL = "https://avatars.githubusercontent.com"
	// DefaultTimeout limita cada requisição.
	DefaultTimeout = 8 * time.Second

	userAgent    = "igorhsalgado-resume-build"
	maxJSONBytes = 1 << 20
)

// Client fala com a API do GitHub. O valor zero não é utilizável; use NewClient.
type Client struct {
	APIURL    string
	AvatarURL string
	// Token é opcional; com ele o limite de requisições da API é maior.
	Token   string
	Timeout time.Duration
	HTTP    *http.Client
}

// NewClient devolve um cliente com os endereços e o timeout padrão.
func NewClient(token string) *Client {
	return &Client{
		APIURL:    DefaultAPIURL,
		AvatarURL: DefaultAvatarURL,
		Token:     token,
		Timeout:   DefaultTimeout,
		HTTP:      http.DefaultClient,
	}
}

// Repo são os campos de um repositório usados nos cards de projeto.
// Campos ausentes ou inválidos na resposta ficam com o valor zero.
type Repo struct {
	PushedAt time.Time
	Stars    int
	HTMLURL  string
	Homepage string
}

// StatusError é uma resposta HTTP fora da faixa 2xx.
type StatusError struct {
	StatusCode int
	// RateLimited indica que o limite de requisições da API acabou.
	RateLimited bool
}

func (e *StatusError) Error() string {
	if e.RateLimited {
		return fmt.Sprintf("HTTP %d (limite de requisições da API atingido)", e.StatusCode)
	}
	return fmt.Sprintf("HTTP %d", e.StatusCode)
}

// ErrInvalidRepo é devolvido quando o nome do repositório não é "dono/nome".
var ErrInvalidRepo = errors.New("nome de repositório inválido")

var repoNamePattern = regexp.MustCompile(`^[\w.-]+/[\w.-]+$`)

// ValidRepoName informa se name está no formato "dono/nome". "." e ".." são
// recusados para o nome não escapar do caminho /repos/ da API.
func ValidRepoName(name string) bool {
	if !repoNamePattern.MatchString(name) {
		return false
	}
	owner, repo, _ := strings.Cut(name, "/")
	return strings.Trim(owner, ".") != "" && strings.Trim(repo, ".") != ""
}

// Repo busca os metadados públicos de um repositório ("dono/nome").
func (c *Client) Repo(ctx context.Context, name string) (Repo, error) {
	if !ValidRepoName(name) {
		return Repo{}, fmt.Errorf("%w: %q", ErrInvalidRepo, name)
	}

	ctx, cancel := context.WithTimeout(ctx, c.Timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.APIURL+"/repos/"+name, nil)
	if err != nil {
		return Repo{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", userAgent)
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return Repo{}, err
	}
	defer resp.Body.Close()
	if err := checkStatus(resp); err != nil {
		return Repo{}, err
	}

	var body struct {
		PushedAt        string `json:"pushed_at"`
		StargazersCount int    `json:"stargazers_count"`
		HTMLURL         string `json:"html_url"`
		Homepage        string `json:"homepage"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxJSONBytes)).Decode(&body); err != nil {
		return Repo{}, fmt.Errorf("resposta inválida: %w", err)
	}

	repo := Repo{
		Stars:    max(body.StargazersCount, 0),
		HTMLURL:  HTTPURL(body.HTMLURL),
		Homepage: HTTPURL(body.Homepage),
	}
	if t, err := time.Parse(time.RFC3339, body.PushedAt); err == nil {
		repo.PushedAt = t
	}
	return repo, nil
}

func checkStatus(resp *http.Response) error {
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	limited := (resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests) &&
		resp.Header.Get("X-RateLimit-Remaining") == "0"
	return &StatusError{StatusCode: resp.StatusCode, RateLimited: limited}
}

// HTTPURL devolve raw se for uma URL absoluta http ou https, e "" caso
// contrário. Protege os links do card contra javascript:, data: e afins.
func HTTPURL(raw string) string {
	raw = strings.TrimSpace(raw)
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return ""
	}
	return u.String()
}
