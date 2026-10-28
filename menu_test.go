package main

import (
	"sort"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v2/pkg/menu"
)

func menuActions(t *testing.T, mac bool) (actions []string, titles []string, hidden, quit, releases int) {
	t.Helper()
	emit := func(action string) menu.Callback {
		return func(*menu.CallbackData) { actions = append(actions, action) }
	}
	others, shown := 0, 0
	root := buildMenu(emit, appCommands{hide: func() { hidden++ }, hideOthers: func() { others++ }, showAll: func() { shown++ }, quit: func() { quit++ }, releases: func() { releases++ }}, mac, func(key string) string { return translate("zh-CN", key) })
	for _, top := range root.Items {
		titles = append(titles, top.Label)
		if top.SubMenu == nil {
			continue
		}
		for _, item := range top.SubMenu.Items {
			if item.Click != nil {
				item.Click(&menu.CallbackData{MenuItem: item})
			}
		}
	}
	if mac && (others != 1 || shown != 1) || !mac && (others != 0 || shown != 0) {
		t.Fatalf("mac=%v hide others=%d show all=%d", mac, others, shown)
	}
	sort.Strings(actions)
	return
}

func TestMenuCoversFrontendActions(t *testing.T) {
	// Checking for updates only opens the public release page in the browser.
	if !strings.HasPrefix(releasesURL, "https://github.com/") || !strings.HasSuffix(releasesURL, "/releases/latest") {
		t.Fatal(releasesURL)
	}
	want := "about,bold,code,export,find,focus,folder,font-bigger,font-reset,font-smaller,indent,italic,link,new,open,outdent,print,read,replace,sample,save,save-as,settings,shortcuts,sidebar,source,split"
	for _, mac := range []bool{true, false} {
		actions, titles, hidden, quit, releases := menuActions(t, mac)
		if got := strings.Join(actions, ","); got != want {
			t.Fatalf("mac=%v actions=%s", mac, got)
		}
		if quit != 1 || releases != 1 {
			t.Fatalf("mac=%v quit items=%d release items=%d", mac, quit, releases)
		}
		if mac && (hidden != 1 || titles[0] != "墨阅 MoRead") {
			t.Fatalf("mac app menu titles=%v hidden=%d", titles, hidden)
		}
		if !mac && (hidden != 0 || titles[0] != "文件") {
			t.Fatalf("windows menu titles=%v hidden=%d", titles, hidden)
		}
	}
}
