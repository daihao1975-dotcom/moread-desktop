package main

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"

	w "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	defaultWidth  = 1280
	defaultHeight = 860
	minWidth      = 760
	minHeight     = 540
)

// settings holds what the native side needs before the interface loads. Document content and history are never stored.
type settings struct {
	Language  string `json:"language,omitempty"`
	Width     int    `json:"width,omitempty"`
	Height    int    `json:"height,omitempty"`
	Maximised bool   `json:"maximised,omitempty"`
}

func settingsPath() string {
	dir, e := os.UserConfigDir()
	if e != nil {
		return ""
	}
	return filepath.Join(dir, "MoRead", "settings.json")
}

// loadSettings falls back to defaults on any problem; a missing file is normal on first launch and not reported.
func loadSettings(p string) (settings, error) {
	s := settings{}
	var problem error
	if p != "" {
		b, e := os.ReadFile(p)
		switch {
		case errors.Is(e, fs.ErrNotExist):
		case e != nil:
			problem = e
		case len(b) > 64*1024:
			problem = fail("tooLarge")
		default:
			if e = json.Unmarshal(b, &s); e != nil {
				s, problem = settings{}, e
			}
		}
	}
	s.Language = normalizeLanguage(s.Language)
	return s.clamped(), problem
}

func (s settings) clamped() settings {
	if s.Width < minWidth || s.Width > 16384 || s.Height < minHeight || s.Height > 16384 {
		s.Width, s.Height = defaultWidth, defaultHeight
	}
	return s
}

func saveSettings(p string, s settings) error {
	if p == "" {
		return nil
	}
	if e := os.MkdirAll(filepath.Dir(p), 0700); e != nil {
		return e
	}
	b, e := json.MarshalIndent(s, "", "  ")
	if e != nil {
		return e
	}
	return atomicWrite(p, b, 0600)
}

// rememberWindow records the window size for the next launch; a maximised window keeps its last normal size.
func (a *App) rememberWindow() {
	if a.ctx == nil || w.WindowIsFullscreen(a.ctx) {
		return
	}
	a.mu.Lock()
	s := a.settings
	a.mu.Unlock()
	s.Maximised = w.WindowIsMaximised(a.ctx)
	if !s.Maximised && !w.WindowIsMinimised(a.ctx) {
		s.Width, s.Height = w.WindowGetSize(a.ctx)
	}
	s = s.clamped()
	a.mu.Lock()
	a.settings = s
	a.mu.Unlock()
	a.noteSettings(saveSettings(a.settingsFile, s))
}

// noteSettings keeps the latest settings problem for the About diagnostics, so a forgotten language or
// window size can be explained. A later successful save clears it.
func (a *App) noteSettings(e error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.settingsError = ""
	if e != nil {
		a.settingsError = e.Error()
	}
}

// SetLanguage switches native menus and dialogs to the interface language and remembers it.
func (a *App) SetLanguage(tag string) string {
	lang := normalizeLanguage(tag)
	if lang == "" {
		lang = fallbackLanguage
	}
	a.mu.Lock()
	changed := a.lang != lang
	a.lang = lang
	a.settings.Language = lang
	s := a.settings
	a.mu.Unlock()
	if changed && a.ctx != nil {
		w.MenuSetApplicationMenu(a.ctx, a.menu())
		w.MenuUpdateApplicationMenu(a.ctx)
		localizeNativeMenus(lang)
	}
	a.noteSettings(saveSettings(a.settingsFile, s))
	return lang
}
