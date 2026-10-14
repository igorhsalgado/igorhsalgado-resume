package site

import (
	"bytes"
	"embed"
	"fmt"
	"html/template"
	"io"
	"time"
	_ "time/tzdata" // fuso de São Paulo disponível mesmo sem tzdata no sistema
)

//go:embed templates/*.html
var templateFS embed.FS

var templates = template.Must(
	template.New("site").Funcs(template.FuncMap{
		"heading":    newHeading,
		"formatDate": FormatDate,
		"isoDate":    func(t time.Time) string { return t.UTC().Format(time.RFC3339) },
	}).ParseFS(templateFS, "templates/*.html"),
)

// Render escreve a página completa em w.
func Render(w io.Writer, p *Page) error {
	// Renderiza em memória primeiro para não deixar HTML pela metade em w.
	var buf bytes.Buffer
	if err := templates.ExecuteTemplate(&buf, "layout", p); err != nil {
		return fmt.Errorf("renderizando a página: %w", err)
	}
	_, err := buf.WriteTo(w)
	return err
}

// heading são os dados do cabeçalho de seção (templates/sections.html).
type heading struct {
	ID      string // id do <h2>, referenciado pelo aria-labelledby da seção
	Command string // comando exibido no prompt
	Title   string // título lido pelos leitores de tela
}

func newHeading(id, command, title string) heading {
	return heading{ID: id, Command: command, Title: title}
}

var (
	saoPaulo = mustLoadLocation("America/Sao_Paulo")
	months   = [...]string{"jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."}
)

func mustLoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return loc
}

// FormatDate escreve t como "12 de out. de 2026", no horário de São Paulo.
func FormatDate(t time.Time) string {
	t = t.In(saoPaulo)
	return fmt.Sprintf("%d de %s de %d", t.Day(), months[t.Month()-1], t.Year())
}
