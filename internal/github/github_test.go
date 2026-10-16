package github

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newTestClient(t *testing.T, h http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	c := NewClient("")
	c.APIURL = srv.URL
	c.AvatarURL = srv.URL
	c.HTTP = srv.Client()
	return c
}

func TestRepoOK(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/repos/igorhsalgado/igorhsalgado-resume" {
			t.Errorf("path = %q", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer s3cr3t" {
			t.Errorf("Authorization = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{
			"pushed_at": "2026-10-12T18:00:00Z",
			"stargazers_count": 7,
			"html_url": "https://github.com/igorhsalgado/igorhsalgado-resume",
			"homepage": "https://igorhsalgado.github.io/igorhsalgado-resume/",
			"ignored": true
		}`))
	})
	c.Token = "s3cr3t"

	got, err := c.Repo(context.Background(), "igorhsalgado/igorhsalgado-resume")
	if err != nil {
		t.Fatalf("Repo: %v", err)
	}
	want := Repo{
		PushedAt: time.Date(2026, 10, 12, 18, 0, 0, 0, time.UTC),
		Stars:    7,
		HTMLURL:  "https://github.com/igorhsalgado/igorhsalgado-resume",
		Homepage: "https://igorhsalgado.github.io/igorhsalgado-resume/",
	}
	if !got.PushedAt.Equal(want.PushedAt) || got.Stars != want.Stars ||
		got.HTMLURL != want.HTMLURL || got.Homepage != want.Homepage {
		t.Errorf("Repo = %+v, want %+v", got, want)
	}
}

func TestRepoWithoutTokenSendsNoAuthorization(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if _, ok := r.Header["Authorization"]; ok {
			t.Error("sem token, não deve haver cabeçalho Authorization")
		}
		w.Write([]byte(`{}`))
	})
	if _, err := c.Repo(context.Background(), "a/b"); err != nil {
		t.Fatal(err)
	}
}

// Campos ausentes, nulos ou com URL que não seja http(s) viram valor zero
// sem derrubar a resposta inteira.
func TestRepoSanitizesFields(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{
			"pushed_at": "ontem",
			"html_url": "javascript:alert(1)",
			"homepage": null
		}`))
	})
	got, err := c.Repo(context.Background(), "a/b")
	if err != nil {
		t.Fatalf("Repo: %v", err)
	}
	if !got.PushedAt.IsZero() || got.Stars != 0 || got.HTMLURL != "" || got.Homepage != "" {
		t.Errorf("Repo = %+v, want valor zero", got)
	}
}

func TestRepoErrors(t *testing.T) {
	tests := []struct {
		name    string
		handler http.HandlerFunc
		check   func(t *testing.T, err error)
	}{
		{
			name: "404",
			handler: func(w http.ResponseWriter, r *http.Request) {
				http.Error(w, `{"message":"Not Found"}`, http.StatusNotFound)
			},
			check: func(t *testing.T, err error) {
				var se *StatusError
				if !errors.As(err, &se) || se.StatusCode != 404 || se.RateLimited {
					t.Errorf("err = %v, want StatusError 404", err)
				}
			},
		},
		{
			name: "403 limite de requisições",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("X-RateLimit-Remaining", "0")
				http.Error(w, `{"message":"API rate limit exceeded"}`, http.StatusForbidden)
			},
			check: func(t *testing.T, err error) {
				var se *StatusError
				if !errors.As(err, &se) || se.StatusCode != 403 || !se.RateLimited {
					t.Errorf("err = %v, want StatusError 403 com RateLimited", err)
				}
			},
		},
		{
			name: "JSON inválido",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.Write([]byte(`{"stargazers_count": "muitas"`))
			},
			check: func(t *testing.T, err error) {
				if err == nil {
					t.Error("esperava erro de JSON")
				}
			},
		},
		{
			name: "timeout",
			handler: func(w http.ResponseWriter, r *http.Request) {
				select {
				case <-r.Context().Done():
				case <-time.After(2 * time.Second):
				}
			},
			check: func(t *testing.T, err error) {
				var ne net.Error
				if !errors.As(err, &ne) || !ne.Timeout() {
					t.Errorf("err = %v, want timeout do cliente HTTP", err)
				}
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := newTestClient(t, tt.handler)
			c.HTTP.Timeout = 50 * time.Millisecond
			_, err := c.Repo(context.Background(), "a/b")
			tt.check(t, err)
		})
	}
}

