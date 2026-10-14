package content

import (
	"strings"
	"testing"
)

func TestLoadValid(t *testing.T) {
	c, err := Load("testdata/valid")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.Profile.Name != "Igor Hermann Salgado" {
		t.Errorf("Profile.Name = %q", c.Profile.Name)
	}
	if len(c.Projects) != 2 {
		t.Fatalf("len(Projects) = %d, want 2", len(c.Projects))
	}

	booking, market := c.Projects[0], c.Projects[1]
	if booking.Status != StatusInDevelopment || booking.Status.Label() != "em desenvolvimento" {
		t.Errorf("status = %q (%q)", booking.Status, booking.Status.Label())
	}
	if !booking.StarsEnabled() {
		t.Error("sem showStars, as estrelas devem ficar ligadas")
	}
	if market.StarsEnabled() {
		t.Error(`"showStars": false deve desligar as estrelas`)
	}

	last := c.Profile.Stack[len(c.Profile.Stack)-1]
	if !last.Secondary {
		t.Errorf("grupo %q deveria ser secundário", last.Label)
	}
}

// O conteúdo publicado precisa passar na mesma validação.
func TestLoadRepositoryData(t *testing.T) {
	if _, err := Load("../../data"); err != nil {
		t.Fatalf("data/ inválido: %v", err)
	}
}

func TestLoadErrors(t *testing.T) {
	tests := []struct {
		dir  string
		want []string
	}{
		{"testdata/missing", []string{"profile.json"}},
		{"testdata/malformed", []string{"projects.json"}},
		{"testdata/unknown-field", []string{"profile.json", `unknown field "headlin"`}},
		{"testdata/invalid", []string{
			"projects[0].slug",
			"projects[0].repo",
			"projects[0].title: campo obrigatório",
			`projects[0].status: valor desconhecido "pronto"`,
			`projects[2].slug: "dup" repetido`,
		}},
	}
	for _, tt := range tests {
		t.Run(tt.dir, func(t *testing.T) {
			_, err := Load(tt.dir)
			if err == nil {
				t.Fatal("Load deveria falhar")
			}
			for _, want := range tt.want {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("erro não menciona %q:\n%v", want, err)
				}
			}
		})
	}
}

func TestValidateContactURLs(t *testing.T) {
	for raw, valid := range map[string]bool{
		"https://www.linkedin.com/in/exemplo": true,
		"http://exemplo.dev":                  true,
		" https://www.linkedin.com/in/x":      false,
		"https://www.linkedin.com/in/x ":      false,
		"javascript:alert(1)":                 false,
		"www.linkedin.com/in/x":               false,
		"":                                    false,
	} {
		c, err := Load("testdata/valid")
		if err != nil {
			t.Fatal(err)
		}
		c.Profile.Contact.LinkedIn = raw
		err = c.Validate()
		if valid && err != nil {
			t.Errorf("linkedin %q: %v", raw, err)
		}
		if !valid && (err == nil || !strings.Contains(err.Error(), "profile.contact.linkedin")) {
			t.Errorf("linkedin %q: err = %v, want erro em profile.contact.linkedin", raw, err)
		}
	}
}
