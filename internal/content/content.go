// Package content lê e valida o conteúdo do site (data/profile.json e
// data/projects.json). Toda a cópia vive nesses arquivos: para mudar um texto,
// edite o JSON, não o código.
package content

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/igorhsalgado/igorhsalgado-resume/internal/github"
)

// Profile reúne os dados pessoais e de carreira exibidos na página.
type Profile struct {
	Name       string       `json:"name"`
	Handle     string       `json:"handle"`
	Headline   string       `json:"headline"`
	Pitch      string       `json:"pitch"`
	Location   string       `json:"location"`
	About      string       `json:"about"`
	Experience []Experience `json:"experience"`
	Education  []Education  `json:"education"`
	Stack      []StackGroup `json:"stack"`
	Contact    Contact      `json:"contact"`
}

// Experience é um emprego ou estágio.
type Experience struct {
	Role       string   `json:"role"`
	Company    string   `json:"company"`
	Period     string   `json:"period"`
	Highlights []string `json:"highlights"`
}

// Education é um curso da seção "Formação".
type Education struct {
	Course      string `json:"course"`
	Institution string `json:"institution"`
	Detail      string `json:"detail,omitempty"`
}

// StackGroup é uma linha da seção "Stack".
type StackGroup struct {
	Label string   `json:"label"`
	Items []string `json:"items"`
	// Secondary marca o grupo de menor peso visual ("Também uso").
	Secondary bool `json:"secondary,omitempty"`
}

// Contact guarda os canais de contato.
type Contact struct {
	Email    string `json:"email"`
	LinkedIn string `json:"linkedin"`
	GitHub   string `json:"github"`
}

// Status é o andamento de um projeto. Sem status, o projeto é tratado como
// concluído e o badge não aparece.
type Status string

// StatusInDevelopment é o único status aceito hoje.
const StatusInDevelopment Status = "em-desenvolvimento"

// Label devolve o texto exibido no badge.
func (s Status) Label() string {
	switch s {
	case StatusInDevelopment:
		return "em desenvolvimento"
	default:
		return string(s)
	}
}

// Project é um card da seção "Projetos".
type Project struct {
	Slug string `json:"slug"`
	// Repo é o repositório no formato "dono/nome".
	Repo        string   `json:"repo"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Tags        []string `json:"tags"`
	// Meta são linhas fixas de contexto (ex.: "equipe de 3").
	Meta   []string `json:"meta"`
	Status Status   `json:"status,omitempty"`
	// ShowStars controla as estrelas do GitHub no card (padrão: true).
	ShowStars *bool `json:"showStars,omitempty"`
}

// StarsEnabled informa se o card pode exibir as estrelas do GitHub.
func (p Project) StarsEnabled() bool {
	return p.ShowStars == nil || *p.ShowStars
}

// Content é todo o conteúdo carregado de um diretório de dados.
type Content struct {
	Profile  Profile
	Projects []Project
}

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Load lê profile.json e projects.json de dir e valida os dois.
func Load(dir string) (*Content, error) {
	var c Content
	if err := decodeFile(filepath.Join(dir, "profile.json"), &c.Profile); err != nil {
		return nil, err
	}
	if err := decodeFile(filepath.Join(dir, "projects.json"), &c.Projects); err != nil {
		return nil, err
	}
	if err := c.Validate(); err != nil {
		return nil, err
	}
	return &c, nil
}

// decodeFile decodifica JSON de forma estrita: campos desconhecidos (um erro
// de digitação, por exemplo) e conteúdo extra depois do valor viram erro.
func decodeFile(path string, v any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	if _, err := dec.Token(); err != io.EOF {
		return fmt.Errorf("%s: conteúdo inesperado depois do JSON", path)
	}
	return nil
}

// Validate confere os campos obrigatórios e os formatos. Todos os problemas
// encontrados são devolvidos juntos.
func (c *Content) Validate() error {
	var v validator
	p := c.Profile
	v.required("profile.name", p.Name)
	v.required("profile.handle", p.Handle)
	v.required("profile.headline", p.Headline)
	v.required("profile.pitch", p.Pitch)
	v.required("profile.location", p.Location)
	v.required("profile.about", p.About)
	v.required("profile.contact.email", p.Contact.Email)
	v.httpURL("profile.contact.linkedin", p.Contact.LinkedIn)
	v.httpURL("profile.contact.github", p.Contact.GitHub)
	if p.Contact.Email != "" && !strings.Contains(p.Contact.Email, "@") {
		v.addf("profile.contact.email: e-mail inválido %q", p.Contact.Email)
	}

	for i, job := range p.Experience {
		field := fmt.Sprintf("profile.experience[%d]", i)
		v.required(field+".role", job.Role)
		v.required(field+".company", job.Company)
		v.required(field+".period", job.Period)
	}
	for i, edu := range p.Education {
		field := fmt.Sprintf("profile.education[%d]", i)
		v.required(field+".course", edu.Course)
		v.required(field+".institution", edu.Institution)
	}
	for i, group := range p.Stack {
		field := fmt.Sprintf("profile.stack[%d]", i)
		v.required(field+".label", group.Label)
		if len(group.Items) == 0 {
			v.addf("%s.items: lista vazia", field)
		}
	}

	slugs := make(map[string]bool, len(c.Projects))
	for i, proj := range c.Projects {
		field := fmt.Sprintf("projects[%d]", i)
		v.required(field+".title", proj.Title)
		v.required(field+".description", proj.Description)
		switch {
		case !slugPattern.MatchString(proj.Slug):
			v.addf("%s.slug: use letras minúsculas, números e hífens (recebido %q)", field, proj.Slug)
		case slugs[proj.Slug]:
			v.addf("%s.slug: %q repetido", field, proj.Slug)
		}
		slugs[proj.Slug] = true
		if !github.ValidRepoName(proj.Repo) {
			v.addf("%s.repo: use o formato dono/nome (recebido %q)", field, proj.Repo)
		}
		if proj.Status != "" && proj.Status != StatusInDevelopment {
			v.addf("%s.status: valor desconhecido %q (use %q ou remova o campo)", field, proj.Status, StatusInDevelopment)
		}
	}
	return v.err()
}

type validator struct{ errs []error }

func (v *validator) addf(format string, args ...any) {
	v.errs = append(v.errs, fmt.Errorf(format, args...))
}

func (v *validator) required(field, value string) {
	if strings.TrimSpace(value) == "" {
		v.addf("%s: campo obrigatório", field)
	}
}

func (v *validator) httpURL(field, value string) {
	u, err := url.Parse(value)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		v.addf("%s: URL http(s) inválida %q", field, value)
	}
}

func (v *validator) err() error {
	if len(v.errs) == 0 {
		return nil
	}
	return fmt.Errorf("conteúdo inválido: %w", errors.Join(v.errs...))
}
