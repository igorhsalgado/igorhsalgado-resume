package github

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/png"
	"net"
	"net/http"
	"net/http/httptest"
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
