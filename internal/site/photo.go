package site

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// photoSize é o lado da foto em pixels CSS; a versão 2x serve telas de alta densidade.
const photoSize = 144

// localPhotos são os nomes aceitos para a foto local em StaticDir, em ordem de preferência.
var localPhotos = []string{"foto.jpg", "foto.jpeg", "foto.png", "foto.webp"}

// resolvePhoto escolhe a foto do topo, nesta ordem:
//  1. foto local em StaticDir (já copiada para OutDir): sempre vence;
//  2. avatar do GitHub, baixado agora em 144 px e 288 px;
//  3. nenhuma (nil): a página sai sem foto.
//
// Falhas no download só geram aviso. Se só a versão 2x falhar, a foto sai
// sem srcset.
func resolvePhoto(ctx context.Context, cfg Config, paths Paths) *Photo {
	for _, name := range localPhotos {
		if fileExists(filepath.Join(cfg.StaticDir, name)) {
			return &Photo{Src: paths.URL(name)}
		}
	}
	if cfg.GitHub == nil || cfg.AvatarUserID == 0 {
		return nil
	}

	src, err := saveAvatar(ctx, cfg, paths, photoSize)
	if err != nil {
		cfg.Logger.Warn("avatar do GitHub indisponível; página sai sem foto", "err", err)
		return nil
	}
	photo := &Photo{Src: src}

	src2x, err := saveAvatar(ctx, cfg, paths, 2*photoSize)
	if err != nil {
		cfg.Logger.Warn("avatar 2x do GitHub indisponível; foto sai só em 1x", "err", err)
		return photo
	}
	photo.Srcset = fmt.Sprintf("%s 1x, %s 2x", src, src2x)
	return photo
}

// saveAvatar baixa o avatar em size×size para OutDir e devolve a URL publicada.
func saveAvatar(ctx context.Context, cfg Config, paths Paths, size int) (string, error) {
	img, err := cfg.GitHub.Avatar(ctx, cfg.AvatarUserID, size)
	if err != nil {
		return "", err
	}
	name := fmt.Sprintf("avatar-%d.%s", size, img.Ext)
	if err := os.WriteFile(filepath.Join(cfg.OutDir, name), img.Data, 0o644); err != nil {
		return "", err
	}
	return paths.URL(name), nil
}
