package main

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Remote images are opt-in. The native layer fetches them so the reading frame keeps
// its "img-src data:" policy: the document itself never gets a network origin, and
// what reaches the frame passes the same type checks as a local image.
const remoteImageTimeout = 20 * time.Second

var remoteImageClient = &http.Client{
	Timeout: remoteImageTimeout,
	CheckRedirect: func(r *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return http.ErrUseLastResponse
		}
		if r.URL.Scheme != "http" && r.URL.Scheme != "https" {
			return fail("linkScheme")
		}
		// No Referer: many image hosts only refuse foreign referers, and it leaks the source.
		r.Header.Del("Referer")
		return nil
	},
}

func (a *App) ReadRemoteImage(raw string) (string, error) {
	u, e := url.Parse(raw)
	if e != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", fail("linkScheme")
	}
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	b, e := fetchRemoteImage(ctx, remoteImageClient, u.String(), maxImage)
	if e != nil {
		return "", e
	}
	return imageDataURI(b, isSVG(u.Path, b))
}

func fetchRemoteImage(ctx context.Context, c *http.Client, raw string, limit int64) ([]byte, error) {
	req, e := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if e != nil {
		return nil, failDetail("remoteImage", e)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh) MoRead")
	req.Header.Set("Accept", "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8")
	res, e := c.Do(req)
	if e != nil {
		return nil, failDetail("remoteImage", e)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, failDetail("remoteImage", httpStatusError(res.Status))
	}
	if res.ContentLength > limit {
		return nil, fail("tooLarge")
	}
	b, e := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if e != nil {
		return nil, failDetail("remoteImage", e)
	}
	if int64(len(b)) > limit {
		return nil, fail("tooLarge")
	}
	return b, nil
}

type httpStatusError string

func (s httpStatusError) Error() string { return "HTTP " + string(s) }

func isSVG(path string, b []byte) bool {
	if strings.HasSuffix(strings.ToLower(path), ".svg") {
		return true
	}
	head := bytes.ToLower(b[:min(len(b), 1024)])
	return bytes.Contains(head, []byte("<svg"))
}

// imageDataURI applies the shared image allowlist to local and remote bytes alike.
func imageDataURI(b []byte, svg bool) (string, error) {
	mime := http.DetectContentType(b)
	if svg {
		var e error
		b, e = sanitizeSVG(b)
		if e != nil {
			return "", e
		}
		mime = "image/svg+xml"
	}
	if len(b) > 12 && string(b[4:8]) == "ftyp" && (string(b[8:12]) == "avif" || string(b[8:12]) == "avis") {
		mime = "image/avif"
	}
	switch mime {
	case "image/svg+xml", "image/avif", "image/png", "image/jpeg", "image/gif", "image/webp":
	default:
		return "", fail("imageType")
	}
	return "data:" + mime + ";base64," + base64Encode(b), nil
}
