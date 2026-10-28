package main

import (
	"embed"
	"fmt"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"os"
	"runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	showWindowAfterLaunch()
	app := newDesktopApp()
	state := options.Normal
	if app.settings.Maximised {
		state = options.Maximised
	}
	err := wails.Run(&options.App{
		Title: app.tr("app.name"), Width: app.settings.Width, Height: app.settings.Height, MinWidth: minWidth, MinHeight: minHeight, WindowStartState: state,
		BackgroundColour: startupBackground(),
		AssetServer:      &assetserver.Options{Assets: assets},
		OnStartup:        app.startup, OnDomReady: app.ready, OnBeforeClose: app.beforeClose,
		HideWindowOnClose: runtime.GOOS == "darwin",
		Menu:              app.menu(),
		Bind:              []interface{}{app},
		DragAndDrop:       &options.DragAndDrop{EnableFileDrop: true, DisableWebViewDrop: true},
		Mac:               &mac.Options{TitleBar: mac.TitleBarHiddenInset(), OnFileOpen: app.fileOpen},
		Windows:           &windows.Options{WebviewUserDataPath: "", Theme: windows.SystemDefault, DisablePinchZoom: false},
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// startupBackground matches the system appearance so a dark desktop never flashes a light window while loading.
func startupBackground() *options.RGBA {
	if systemDark() {
		return &options.RGBA{R: 28, G: 31, B: 36, A: 255}
	}
	return &options.RGBA{R: 247, G: 248, B: 250, A: 255}
}
