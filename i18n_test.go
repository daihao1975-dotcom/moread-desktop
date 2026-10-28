package main

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v2/pkg/menu"
)

func TestLocalesShareEnglishKeys(t *testing.T) {
	if len(locales) != 5 {
		t.Fatalf("languages %d", len(locales))
	}
	for _, lang := range []string{"en", "zh-CN", "zh-TW", "ja", "ko"} {
		if _, ok := locales[lang]; !ok {
			t.Fatalf("missing retained language %s", lang)
		}
	}
	for lang, table := range locales {
		if len(table) != len(locales[fallbackLanguage]) {
			t.Fatalf("%s has %d keys", lang, len(table))
		}
		for key := range locales[fallbackLanguage] {
			if strings.TrimSpace(table[key]) == "" {
				t.Fatalf("%s misses %s", lang, key)
			}
		}
	}
}

func TestLanguageMatching(t *testing.T) {
	for in, want := range map[string]string{"zh-Hans-CN": "zh-CN", "zh_TW": "zh-TW", "zh-Hant-HK": "zh-TW", "ja-JP": "ja", "pt-PT": "", "de-AT": "", "en-GB": "en", "ar": "", "": ""} {
		if got := normalizeLanguage(in); got != want {
			t.Fatalf("%s -> %q want %q", in, got, want)
		}
	}
	if got := pickLanguage([]string{"ar-SA", "ko-KR"}); got != "ko" {
		t.Fatal(got)
	}
	if got := pickLanguage(nil); got != fallbackLanguage {
		t.Fatal(got)
	}
	if translate("ja", "menu.file") != "ファイル" || translate("ru", "menu.file") != "File" || translate("ru", "missing.key") != "missing.key" {
		t.Fatal("translate fallback")
	}
}

func TestMenusFollowLanguage(t *testing.T) {
	for _, lang := range []string{"en", "zh-CN", "zh-TW", "ja", "ko"} {
		root := buildMenu(func(string) menu.Callback { return nil }, appCommands{}, false, func(key string) string { return translate(lang, key) })
		if root.Items[0].Label != translate(lang, "menu.file") {
			t.Fatalf("%s first menu %q", lang, root.Items[0].Label)
		}
	}
}

func TestErrorsCrossAsCodes(t *testing.T) {
	if fail("tooLarge").Error() != "moread:tooLarge" || failDetail("exportFailed", errors.New("disk full")).Error() != "moread:exportFailed|disk full" {
		t.Fatal("coded error format")
	}
	if describe(fs.ErrNotExist) != "moread:notFound" || describe(fs.ErrPermission) != "moread:permission" || describe(errors.New("raw")) != "raw" {
		t.Fatal("describe")
	}
	for code := range map[string]bool{"tooLarge": true, "conflict": true, "notFound": true, "permission": true, "svgDTD": true} {
		if _, ok := locales[fallbackLanguage]["err."+code]; !ok {
			t.Fatalf("missing message for %s", code)
		}
	}
	a, d, _ := fixture(t)
	if _, e := a.ReadImage(d.ID, "../outside.png"); e == nil || !strings.HasPrefix(describe(e), "moread:") {
		t.Fatalf("image error %v", e)
	}
}

func TestSettingsRoundTripAndClamp(t *testing.T) {
	p := filepath.Join(t.TempDir(), "MoRead", "settings.json")
	if s, e := loadSettings(p); e != nil || s.Width != defaultWidth || s.Height != defaultHeight || s.Language != "" {
		t.Fatalf("defaults %+v", s)
	}
	if e := saveSettings(p, settings{Language: "ja", Width: 1500, Height: 900, Maximised: true}); e != nil {
		t.Fatal(e)
	}
	if s, _ := loadSettings(p); s.Language != "ja" || s.Width != 1500 || s.Height != 900 || !s.Maximised {
		t.Fatalf("round trip %+v", s)
	}
	// Windows has no POSIX permission bits to check.
	if st, _ := os.Stat(p); runtime.GOOS != "windows" && st.Mode().Perm() != 0600 {
		t.Fatalf("mode %v", st.Mode())
	}
	os.WriteFile(p, []byte(`{"language":"<x>","width":50,"height":99999}`), 0600)
	if s, _ := loadSettings(p); s.Language != "" || s.Width != defaultWidth || s.Height != defaultHeight {
		t.Fatalf("clamp %+v", s)
	}
	a := NewApp()
	a.settingsFile = p
	if got := a.SetLanguage("zh-Hant"); got != "zh-TW" || a.tr("menu.file") != "檔案" {
		t.Fatal(got)
	}
	if got := a.SetLanguage("klingon"); got != fallbackLanguage {
		t.Fatal(got)
	}
	if got := a.SetLanguage("pt-BR"); got != fallbackLanguage {
		t.Fatalf("removed language selected: %q", got)
	}
}

func TestSettingsProblemsAreReported(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "settings.json")
	os.WriteFile(p, []byte("{not json"), 0600)
	if s, e := loadSettings(p); e == nil || s.Width != defaultWidth {
		t.Fatalf("broken file %+v %v", s, e)
	}
	a := NewApp()
	// A directory in place of the settings file makes every save fail.
	a.settingsFile = filepath.Join(dir, "blocked")
	os.Mkdir(a.settingsFile, 0700)
	a.SetLanguage("fr")
	if a.AboutInfo().SettingsError == "" {
		t.Fatal("save failure hidden")
	}
	a.settingsFile = p
	a.SetLanguage("de")
	if got := a.AboutInfo().SettingsError; got != "" {
		t.Fatalf("stale error %q", got)
	}
}

func TestVersionIsConsistentAcrossManifests(t *testing.T) {
	var w struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	var pkg struct {
		Version string `json:"version"`
	}
	var lock struct {
		Version  string `json:"version"`
		Packages map[string]struct {
			Version string `json:"version"`
		} `json:"packages"`
	}
	b, _ := os.ReadFile("wails.json")
	json.Unmarshal(b, &w)
	b, _ = os.ReadFile("frontend/package.json")
	json.Unmarshal(b, &pkg)
	b, _ = os.ReadFile("frontend/package-lock.json")
	json.Unmarshal(b, &lock)
	if w.Info.ProductVersion != buildVersion || pkg.Version != buildVersion || lock.Version != buildVersion || lock.Packages[""].Version != buildVersion {
		t.Fatalf("wails %s package %s lock %s/%s about %s", w.Info.ProductVersion, pkg.Version, lock.Version, lock.Packages[""].Version, buildVersion)
	}
}
