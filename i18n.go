package main

import (
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"path"
	"strings"
)

// The interface, native menus and dialogs share one set of language files with the frontend.
//
//go:embed frontend/src/locales/*.json
var localeFiles embed.FS

const fallbackLanguage = "en"

var locales = loadLocales()

func loadLocales() map[string]map[string]string {
	out := map[string]map[string]string{}
	entries, _ := fs.ReadDir(localeFiles, "frontend/src/locales")
	for _, entry := range entries {
		b, e := localeFiles.ReadFile(path.Join("frontend/src/locales", entry.Name()))
		if e != nil {
			continue
		}
		table := map[string]string{}
		if json.Unmarshal(b, &table) == nil {
			out[strings.TrimSuffix(entry.Name(), ".json")] = table
		}
	}
	return out
}

// normalizeLanguage maps a BCP 47 tag onto a bundled language, mirroring matchLanguage in i18n.js.
func normalizeLanguage(tag string) string {
	tag = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(tag), "_", "-"))
	if tag == "" {
		return ""
	}
	if strings.HasPrefix(tag, "zh") {
		for _, traditional := range []string{"hant", "-tw", "-hk", "-mo"} {
			if strings.Contains(tag, traditional) {
				return "zh-TW"
			}
		}
		return "zh-CN"
	}
	base := strings.SplitN(tag, "-", 2)[0]
	if _, ok := locales[base]; ok {
		return base
	}
	return ""
}

// pickLanguage returns the first preferred language MoRead ships, or English.
func pickLanguage(preferred []string) string {
	for _, tag := range preferred {
		if lang := normalizeLanguage(tag); lang != "" {
			return lang
		}
	}
	return fallbackLanguage
}

func translate(lang, key string) string {
	if s, ok := locales[lang][key]; ok {
		return s
	}
	if s, ok := locales[fallbackLanguage][key]; ok {
		return s
	}
	return key
}

func (a *App) tr(key string) string {
	a.mu.Lock()
	lang := a.lang
	a.mu.Unlock()
	return translate(lang, key)
}

// Errors cross to the frontend as stable codes, which the interface shows in the reader's language.
type codedError struct{ code, detail string }

func (e codedError) Error() string {
	if e.detail != "" {
		return "moread:" + e.code + "|" + e.detail
	}
	return "moread:" + e.code
}
func fail(code string) error { return codedError{code: code} }
func failDetail(code string, e error) error {
	return codedError{code: code, detail: e.Error()}
}

// describe turns common file-system failures into codes and keeps any other message as it is.
func describe(e error) string {
	var coded codedError
	switch {
	case errors.As(e, &coded):
		return coded.Error()
	case errors.Is(e, fs.ErrNotExist):
		return fail("notFound").Error()
	case errors.Is(e, fs.ErrPermission):
		return fail("permission").Error()
	}
	return e.Error()
}
