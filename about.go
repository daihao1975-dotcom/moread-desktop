package main

import (
	_ "embed"
	"runtime"
	"runtime/debug"
	"strings"

	w "github.com/wailsapp/wails/v2/pkg/runtime"
)

// These values are supplied by the release build. Defaults describe an unstamped development build.
var buildVersion = "1.0.10"
var buildCommit = "development"
var buildTime = "development"

//go:embed LICENSE
var ownLicense string

//go:embed THIRD_PARTY_NOTICES.txt
var dependencyNotices string

//go:embed BRANDING.md
var brandingNotice string

//go:embed TRADEMARKS.md
var trademarkNotice string

type AboutDetails struct {
	OpenTiming   OpenTiming `json:"openTiming"`
	Calls        int64      `json:"calls"`
	Version      string     `json:"version"`
	Commit       string     `json:"commit"`
	BuiltAt      string     `json:"builtAt"`
	Platform     string     `json:"platform"`
	GoVersion    string     `json:"goVersion"`
	WailsVersion string     `json:"wailsVersion"`
	Producer     string     `json:"producer"`
	LicenseTitle string     `json:"licenseTitle"`
	// SettingsError is empty unless reading or saving the settings file failed.
	SettingsError string `json:"settingsError"`
}

func (a *App) AboutInfo() AboutDetails {
	a.mu.Lock()
	a.aboutCalls++
	calls := a.aboutCalls
	timing := a.openTiming
	settingsError := a.settingsError
	a.mu.Unlock()
	wailsVersion := "unknown"
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, dep := range info.Deps {
			if dep.Path == "github.com/wailsapp/wails/v2" {
				wailsVersion = dep.Version
				if dep.Replace != nil {
					wailsVersion = dep.Replace.Version
				}
			}
		}
	}
	return AboutDetails{OpenTiming: timing, Calls: calls, Version: buildVersion, Commit: buildCommit, BuiltAt: buildTime, Platform: runtime.GOOS + " / " + runtime.GOARCH, GoVersion: runtime.Version(), WailsVersion: wailsVersion, Producer: "阿屠宰制作", LicenseTitle: strings.SplitN(ownLicense, "\n", 2)[0], SettingsError: settingsError}
}

// releasesURL lists published versions. MoRead never contacts it by itself; the reader opens it on request.
const releasesURL = "https://github.com/daihao1975-dotcom/moread-desktop/releases/latest"

// OpenReleases shows the latest release in the browser, so the reader compares versions there.
func (a *App) OpenReleases() { w.BrowserOpenURL(a.ctx, releasesURL) }
func (a *App) LicenseTexts() map[string]string {
	return map[string]string{"own": ownLicense, "thirdParty": dependencyNotices, "brand": trademarkNotice + "\n\n" + brandingNotice}
}
