//go:build windows

package main

import (
	"os/exec"
	"syscall"

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
func showWindowAfterLaunch()     {}

// revealPath selects the file in an Explorer window. Explorer parses its own command line and
// rejects Go's quoting of "/select,<path>", so the line is written out directly.
func revealPath(p string) error {
	cmd := exec.Command("explorer.exe")
	cmd.SysProcAttr = &syscall.SysProcAttr{CmdLine: `explorer.exe /select,"` + p + `"`}
	return cmd.Start()
}
