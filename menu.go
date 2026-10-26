package main

import (
	goruntime "runtime"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	w "github.com/wailsapp/wails/v2/pkg/runtime"
)

// emit forwards a menu command to the frontend, which owns every document action.
func (a *App) emit(action string) menu.Callback {
	return func(*menu.CallbackData) {
		if a.ctx != nil {
			w.EventsEmit(a.ctx, "menu", action)
		}
	}
}

func (a *App) menu() *menu.Menu {
	a.mu.Lock()
	lang := a.lang
	a.mu.Unlock()
	return buildMenu(a.emit, appCommands{hide: func() { w.Hide(a.ctx) }, hideOthers: hideOtherApps, showAll: showAllApps, quit: func() { w.Quit(a.ctx) }}, goruntime.GOOS == "darwin", func(key string) string { return translate(lang, key) })
}

// appCommands are the window-level actions the native menu runs itself instead of sending to the frontend.
type appCommands struct{ hide, hideOthers, showAll, quit func() }

func run(f func()) menu.Callback { return func(*menu.CallbackData) { f() } }

func buildMenu(emit func(string) menu.Callback, cmd appCommands, mac bool, tr func(string) string) *menu.Menu {
	root := menu.NewMenu()
	if mac {
		// macOS shows the first submenu as the application menu.
		app := root.AddSubmenu(tr("menu.app"))
		app.AddText(tr("menu.about"), nil, emit("about"))
		app.AddSeparator()
		app.AddText(tr("menu.settings"), keys.CmdOrCtrl(","), emit("settings"))
		app.AddSeparator()
		app.AddText(tr("menu.hide"), keys.CmdOrCtrl("h"), run(cmd.hide))
		app.AddText(tr("menu.hideOthers"), keys.Combo("h", keys.CmdOrCtrlKey, keys.OptionOrAltKey), run(cmd.hideOthers))
		app.AddText(tr("menu.showAll"), nil, run(cmd.showAll))
		app.AddSeparator()
		app.AddText(tr("menu.quit"), keys.CmdOrCtrl("q"), run(cmd.quit))
	}

	file := root.AddSubmenu(tr("menu.file"))
	file.AddText(tr("menu.new"), keys.CmdOrCtrl("n"), emit("new"))
	file.AddText(tr("menu.open"), keys.CmdOrCtrl("o"), emit("open"))
	file.AddText(tr("menu.folder"), nil, emit("folder"))
	file.AddSeparator()
	file.AddText(tr("menu.save"), keys.CmdOrCtrl("s"), emit("save"))
	file.AddText(tr("menu.saveAs"), keys.Combo("s", keys.CmdOrCtrlKey, keys.ShiftKey), emit("save-as"))
	file.AddSeparator()
	file.AddText(tr("menu.export"), nil, emit("export"))
	file.AddText(tr("menu.print"), keys.CmdOrCtrl("p"), emit("print"))
	if !mac {
		file.AddSeparator()
		file.AddText(tr("menu.exit"), nil, run(cmd.quit))
	}

	if mac {
		// Native cut/copy/paste only work through the role menu, whose labels Wails fixes in English.
		root.Append(menu.EditMenu())
	}

	format := root.AddSubmenu(tr("menu.format"))
	format.AddText(tr("menu.bold"), keys.CmdOrCtrl("b"), emit("bold"))
	format.AddText(tr("menu.italic"), keys.CmdOrCtrl("i"), emit("italic"))
	format.AddText(tr("menu.code"), keys.CmdOrCtrl("e"), emit("code"))
	format.AddText(tr("menu.link"), keys.CmdOrCtrl("k"), emit("link"))
	format.AddSeparator()
	format.AddText(tr("menu.indent"), keys.CmdOrCtrl("]"), emit("indent"))
	format.AddText(tr("menu.outdent"), keys.CmdOrCtrl("["), emit("outdent"))

	view := root.AddSubmenu(tr("menu.view"))
	view.AddText(tr("menu.read"), keys.CmdOrCtrl("1"), emit("read"))
	view.AddText(tr("menu.source"), keys.CmdOrCtrl("2"), emit("source"))
	view.AddText(tr("menu.split"), keys.CmdOrCtrl("3"), emit("split"))
	view.AddSeparator()
	view.AddText(tr("menu.find"), keys.CmdOrCtrl("f"), emit("find"))
	replace := keys.Combo("f", keys.CmdOrCtrlKey, keys.OptionOrAltKey)
	if !mac {
		replace = keys.CmdOrCtrl("h")
	}
	view.AddText(tr("menu.replace"), replace, emit("replace"))
	view.AddText(tr("menu.sidebar"), nil, emit("sidebar"))
	view.AddText(tr("menu.focus"), nil, emit("focus"))
	view.AddSeparator()
	view.AddText(tr("menu.bigger"), keys.CmdOrCtrl("="), emit("font-bigger"))
	view.AddText(tr("menu.smaller"), keys.CmdOrCtrl("-"), emit("font-smaller"))
	view.AddText(tr("menu.resetSize"), keys.CmdOrCtrl("0"), emit("font-reset"))
	if !mac {
		view.AddSeparator()
		view.AddText(tr("menu.settings"), keys.CmdOrCtrl(","), emit("settings"))
	}

	if mac {
		root.Append(menu.WindowMenu())
	}

	help := root.AddSubmenu(tr("menu.help"))
	help.AddText(tr("menu.shortcuts"), keys.CmdOrCtrl("/"), emit("shortcuts"))
	help.AddText(tr("menu.sample"), nil, emit("sample"))
	if !mac {
		help.AddSeparator()
		help.AddText(tr("menu.about"), nil, emit("about"))
	}
	return root
}
