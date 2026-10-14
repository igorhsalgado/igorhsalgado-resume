package github

import (
	"context"
	"fmt"
	"io"
	"mime"
	"net/http"
)

const maxAvatarBytes = 5 << 20

// Image é uma imagem baixada e já identificada.
type Image struct {
	Data []byte
	// Ext é a extensão do formato detectado: "jpg", "png" ou "webp".
	Ext string
}

// imageExt mapeia os formatos aceitos para a extensão do arquivo.
var imageExt = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/webp": "webp",
}

// Avatar baixa o avatar do usuário com o ID numérico dado, no tamanho size×size
// (o GitHub redimensiona no servidor). A resposta precisa declarar um
// Content-Type de imagem e os bytes precisam ser JPEG, PNG ou WebP.
func (c *Client) Avatar(ctx context.Context, userID int64, size int) (Image, error) {
	ctx, cancel := context.WithTimeout(ctx, c.Timeout)
	defer cancel()

	url := fmt.Sprintf("%s/u/%d?s=%d", c.AvatarURL, userID, size)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Image{}, err
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return Image{}, err
	}
	defer resp.Body.Close()
	if err := checkStatus(resp); err != nil {
		return Image{}, err
	}

	declared, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if _, ok := imageExt[declared]; !ok {
		return Image{}, fmt.Errorf("Content-Type inesperado %q", resp.Header.Get("Content-Type"))
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxAvatarBytes+1))
	if err != nil {
		return Image{}, err
	}
	if len(data) == 0 || len(data) > maxAvatarBytes {
		return Image{}, fmt.Errorf("tamanho inesperado (%d bytes)", len(data))
	}

	// Não confia só no cabeçalho: o formato vem dos primeiros bytes.
	ext, ok := imageExt[http.DetectContentType(data)]
	if !ok {
		return Image{}, fmt.Errorf("o conteúdo não é JPEG, PNG nem WebP")
	}
	return Image{Data: data, Ext: ext}, nil
}
