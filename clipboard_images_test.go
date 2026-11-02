package main

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func clipboardFixture(t *testing.T, format string) string {
	t.Helper()
	var b bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	var err error
	switch format {
	case "png":
		err = png.Encode(&b, img)
	case "jpeg":
		err = jpeg.Encode(&b, img, nil)
	case "gif":
		err = gif.Encode(&b, img, nil)
	}
	if err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(b.Bytes())
}

func TestClipboardImagesRoundTrip(t *testing.T) {
	a, d, path := fixture(t)
	before, _ := os.ReadFile(path)
	encoded := []string{clipboardFixture(t, "png"), clipboardFixture(t, "jpeg"), clipboardFixture(t, "gif")}
	refs, err := a.SaveClipboardImages(d.ID, encoded)
	if err != nil || len(refs) != len(encoded) {
		t.Fatal(refs, err)
	}
	for i, ref := range refs {
		if !strings.HasPrefix(ref, "assets/screenshot-") || strings.Contains(ref, "\\") {
			t.Fatal(ref)
		}
		uri, err := a.ReadImage(d.ID, ref)
		if err != nil || !strings.HasSuffix(uri, ","+encoded[i]) {
			t.Fatal(uri, err)
		}
	}
	// Identical screenshots get separate names and cannot overwrite earlier files.
	again, err := a.SaveClipboardImages(d.ID, encoded[:1])
	if err != nil || again[0] == refs[0] {
		t.Fatal(again, err)
	}
	after, _ := os.ReadFile(path)
	if !bytes.Equal(before, after) {
		t.Fatal("pasting changed the saved Markdown before the user saved")
	}
}

func TestClipboardImagesRejectInvalidBatchBeforeWriting(t *testing.T) {
	a, d, path := fixture(t)
	png := clipboardFixture(t, "png")
	for _, encoded := range [][]string{
		nil,
		{png, "not base64"},
		{base64.StdEncoding.EncodeToString([]byte("<svg xmlns='http://www.w3.org/2000/svg'/>"))},
		{base64.StdEncoding.EncodeToString([]byte("\x89PNG\r\n\x1a\ntruncated"))},
		{strings.Repeat("A", base64.StdEncoding.EncodedLen(maxImage)+4)},
		make([]string, 21),
	} {
		if _, err := a.SaveClipboardImages(d.ID, encoded); err == nil {
			t.Fatal("invalid batch accepted")
		}
		if _, err := os.Stat(filepath.Join(filepath.Dir(path), "assets")); !os.IsNotExist(err) {
			t.Fatal("invalid batch created assets", err)
		}
	}
	if _, err := a.SaveClipboardImages("unknown", []string{png}); err == nil {
		t.Fatal("unknown document accepted")
	}
}

func TestClipboardImagesRejectSymlinkAndChangedDocument(t *testing.T) {
	a, d, path := fixture(t)
	outside := t.TempDir()
	assets := filepath.Join(filepath.Dir(path), "assets")
	if err := os.Symlink(outside, assets); err != nil {
		t.Skip("symlinks unavailable", err)
	}
	png := clipboardFixture(t, "png")
	if _, err := a.SaveClipboardImages(d.ID, []string{png}); err == nil {
		t.Fatal("symlink assets accepted")
	}
	entries, _ := os.ReadDir(outside)
	if len(entries) != 0 {
		t.Fatal("wrote outside the document directory")
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if _, err := a.SaveClipboardImages(d.ID, []string{png}); err == nil {
		t.Fatal("deleted document accepted")
	}
}