// O prazo do ctx de quem chama também limita a requisição.
func TestRepoContextDeadline(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	})
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, err := c.Repo(ctx, "a/b"); !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("err = %v, want context.DeadlineExceeded", err)
	}
}

// O valor zero de Client funciona: sem HTTP, usa o cliente padrão.
func TestZeroClient(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/u/1" {
			w.Header().Set("Content-Type", "image/png")
			w.Write(pngBytes(t))
			return
		}
		w.Write([]byte(`{"stargazers_count": 2}`))
	}))
	t.Cleanup(srv.Close)

	c := &Client{APIURL: srv.URL, AvatarURL: srv.URL}
	if repo, err := c.Repo(context.Background(), "a/b"); err != nil || repo.Stars != 2 {
		t.Errorf("Repo = %+v, %v", repo, err)
	}
	if _, err := c.Avatar(context.Background(), 1, 144); err != nil {
		t.Errorf("Avatar: %v", err)
	}
	if NewClient("").HTTP.Timeout != DefaultTimeout {
		t.Error("NewClient deveria usar DefaultTimeout")
	}
}

func TestRepoInvalidNameSkipsRequest(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("requisição inesperada para %s", r.URL)
	})
	for _, name := range []string{"", "sem-barra", "a/b/c", "../etc", "a/..", "a/b?x=1"} {
		if _, err := c.Repo(context.Background(), name); !errors.Is(err, ErrInvalidRepo) {
			t.Errorf("Repo(%q) err = %v, want ErrInvalidRepo", name, err)
		}
	}
}

func pngBytes(t *testing.T) []byte {
	t.Helper()
	img := image.NewGray(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.White)
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestAvatar(t *testing.T) {
	data := pngBytes(t)
	tests := []struct {
		name        string
		contentType string
		status      int
		body        []byte
		wantErr     bool
	}{
		{name: "png", contentType: "image/png", status: 200, body: data},
		{name: "404", contentType: "image/png", status: 404, body: data, wantErr: true},
		{name: "content-type não é imagem", contentType: "text/html; charset=utf-8", status: 200, body: data, wantErr: true},
		{name: "bytes não são imagem", contentType: "image/png", status: 200, body: []byte("<html>oi</html>"), wantErr: true},
		{name: "vazio", contentType: "image/jpeg", status: 200, body: nil, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/u/145609906" || r.URL.Query().Get("s") != "144" {
					t.Errorf("URL = %s", r.URL)
				}
				w.Header().Set("Content-Type", tt.contentType)
				w.WriteHeader(tt.status)
				w.Write(tt.body)
			})
			img, err := c.Avatar(context.Background(), 145609906, 144)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("esperava erro, veio imagem %q", img.Ext)
				}
				return
			}
			if err != nil {
				t.Fatalf("Avatar: %v", err)
			}
			if img.Ext != "png" || !bytes.Equal(img.Data, data) {
				t.Errorf("Avatar = ext %q, %d bytes", img.Ext, len(img.Data))
			}
		})
	}
}

// O nome vai escapado no caminho da requisição.
func TestRepoEscapesPath(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.EscapedPath() != "/repos/Dono.X/repo_y.go" {
			t.Errorf("path = %q", r.URL.EscapedPath())
		}
		w.Write([]byte(`{}`))
	})
	if _, err := c.Repo(context.Background(), "Dono.X/repo_y.go"); err != nil {
		t.Fatal(err)
	}
}

// statsServer simula as rotas usadas por CodeStats. Rotas fora do mapa
// respondem 404; fail força um status de erro numa rota.
func statsServer(t *testing.T, routes map[string]string, fail map[string]int) *Client {
	t.Helper()
	return newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		key := r.URL.Path
		if r.URL.Path == "/users/igorhsalgado/repos" {
			q := r.URL.Query()
			if q.Get("type") != "owner" || q.Get("per_page") != "100" {
				t.Errorf("query = %s", r.URL.RawQuery)
			}
			key += "?page=" + q.Get("page")
		}
		if code, ok := fail[key]; ok {
			w.Header().Set("X-RateLimit-Remaining", "0")
			http.Error(w, `{"message":"rate limit"}`, code)
			return
		}
		body, ok := routes[key]
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Write([]byte(body))
	})
}

