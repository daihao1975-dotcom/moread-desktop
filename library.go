package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf8"
)

// The library contains references only. Organising it never writes to documents.
type LibraryFolder struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Parent    string `json:"parent"`
	Collapsed bool   `json:"collapsed"`
}
type LibraryEntry struct {
	ID     string `json:"id"`
	Folder string `json:"folder"`
}
type LibraryState struct {
	Folders []LibraryFolder `json:"folders"`
	Entries []LibraryEntry  `json:"entries"`
}
type LibraryResult struct {
	LibraryState
	Documents []Document `json:"documents"`
}
type libraryReference struct {
	ID     string `json:"id"`
	Path   string `json:"path"`
	Root   string `json:"root"`
	Folder string `json:"folder"`
}
type libraryDisk struct {
	Version int                `json:"version"`
	Folders []LibraryFolder    `json:"folders"`
	Files   []libraryReference `json:"files"`
}

func validateLibrary(s LibraryState) error {
	if len(s.Folders) > 1000 || len(s.Entries) > 10000 {
		return fail("libraryInvalid")
	}
	folders := make(map[string]LibraryFolder)
	for _, f := range s.Folders {
		if f.ID == "" || len(f.ID) > 80 || strings.TrimSpace(f.Name) == "" || utf8.RuneCountInString(f.Name) > 160 || strings.IndexFunc(f.Name, unicode.IsControl) >= 0 {
			return fail("libraryInvalid")
		}
		if _, ok := folders[f.ID]; ok {
			return fail("libraryInvalid")
		}
		folders[f.ID] = f
	}
	for _, f := range s.Folders {
		seen := map[string]bool{f.ID: true}
		for p := f.Parent; p != ""; {
			parent, ok := folders[p]
			if !ok || seen[p] || len(seen) >= 32 {
				return fail("libraryInvalid")
			}
			seen[p] = true
			p = parent.Parent
		}
	}
	seen := make(map[string]bool)
	for _, e := range s.Entries {
		if e.ID == "" || seen[e.ID] {
			return fail("libraryInvalid")
		}
		if _, ok := folders[e.Folder]; e.Folder != "" && !ok {
			return fail("libraryInvalid")
		}
		seen[e.ID] = true
	}
	return nil
}

func (a *App) libraryPath() string {
	if a.settingsFile == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(a.settingsFile), "library.json")
}

// GetLibrary restores only previously selected file references, without reading
// document bodies. Missing files stay visible so their classification is retained.
func (a *App) GetLibrary() (LibraryResult, error) {
	a.libraryMu.Lock()
	defer a.libraryMu.Unlock()
	out := LibraryResult{LibraryState: LibraryState{Folders: []LibraryFolder{}, Entries: []LibraryEntry{}}, Documents: []Document{}}
	p := a.libraryPath()
	if p == "" {
		return out, nil
	}
	b, err := readLimited(p, 4*1024*1024)
	if os.IsNotExist(err) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	var disk libraryDisk
	if json.Unmarshal(b, &disk) != nil || disk.Version != 1 {
		return out, fail("libraryInvalid")
	}
	out.Folders = disk.Folders
	for _, f := range disk.Files {
		if !filepath.IsAbs(f.Path) || !filepath.IsAbs(f.Root) || filepath.Clean(f.Path) != f.Path || filepath.Clean(f.Root) != f.Root || !within(f.Root, f.Path) || !isMarkdown(f.Path) || f.ID != hashBytes([]byte(f.Path)) {
			return out, fail("libraryInvalid")
		}
		out.Entries = append(out.Entries, LibraryEntry{ID: f.ID, Folder: f.Folder})
		rel, _ := filepath.Rel(f.Root, f.Path)
		out.Documents = append(out.Documents, Document{ID: f.ID, Name: filepath.Base(f.Path), Relative: filepath.ToSlash(rel)})
	}
	if err := validateLibrary(out.LibraryState); err != nil {
		return out, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, f := range disk.Files {
		if _, ok := a.files[f.ID]; !ok {
			a.files[f.ID] = &record{Path: f.Path, Root: f.Root}
		}
	}
	return out, nil
}

// SetLibrary accepts IDs already authorised by the native open/save dialogs;
// the frontend cannot supply new disk paths or widen an authorised root.
func (a *App) SetLibrary(s LibraryState) error {
	a.libraryMu.Lock()
	defer a.libraryMu.Unlock()
	if err := validateLibrary(s); err != nil {
		return err
	}
	disk := libraryDisk{Version: 1, Folders: s.Folders, Files: []libraryReference{}}
	a.mu.Lock()
	for _, e := range s.Entries {
		r, ok := a.files[e.ID]
		if !ok {
			a.mu.Unlock()
			return fail("notAuthorized")
		}
		disk.Files = append(disk.Files, libraryReference{ID: e.ID, Path: r.Path, Root: r.Root, Folder: e.Folder})
	}
	a.mu.Unlock()
	p := a.libraryPath()
	if p == "" {
		return nil
	}
	b, err := json.MarshalIndent(disk, "", "  ")
	if err != nil {
		return err
	}
	if len(b) > 4*1024*1024 {
		return fail("libraryInvalid")
	}
	if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
		return err
	}
	return atomicWrite(p, b, 0600)
}
