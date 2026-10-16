package site

import (
	"cmp"
	"fmt"
	"net/url"
	"slices"
	"strings"

	"github.com/igorhsalgado/igorhsalgado-resume/internal/content"
	"github.com/igorhsalgado/igorhsalgado-resume/internal/github"
	"github.com/igorhsalgado/igorhsalgado-resume/internal/validate"
)

// Fact é um dos quadros de resumo abaixo do "Sobre".
type Fact struct {
	Label  string
	Value  string
	Detail string // opcional, em tom secundário
}

// newFacts monta os quadros de resumo só com o que já está no perfil.
// Quadros sem dado não aparecem.
func newFacts(p content.Profile) []Fact {
	var facts []Fact
	// "Atualmente" só vale para o emprego em curso (período terminado em "atual").
	if len(p.Experience) > 0 && isCurrent(p.Experience[0].Period) {
		job := p.Experience[0]
		facts = append(facts, Fact{Label: "Atualmente", Value: job.Role, Detail: job.Company + " · " + job.Period})
	}
	if len(p.Education) > 0 {
		edu := p.Education[0]
		detail := edu.Institution
		if edu.Detail != "" {
			detail += " · " + edu.Detail
		}
		facts = append(facts, Fact{Label: "Formação", Value: edu.Course, Detail: detail})
	}
	if p.Focus != "" {
		facts = append(facts, Fact{Label: "Foco", Value: p.Focus})
	}
	if p.Location != "" {
		facts = append(facts, Fact{Label: "Local", Value: p.Location})
	}
	return facts
}

func isCurrent(period string) bool {
	return strings.HasSuffix(strings.ToLower(strings.TrimSpace(period)), "atual")
}

// topLanguages é quantas linguagens aparecem pelo nome; o resto vira "Outras".
const topLanguages = 5

// CodeSummary é a seção "GitHub": linguagens do código público, já em
// porcentagem, prontas para a barra e a legenda.
type CodeSummary struct {
	Login       string
	ProfileURL  string
	PublicRepos int
	Repos       int // repositórios somados nas linguagens
	Languages   []LanguageShare
}

// LanguageShare é um trecho da barra de linguagens.
type LanguageShare struct {
	Name   string
	Tenths int    // porcentagem em décimos (413 = 41,3%)
	Shade  string // classe de tom de cinza: "1" a "5", ou "other"
}

// Width é a largura do trecho na barra, em CSS ("41.3%").
func (l LanguageShare) Width() string {
	return fmt.Sprintf("%d.%d%%", l.Tenths/10, l.Tenths%10)
}

// Percent é a porcentagem como aparece na legenda ("41,3%").
func (l LanguageShare) Percent() string {
	return fmt.Sprintf("%d,%d%%", l.Tenths/10, l.Tenths%10)
}

// newCodeSummary transforma os bytes por linguagem em porcentagens: as
// topLanguages maiores pelo nome e o resto somado em "Outras". Devolve nil
// sem nenhum byte, para a seção não sair vazia.
func newCodeSummary(login, profileURL string, stats github.CodeStats) *CodeSummary {
	type lang struct {
		name  string
		bytes int64
	}
	var langs []lang
	var total int64
	for name, n := range stats.Languages {
		if n > 0 {
			langs = append(langs, lang{name, n})
			total += n
		}
	}
	if total == 0 {
		return nil
	}
	// Maior primeiro; empate em ordem alfabética, para o build ser estável.
	slices.SortFunc(langs, func(a, b lang) int {
		return cmp.Or(cmp.Compare(b.bytes, a.bytes), strings.Compare(a.name, b.name))
	})
	if len(langs) > topLanguages+1 {
		var rest int64
		for _, l := range langs[topLanguages:] {
			rest += l.bytes
		}
		langs = append(langs[:topLanguages:topLanguages], lang{"Outras", rest})
	}

	bytes := make([]int64, len(langs))
	for i, l := range langs {
		bytes[i] = l.bytes
	}
	tenths := largestRemainder(bytes, total, 1000)

	summary := &CodeSummary{Login: login, ProfileURL: profileURL, PublicRepos: stats.PublicRepos, Repos: stats.Repos}
	for i, l := range langs {
		share := LanguageShare{Name: l.name, Tenths: tenths[i], Shade: fmt.Sprint(i + 1)}
		if len(langs) > topLanguages && i == topLanguages {
			share.Shade = "other"
		}
		summary.Languages = append(summary.Languages, share)
	}
	return summary
}

// largestRemainder reparte scale entre os valores, proporcional a cada um,
// em inteiros que somam exatamente scale (as porcentagens fecham em 100,0%).
func largestRemainder(values []int64, total int64, scale int) []int {
	out := make([]int, len(values))
	rems := make([]int64, len(values))
	assigned := 0
	for i, v := range values {
		q := v * int64(scale)
		out[i] = int(q / total)
		rems[i] = q % total
		assigned += out[i]
	}
	order := make([]int, len(values))
	for i := range order {
		order[i] = i
	}
	slices.SortStableFunc(order, func(a, b int) int { return cmp.Compare(rems[b], rems[a]) })
	for _, i := range order[:scale-assigned] {
		out[i]++
	}
	return out
}

// githubLogin extrai o login de uma URL de perfil (https://github.com/login).
func githubLogin(profileURL string) (string, bool) {
	u, err := url.Parse(profileURL)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return "", false
	}
	if host := strings.ToLower(u.Host); host != "github.com" && host != "www.github.com" {
		return "", false
	}
	login := strings.Trim(u.Path, "/")
	if !validate.GitHubLogin(login) {
		return "", false
	}
	return login, true
}