var statsRoutes = map[string]string{
	"/users/igorhsalgado": `{"public_repos": 5}`,
	"/users/igorhsalgado/repos?page=1": `[
		{"full_name": "igorhsalgado/igorhsalgado-resume", "fork": false},
		{"full_name": "igorhsalgado/Java", "fork": false},
		{"full_name": "igorhsalgado/um-fork", "fork": true},
		{"full_name": "igorhsalgado/privado", "fork": false, "private": true},
		{"full_name": "igorhsalgado/vazio", "fork": false}
	]`,
	"/repos/igorhsalgado/igorhsalgado-resume/languages": `{"Go": 55000, "CSS": 16000, "HTML": 9000}`,
	"/repos/igorhsalgado/Java/languages":                `{"Java": 40000, "": 7, "Lixo": -3}`,
	"/repos/igorhsalgado/vazio/languages":               `{}`,
	"/repos/Equipe/projeto/languages":                   `{"Go": 1000, "TypeScript": 2000}`,
}

func TestCodeStats(t *testing.T) {
	c := statsServer(t, statsRoutes, nil)
	// O extra repetido (outra caixa) conta uma vez só; o inválido é ignorado.
	got, err := c.CodeStats(context.Background(), "igorhsalgado",
		[]string{"Equipe/projeto", "IGORHSALGADO/java", "invalido"})
	if err != nil {
		t.Fatalf("CodeStats: %v", err)
	}
	if got.PublicRepos != 5 || got.Repos != 4 {
		t.Errorf("PublicRepos = %d, Repos = %d; want 5 e 4", got.PublicRepos, got.Repos)
	}
	want := map[string]int64{"Go": 56000, "CSS": 16000, "HTML": 9000, "Java": 40000, "TypeScript": 2000}
	if len(got.Languages) != len(want) {
		t.Errorf("Languages = %v, want %v", got.Languages, want)
	}
	for lang, n := range want {
		if got.Languages[lang] != n {
			t.Errorf("Languages[%q] = %d, want %d", lang, got.Languages[lang], n)
		}
	}
}

// Com 100 repositórios na primeira página, a segunda também é lida.
func TestCodeStatsPaginates(t *testing.T) {
	var page1 strings.Builder
	page1.WriteString("[")
	for i := range 100 {
		if i > 0 {
			page1.WriteString(",")
		}
		fmt.Fprintf(&page1, `{"full_name": "igorhsalgado/fork-%d", "fork": true}`, i)
	}
	page1.WriteString("]")
	routes := map[string]string{
		"/users/igorhsalgado":                  `{"public_repos": 101}`,
		"/users/igorhsalgado/repos?page=1":     page1.String(),
		"/users/igorhsalgado/repos?page=2":     `[{"full_name": "igorhsalgado/ultimo", "fork": false}]`,
		"/repos/igorhsalgado/ultimo/languages": `{"Go": 10}`,
	}
	got, err := statsServer(t, routes, nil).CodeStats(context.Background(), "igorhsalgado", nil)
	if err != nil {
		t.Fatalf("CodeStats: %v", err)
	}
	if got.Repos != 1 || got.Languages["Go"] != 10 {
		t.Errorf("CodeStats = %+v", got)
	}
}

// Qualquer consulta que falhe derruba o resultado inteiro: nada de soma parcial.
func TestCodeStatsAllOrNothing(t *testing.T) {
	for _, route := range []string{
		"/users/igorhsalgado",
		"/users/igorhsalgado/repos?page=1",
		"/repos/igorhsalgado/Java/languages",
		"/repos/Equipe/projeto/languages",
	} {
		t.Run(route, func(t *testing.T) {
			c := statsServer(t, statsRoutes, map[string]int{route: http.StatusForbidden})
			_, err := c.CodeStats(context.Background(), "igorhsalgado", []string{"Equipe/projeto"})
			var se *StatusError
			if !errors.As(err, &se) || !se.RateLimited {
				t.Errorf("err = %v, want StatusError com RateLimited", err)
			}
		})
	}
}

func TestCodeStatsInvalidLoginSkipsRequest(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("requisição inesperada para %s", r.URL)
	})
	for _, login := range []string{"", "../x", "a/b", "-a"} {
		if _, err := c.CodeStats(context.Background(), login, nil); !errors.Is(err, ErrInvalidLogin) {
			t.Errorf("CodeStats(%q) err = %v, want ErrInvalidLogin", login, err)
		}
	}
}
