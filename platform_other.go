//go:build !darwin && !windows

package main

import "os"

// Only macOS and Windows are released; this keeps tests and tooling building elsewhere.
func systemLanguages() []string  { return []string{os.Getenv("LANG")} }
func systemDark() bool           { return false }
func localizeNativeMenus(string) {}
func hideOtherApps()             {}
func showAllApps()               {}
