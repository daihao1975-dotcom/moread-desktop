package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func recentApp(t *testing.T) (*App, string) {
	t.Helper()
	a := NewApp()
	a.settingsFile = filepath.Join(t.TempDir(), "settings.json")
	dir := t.TempDir()
	if real, e := filepath.EvalSymlinks(dir); e == nil {
		dir = real
	}
	return a, dir
}

func TestRecentIsOffByDefault(t *testing.T) {
	a, dir := recentApp(t)
	p := filepath.Join(dir, "a.md")
	os.WriteFile(p, []byte("a"), 0644)
	a.registerPaths([]string{p})
	if r := a.Recent(); r.Enabled || len(r.Items) != 0 {
		t.Fatalf("%+v", r)
	}
	if _, e := os.Stat(a.settingsFile); e == nil {
		t.Fatal("settings written without a change")
	}
}

func TestRecentOrderLimitAndForget(t *testing.T) {
	a, dir := recentApp(t)
	a.SetRememberRecent(true)
	for i := 0; i < maxRecent+2; i++ {
		p := filepath.Join(dir, string(rune('a'+i))+".md")
		os.WriteFile(p, []byte("x"), 0644)
		a.registerPaths([]string{p})
	}
	a.registerPaths([]string{filepath.Join(dir, "c.md")})
	a.registerPaths([]string{dir})
	r := a.Recent()
	if len(r.Items) != maxRecent || !r.Items[0].Folder || r.Items[0].Path != dir || r.Items[1].Name != "c.md" {
		t.Fatalf("%+v", r.Items)
	}
	// The list survives a restart, and turning it off removes every path from disk.
	s, e := loadSettings(a.settingsFile)
	if e != nil || len(s.Recent) != maxRecent {
		t.Fatal(s, e)
	}
	if r = a.SetRememberRecent(false); r.Enabled || len(r.Items) != 0 {
		t.Fatalf("%+v", r)
	}
	b, _ := os.ReadFile(a.settingsFile)
	if strings.Contains(string(b), dir) {
		t.Fatalf("paths kept: %s", b)
	}
}

func TestOpenRecentOnlyAcceptsListedPaths(t *testing.T) {
	a, dir := recentApp(t)
	a.SetRememberRecent(true)
	p := filepath.Join(dir, "a.md")
	os.WriteFile(p, []byte("a"), 0644)
	other := filepath.Join(dir, "other.md")
	os.WriteFile(other, []byte("b"), 0644)
	a.registerPaths([]string{p})
	if _, e := a.OpenRecent(other); e == nil || !strings.Contains(e.Error(), "recentUnknown") {
		t.Fatal(e)
	}
	r, e := a.OpenRecent(p)
	if e != nil || len(r.Documents) != 1 {
		t.Fatal(r, e)
	}
	os.Remove(p)
	if _, e := a.OpenRecent(p); e == nil || !strings.Contains(e.Error(), "recentMissing") {
		t.Fatal(e)
	}
	if len(a.Recent().Items) != 0 {
		t.Fatal("missing entry kept")
	}
}

func TestLoadSettingsDropsBadRecentEntries(t *testing.T) {
	p := filepath.Join(t.TempDir(), "settings.json")
	entries := []recentEntry{{Path: "relative.md"}}
	for i := 0; i < maxRecent+3; i++ {
		entries = append(entries, recentEntry{Path: filepath.Join(t.TempDir(), "x.md")})
	}
	b, _ := json.Marshal(settings{RememberRecent: true, Recent: entries})
	os.WriteFile(p, b, 0600)
	s, e := loadSettings(p)
	if e != nil || len(s.Recent) != maxRecent || s.Recent[0].Path == "relative.md" {
		t.Fatal(s.Recent, e)
	}
	b, _ = json.Marshal(settings{Recent: entries})
	os.WriteFile(p, b, 0600)
	if s, _ = loadSettings(p); len(s.Recent) != 0 {
		t.Fatal("paths kept while the list is off")
	}
}

