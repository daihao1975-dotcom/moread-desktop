//go:build windows

package main

import (
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

func systemLanguages() []string {
	langs, e := windows.GetUserPreferredUILanguages(windows.MUI_LANGUAGE_NAME)
	if e != nil {
		return nil
	}
	return langs
}

// systemDark reports the Windows app theme ("Choose your app mode").
func systemDark() bool {
	k, e := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`, registry.QUERY_VALUE)
	if e != nil {
		return false
	}
	defer k.Close()
	v, _, e := k.GetIntegerValue("AppsUseLightTheme")
	return e == nil && v == 0
}

func localizeNativeMenus(string) {}
func hideOtherApps()             {}
func showAllApps()               {}
