package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	w "github.com/wailsapp/wails/v2/pkg/runtime"
)

// answer makes every save dialog return path, and records the suggested file name.
func answer(a *App, path string, suggested *string) {
	a.dialog = &dialogs{
		openFiles:  func(w.OpenDialogOptions) ([]string, error) { return []string{path}, nil },
		openFolder: func(w.OpenDialogOptions) (string, error) { return path, nil },
		saveFile: func(o w.SaveDialogOptions) (string, error) {
			if suggested != nil {
				*suggested = o.DefaultFilename
			}
			return path, nil
		},
	}
}

func TestSaveNewDocumentAddsExtension(t *testing.T) {
	a := NewApp()
	dir := t.TempDir()
	answer(a, filepath.Join(dir, "笔记"), nil)
	r, e := a.SaveDocument("", "# 新文档\n", "", "UTF-16 LE", false)
	if e != nil || r.Cancelled {
		t.Fatal(r, e)
	}
	b, e := os.ReadFile(filepath.Join(dir, "笔记.md"))
	if e != nil || string(b) != "# 新文档\n" {
		t.Fatalf("%q %v", b, e)
	}
	// A new file is always UTF-8, whatever the editor reported.
	if r.Document.Encoding != "UTF-8" || r.Document.Name != "笔记.md" || r.Document.Hash == "" {
		t.Fatalf("%+v", r.Document)
	}
}

func TestSaveAsRulesAndCancel(t *testing.T) {
	a, d, p := fixture(t)
	var suggested string
	answer(a, "", &suggested)
	if r, e := a.SaveDocument(d.ID, "x", d.Hash, d.Encoding, true); e != nil || !r.Cancelled {
		t.Fatal(r, e)
	}
	if suggested != "测试.md" {
		t.Fatalf("suggested %q", suggested)
	}
	answer(a, filepath.Join(filepath.Dir(p), "notes.txt"), nil)
	if _, e := a.SaveDocument(d.ID, "x", d.Hash, d.Encoding, true); e == nil || !strings.Contains(e.Error(), "markdownExt") {
		t.Fatalf("txt accepted: %v", e)
	}
	b, _ := os.ReadFile(p)
	if string(b) != "原文\r\n" {
		t.Fatal("original changed")
	}
}

func TestSaveAsReplacesExistingFileWithoutConflictCheck(t *testing.T) {
	a, d, p := fixture(t)
	target := filepath.Join(filepath.Dir(p), "other.md")
	os.WriteFile(target, []byte("old"), 0644)
	answer(a, target, nil)
	r, e := a.SaveDocument(d.ID, "new", d.Hash, d.Encoding, true)
	if e != nil {
		t.Fatal(e)
	}
	if b, _ := os.ReadFile(target); string(b) != "new" || r.Document.ID == d.ID {
		t.Fatalf("%q %+v", b, r.Document)
	}
}

func TestSaveAsFollowsSymlink(t *testing.T) {
	a, d, p := fixture(t)
	dir := filepath.Dir(p)
	real := filepath.Join(dir, "real.md")
	os.WriteFile(real, []byte("old"), 0644)
	link := filepath.Join(dir, "link.md")
	if e := os.Symlink(real, link); e != nil {
		t.Skip("symlinks unavailable:", e)
	}
	answer(a, link, nil)
	if _, e := a.SaveDocument(d.ID, "through link", d.Hash, d.Encoding, true); e != nil {
		t.Fatal(e)
	}
	if st, _ := os.Lstat(link); st.Mode()&os.ModeSymlink == 0 {
		t.Fatal("link replaced by a file")
	}
	if b, _ := os.ReadFile(real); string(b) != "through link" {
		t.Fatalf("%q", b)
	}
}

func TestSaveKnownDocumentNeedsBaseline(t *testing.T) {
	a, d, _ := fixture(t)
	a.dialog = &dialogs{saveFile: func(w.SaveDialogOptions) (string, error) { t.Fatal("dialog shown"); return "", nil }}
	if _, e := a.SaveDocument(d.ID, "x", "", d.Encoding, false); e == nil || !strings.Contains(e.Error(), "noBaseline") {
		t.Fatalf("%v", e)
	}
}

func TestDialogErrorIsReturned(t *testing.T) {
	a := NewApp()
	broken := errors.New("dialog failed")
	a.dialog = &dialogs{saveFile: func(w.SaveDialogOptions) (string, error) { return "", broken }}
	if _, e := a.SaveDocument("", "x", "", "UTF-8", false); !errors.Is(e, broken) {
		t.Fatal(e)
	}
}

func TestExportHTMLRules(t *testing.T) {
	a := NewApp()
	dir := t.TempDir()
	var suggested string
	answer(a, filepath.Join(dir, "page"), &suggested)
	p, e := a.ExportHTML("说明.md", "<p>ok</p>")
	if e != nil || p != filepath.Join(dir, "page.html") || suggested != "说明.html" {
		t.Fatal(p, e, suggested)
	}
	if b, _ := os.ReadFile(p); string(b) != "<p>ok</p>" {
		t.Fatalf("%q", b)
	}
	answer(a, filepath.Join(dir, "page.htm"), nil)
	if _, e := a.ExportHTML("a.md", "x"); e == nil {
		t.Fatal("htm accepted")
	}
	answer(a, "", nil)
	if p, e := a.ExportHTML("a.md", "x"); p != "" || e != nil {
		t.Fatal(p, e)
	}
	if _, e := a.ExportHTML("a.md", strings.Repeat("x", 28*1024*1024+1)); e == nil {
		t.Fatal("oversized export accepted")
	}
}

func TestOpenDialogsRegisterDocuments(t *testing.T) {
	a := NewApp()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "a.md"), []byte("a"), 0644)
	os.MkdirAll(filepath.Join(dir, "sub"), 0755)
	os.WriteFile(filepath.Join(dir, "sub", "b.markdown"), []byte("b"), 0644)
	os.WriteFile(filepath.Join(dir, "c.txt"), []byte("c"), 0644)
	answer(a, filepath.Join(dir, "a.md"), nil)
	r, e := a.OpenFiles()
	if e != nil || len(r.Documents) != 1 {
		t.Fatal(r, e)
	}
	answer(a, dir, nil)
	r, e = a.OpenFolder()
	if e != nil || len(r.Documents) != 2 || r.Documents[1].Relative != "sub/b.markdown" {
		t.Fatalf("%+v %v", r, e)
	}
	if _, e := a.ReadDocument(r.Documents[1].ID); e != nil {
		t.Fatal(e)
	}
}
