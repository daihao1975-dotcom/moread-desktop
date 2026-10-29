package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func libraryFixture(t *testing.T) (*App, Document, string, LibraryState) {
	t.Helper()
	a, d, p := fixture(t)
	a.settingsFile = filepath.Join(t.TempDir(), "settings.json")
	s := LibraryState{
		Folders: []LibraryFolder{{ID: "work", Name: "工作"}, {ID: "project", Name: "项目", Parent: "work", Collapsed: true}},
		Entries: []LibraryEntry{{ID: d.ID, Folder: "project"}},
	}
	return a, d, p, s
}

func TestLibraryRestoresReferencesWithoutStoringContentOrMovingFiles(t *testing.T) {
	a, d, p, s := libraryFixture(t)
	before, _ := os.ReadFile(p)
	if err := a.SetLibrary(s); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(a.libraryPath())
	if strings.Contains(string(data), d.Content) || strings.Contains(string(data), "content") || strings.Contains(string(data), d.Hash) {
		t.Fatal("document content or baseline persisted")
	}
	info, _ := os.Stat(a.libraryPath())
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0600 {
		t.Fatal("library must be private")
	}
	next := NewApp()
	next.settingsFile = a.settingsFile
	loaded, err := next.GetLibrary()
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Documents) != 1 || loaded.Documents[0].Content != "" || loaded.Entries[0].Folder != "project" || !loaded.Folders[1].Collapsed {
		t.Fatalf("unexpected library: %+v", loaded)
	}
	reread, err := next.ReadDocument(d.ID)
	if err != nil || reread.Content != d.Content {
		t.Fatalf("restore: %+v %v", reread, err)
	}
	// Rename/reparent/remove classification and verify physical contents and path.
	s.Folders = []LibraryFolder{{ID: "project", Name: "新名称"}}
	if err := next.SetLibrary(s); err != nil {
		t.Fatal(err)
	}
	if err := next.SetLibrary(LibraryState{Folders: []LibraryFolder{}, Entries: []LibraryEntry{}}); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(p)
	if err != nil || string(after) != string(before) {
		t.Fatal("classification changed disk document")
	}
}

func TestLibraryRejectsUnknownFilesAndInvalidTreesWithoutOverwriting(t *testing.T) {
	a, _, _, s := libraryFixture(t)
	if err := a.SetLibrary(s); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(a.libraryPath())
	cases := []LibraryState{
		{Folders: s.Folders, Entries: []LibraryEntry{{ID: "unselected"}}},
		{Folders: []LibraryFolder{{ID: "a", Name: "A", Parent: "b"}, {ID: "b", Name: "B", Parent: "a"}}},
		{Folders: []LibraryFolder{{ID: "a", Name: "A", Parent: "missing"}}},
		{Folders: []LibraryFolder{{ID: "a", Name: "A"}, {ID: "a", Name: "B"}}},
		{Folders: []LibraryFolder{{ID: "a", Name: "\n"}}},
		{Entries: []LibraryEntry{{ID: s.Entries[0].ID, Folder: "missing"}}},
		{Entries: []LibraryEntry{s.Entries[0], s.Entries[0]}},
	}
	for i, state := range cases {
		if err := a.SetLibrary(state); err == nil {
			t.Fatalf("invalid state %d accepted", i)
		}
		after, _ := os.ReadFile(a.libraryPath())
		if string(before) != string(after) {
			t.Fatal("valid library overwritten")
		}
	}
}

func TestLibraryRetainsMissingReferencesAndPreservesRelativeBoundary(t *testing.T) {
	a, d, p, s := libraryFixture(t)
	if err := a.SetLibrary(s); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(p, p+".moved"); err != nil {
		t.Fatal(err)
	}
	next := NewApp()
	next.settingsFile = a.settingsFile
	loaded, err := next.GetLibrary()
	if err != nil || len(loaded.Documents) != 1 {
		t.Fatalf("missing reference lost: %v", err)
	}
	if _, err := next.ReadDocument(d.ID); err == nil {
		t.Fatal("missing file read succeeded")
	}
	if err := os.Rename(p+".moved", p); err != nil {
		t.Fatal(err)
	}
	if _, err := next.ReadDocument(d.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := next.relativePath(d.ID, "../outside.md"); err == nil {
		t.Fatal("restored reference widened boundary")
	}
}

func TestLibraryRejectsTamperedPathsWithoutPartialAuthorisation(t *testing.T) {
	a, _, p, s := libraryFixture(t)
	if err := a.SetLibrary(s); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(a.libraryPath())
	var disk libraryDisk
	json.Unmarshal(data, &disk)
	disk.Files = append(disk.Files, libraryReference{ID: "forged", Path: p, Root: filepath.Dir(p)})
	data, _ = json.Marshal(disk)
	if err := os.WriteFile(a.libraryPath(), data, 0600); err != nil {
		t.Fatal(err)
	}
	next := NewApp()
	next.settingsFile = a.settingsFile
	if _, err := next.GetLibrary(); err == nil {
		t.Fatal("tampered path accepted")
	}
	if len(next.files) != 0 {
		t.Fatal("partially authorised invalid library")
	}
}

func TestLibraryEmptyFirstLaunchAndCorruptData(t *testing.T) {
	a := NewApp()
	a.settingsFile = filepath.Join(t.TempDir(), "settings.json")
	loaded, err := a.GetLibrary()
	if err != nil || len(loaded.Folders) != 0 || len(loaded.Documents) != 0 {
		t.Fatal("empty library failed")
	}
	if err := os.WriteFile(a.libraryPath(), []byte("{invalid"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := a.GetLibrary(); err == nil {
		t.Fatal("corrupt data silently accepted")
	}
}
