// Package validate reúne as regras de formato usadas tanto na leitura do
// conteúdo (internal/content) quanto nas respostas da API (internal/github).
// Não importa nenhum outro pacote do projeto.
package validate

import (
	"net/url"
	"regexp"
	"strings"
)

var repoNamePattern = regexp.MustCompile(`^[\w.-]+/[\w.-]+$`)

// RepoName informa se name está no formato "dono/nome". "." e ".." são
// recusados para o nome não escapar do caminho /repos/ da API.
func RepoName(name string) bool {
	if !repoNamePattern.MatchString(name) {
		return false
	}
	owner, repo, _ := strings.Cut(name, "/")
	return strings.Trim(owner, ".") != "" && strings.Trim(repo, ".") != ""
}

// HTTPURL tira os espaços das pontas de raw e informa se o resultado é uma
// URL absoluta http ou https. Devolve a URL normalizada, ou "" e false.
// Protege os links da página contra javascript:, data: e afins.
func HTTPURL(raw string) (string, bool) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", false
	}
	return u.String(), true
}
