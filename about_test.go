package main

import (
	"strings"
	"testing"
)

func TestAboutAndLicenseTexts(t *testing.T) {
	a := NewApp()
	info := a.AboutInfo()
	if info.Producer != "阿屠宰制作" || info.Version != "1.0.7" || info.GoVersion == "" || info.Platform == "" {
		t.Fatalf("bad about: %+v", info)
	}
	texts := a.LicenseTexts()
	if !strings.Contains(texts["own"], "MIT License") || !strings.Contains(texts["brand"], "fork") || !strings.Contains(texts["thirdParty"], "SIL OPEN FONT LICENSE Version 1.1") || !strings.Contains(texts["thirdParty"], "Reserved Font Name KaTeX_Main") || strings.Contains(texts["thirdParty"], "<dates>") {
		t.Fatal("incomplete or templated license")
	}
	if !strings.Contains(texts["thirdParty"], "Apache License") || !strings.Contains(texts["thirdParty"], "Mozilla Public License") || !strings.Contains(texts["thirdParty"], "ISC License") {
		t.Fatal("missing original third-party license")
	}
}
