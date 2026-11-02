package main

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
)

// SaveClipboardImages writes only raster images beside an explicitly opened or saved
// document. Callers supply bytes, never output paths or clipboard file names.
func (a *App) SaveClipboardImages(id string, encoded []string) (refs []string, err error) {
	a.mu.Lock()
	r, ok := a.files[id]
	var path, boundary string
	if ok {
		path, boundary = r.Path, r.Root
	}
	a.mu.Unlock()
	if !ok {
		return nil, fail("notAuthorized")
	}
	real, e := filepath.EvalSymlinks(path)
	if e != nil || real != path || !within(boundary, real) {
		return nil, fail("pathChanged")
	}
	if e = checkReadableDocument(real); e != nil {
		return nil, e
	}
	if len(encoded) == 0 || len(encoded) > 20 {
		return nil, fail("clipboardImageSize")
	}
	var images [][]byte
	var extensions []string
	total := 0
	for _, s := range encoded {
		if len(s) > base64.StdEncoding.EncodedLen(maxImage) {
			return nil, fail("clipboardImageSize")
		}
		b, e := base64.StdEncoding.Strict().DecodeString(s)
		if e != nil {
			return nil, fail("clipboardImageType")
		}
		total += len(b)
		if total > maxImage {
			return nil, fail("clipboardImageSize")
		}
		ext := map[string]string{"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif"}[http.DetectContentType(b)]
		config, _, e := image.DecodeConfig(bytes.NewReader(b))
		if ext == "" || e != nil || config.Width <= 0 || config.Height <= 0 {
			return nil, fail("clipboardImageType")
		}
		images = append(images, b)
		extensions = append(extensions, ext)
	}
	// Root confines every directory operation, including concurrent symlink changes.
	authorized, e := os.OpenRoot(boundary)
	if e != nil {
		return nil, e
	}
	defer authorized.Close()
	base, e := filepath.Rel(boundary, filepath.Dir(real))
	if e != nil {
		return nil, e
	}
	root, e := authorized.OpenRoot(base)
	if e != nil {
		return nil, e
	}
	defer root.Close()
	if e = root.Mkdir("assets", 0755); e != nil && !errors.Is(e, fs.ErrExist) {
		return nil, e
	}
	st, e := root.Lstat("assets")
	if e != nil {
		return nil, e
	}
	if !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
		return nil, fail("resourceOutside")
	}
	dir, e := root.OpenRoot("assets")
	if e != nil {
		return nil, e
	}
	defer dir.Close()
	var created []string
	defer func() {
		if err != nil {
			for _, name := range created {
				dir.Remove(name)
			}
		}
	}()
	for i, b := range images {
		var random [16]byte
		if _, e = rand.Read(random[:]); e != nil {
			return nil, e
		}
		name := "screenshot-" + hex.EncodeToString(random[:]) + extensions[i]
		f, e := dir.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
		if e != nil {
			return nil, e
		}
		created = append(created, name)
		_, e = f.Write(b)
		if e == nil {
			e = f.Sync()
		}
		closeErr := f.Close()
		if e != nil {
			return nil, e
		}
		if closeErr != nil {
			return nil, closeErr
		}
		refs = append(refs, "assets/"+name)
	}
	return refs, nil
}
