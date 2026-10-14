package validate

import "testing"

func TestRepoName(t *testing.T) {
	for name, want := range map[string]bool{
		"igorhsalgado/igorhsalgado-resume":                true,
		"ArthurNunesDev/Projeto-Integrador-Computacional": true,
		"a.b/c_d.e":  true,
		"a/.github":  true,
		"":           false,
		"sem-barra":  false,
		"a/b/c":      false,
		"../etc":     false,
		"a/..":       false,
		"./b":        false,
		"a/b?x=1":    false,
		"a/b#x":      false,
		"a/b c":      false,
		"a%2fb/c":    false,
		" a/b":       false,
		"dono/nome/": false,
	} {
		if got := RepoName(name); got != want {
			t.Errorf("RepoName(%q) = %v, want %v", name, got, want)
		}
	}
}

func TestHTTPURL(t *testing.T) {
	for raw, want := range map[string]string{
		"https://example.com/x":   "https://example.com/x",
		"http://example.com":      "http://example.com",
		" https://example.com ":   "https://example.com",
		"\thttps://example.com\n": "https://example.com",
		"javascript:alert(1)":     "",
		"data:text/html,oi":       "",
		"ftp://example.com/file":  "",
		"/relativo":               "",
		"https://":                "",
		"":                        "",
	} {
		got, ok := HTTPURL(raw)
		if got != want || ok != (want != "") {
			t.Errorf("HTTPURL(%q) = %q, %v; want %q, %v", raw, got, ok, want, want != "")
		}
	}
}
