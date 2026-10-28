package main

import (
	"os"
	"path/filepath"
)

const maxRecent = 10

type RecentItem struct {
	Name   string `json:"name"`
	Path   string `json:"path"`
	Folder bool   `json:"folder"`
}
type RecentState struct {
	Enabled bool         `json:"enabled"`
	Items   []RecentItem `json:"items"`
}

// recentState copies the list for the interface; the caller holds a.mu.
func (a *App) recentState() RecentState {
	items := []RecentItem{}
	for _, r := range a.settings.Recent {
		items = append(items, RecentItem{Name: filepath.Base(r.Path), Path: r.Path, Folder: r.Folder})
	}
	return RecentState{Enabled: a.settings.RememberRecent, Items: items}
}

// Recent lists recently opened files and folders. The list stays empty unless the reader turned it on.
func (a *App) Recent() RecentState {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.recentState()
}

// SetRememberRecent turns the list on or off; turning it off forgets every path at once.
func (a *App) SetRememberRecent(on bool) RecentState {
	a.mu.Lock()
	a.settings.RememberRecent = on
	if !on {
		a.settings.Recent = nil
	}
	s, out := a.settings, a.recentState()
	a.mu.Unlock()
	a.noteSettings(saveSettings(a.settingsFile, s))
	return out
}

// remember puts an opened path at the top of the list when the reader asked for one.
func (a *App) remember(p string, folder bool) {
	real, e := filepath.EvalSymlinks(p)
	if e == nil {
		real, e = filepath.Abs(real)
	}
	if e != nil {
		return
	}
	a.mu.Lock()
	if !a.settings.RememberRecent {
		a.mu.Unlock()
		return
	}
	list := []recentEntry{{Path: real, Folder: folder}}
	for _, r := range a.settings.Recent {
		if r.Path != real && len(list) < maxRecent {
			list = append(list, r)
		}
	}
	a.settings.Recent = list
	s := a.settings
	a.mu.Unlock()
	a.noteSettings(saveSettings(a.settingsFile, s))
}

// forget drops a path that can no longer be opened.
func (a *App) forget(p string) {
	a.mu.Lock()
	list := []recentEntry{}
	for _, r := range a.settings.Recent {
		if r.Path != p {
			list = append(list, r)
		}
	}
	a.settings.Recent = list
	s := a.settings
	a.mu.Unlock()
	a.noteSettings(saveSettings(a.settingsFile, s))
}

// OpenRecent reopens an entry. Only paths already in the list are accepted, so the interface cannot ask
// for any other file; a moved or deleted entry is removed from the list.
func (a *App) OpenRecent(p string) (OpenResult, error) {
	a.mu.Lock()
	var entry *recentEntry
	for _, r := range a.settings.Recent {
		if r.Path == p {
			entry = &r
			break
		}
	}
	a.mu.Unlock()
	if entry == nil {
		return OpenResult{}, fail("recentUnknown")
	}
	st, e := os.Stat(p)
	if e != nil || st.IsDir() != entry.Folder {
		a.forget(p)
		return OpenResult{}, fail("recentMissing")
	}
	return a.registerPaths([]string{p}), nil
}