func TestRefreshFoldersReportsChanges(t *testing.T) {
	a, dir := recentApp(t)
	os.WriteFile(filepath.Join(dir, "a.md"), []byte("a"), 0644)
	os.WriteFile(filepath.Join(dir, "b.md"), []byte("b"), 0644)
	first := a.registerPaths([]string{dir})
	if u := a.RefreshFolders(); len(u.Added) != 0 || len(u.Removed) != 0 {
		t.Fatalf("%+v", u)
	}
	os.Remove(filepath.Join(dir, "a.md"))
	os.MkdirAll(filepath.Join(dir, "sub"), 0755)
	os.WriteFile(filepath.Join(dir, "sub", "c.md"), []byte("c"), 0644)
	u := a.RefreshFolders()
	if len(u.Added) != 1 || u.Added[0].Relative != "sub/c.md" || len(u.Removed) != 1 || u.Removed[0] != first.Documents[0].ID {
		t.Fatalf("%+v", u)
	}
	if _, e := a.ReadDocument(u.Added[0].ID); e != nil {
		t.Fatal(e)
	}
	if u = a.RefreshFolders(); len(u.Added) != 0 || len(u.Removed) != 0 {
		t.Fatalf("second refresh %+v", u)
	}
}

func TestEveryErrorCodeHasAMessage(t *testing.T) {
	files, _ := filepath.Glob("*.go")
	code := regexp.MustCompile(`fail(?:Detail)?\("([A-Za-z]+)"`)
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		b, _ := os.ReadFile(f)
		for _, m := range code.FindAllStringSubmatch(string(b), -1) {
			if _, ok := locales[fallbackLanguage]["err."+m[1]]; !ok {
				t.Errorf("%s: no message for %s", f, m[1])
			}
		}
	}
}

// lockDir makes a folder unreadable for the rest of the test, or skips where permissions do not apply.
func lockDir(t *testing.T, dir string) func() {
	t.Helper()
	if e := os.Chmod(dir, 0); e != nil {
		t.Fatal(e)
	}
	unlock := func() { os.Chmod(dir, 0755) }
	t.Cleanup(unlock)
	if _, e := os.ReadDir(dir); e == nil {
		unlock()
		t.Skip("folder permissions are not enforced here")
	}
	return unlock
}

func TestRefreshKeepsFilesOfUnreadableFolders(t *testing.T) {
	a, dir := recentApp(t)
	os.MkdirAll(filepath.Join(dir, "sub"), 0755)
	os.WriteFile(filepath.Join(dir, "a.md"), []byte("a"), 0644)
	os.WriteFile(filepath.Join(dir, "sub", "b.md"), []byte("b"), 0644)
	first := a.registerPaths([]string{dir})
	if len(first.Documents) != 2 {
		t.Fatal(first)
	}
	unlockSub := lockDir(t, filepath.Join(dir, "sub"))
	if u := a.RefreshFolders(); len(u.Added) != 0 || len(u.Removed) != 0 {
		t.Fatalf("unreadable subfolder: %+v", u)
	}
	unlockSub()
	unlockRoot := lockDir(t, dir)
	if u := a.RefreshFolders(); len(u.Added) != 0 || len(u.Removed) != 0 {
		t.Fatalf("unreadable folder: %+v", u)
	}
	// Once readable again, a real deletion is still noticed.
	unlockRoot()
	os.Remove(filepath.Join(dir, "sub", "b.md"))
	u := a.RefreshFolders()
	if len(u.Added) != 0 || len(u.Removed) != 1 || u.Removed[0] != first.Documents[1].ID {
		t.Fatalf("after deletion: %+v", u)
	}
}

func TestRefreshReportsDeletedFolder(t *testing.T) {
	a, dir := recentApp(t)
	folder := filepath.Join(dir, "notes")
	os.MkdirAll(folder, 0755)
	os.WriteFile(filepath.Join(folder, "a.md"), []byte("a"), 0644)
	first := a.registerPaths([]string{folder})
	os.RemoveAll(folder)
	if u := a.RefreshFolders(); len(u.Removed) != 1 || u.Removed[0] != first.Documents[0].ID {
		t.Fatalf("%+v", u)
	}
	if u := a.RefreshFolders(); len(u.Removed) != 0 {
		t.Fatalf("reported twice: %+v", u)
	}
}
