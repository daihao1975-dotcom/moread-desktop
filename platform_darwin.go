//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>
#include <stdlib.h>

// Wails fixes the titles of its Edit and Window role menus in English. Keep their native
// selectors and only replace the visible titles, so copy, paste and undo still reach the web view.
static void moreadRetitle(NSMenu *menu, NSDictionary<NSString *, NSString *> *titles) {
	NSString *own = titles[menu.title];
	if (own != nil) menu.title = own;
	for (NSMenuItem *item in menu.itemArray) {
		NSString *title = titles[item.title];
		if (title != nil) item.title = title;
		if (item.submenu != nil) moreadRetitle(item.submenu, titles);
	}
}

// pairs holds "English\tTranslation" lines.
static void moreadLocalizeMenus(const char *pairs) {
	NSMutableDictionary<NSString *, NSString *> *titles = [NSMutableDictionary dictionary];
	for (NSString *line in [[NSString stringWithUTF8String:pairs] componentsSeparatedByString:@"\n"]) {
		NSArray<NSString *> *pair = [line componentsSeparatedByString:@"\t"];
		if (pair.count == 2) titles[pair[0]] = pair[1];
	}
	dispatch_async(dispatch_get_main_queue(), ^{
		NSMenu *main = NSApp.mainMenu;
		if (main != nil) moreadRetitle(main, titles);
	});
}

static void moreadHideOthers(void) {
	dispatch_async(dispatch_get_main_queue(), ^{ [NSApp hideOtherApplications:nil]; });
}

static void moreadShowAll(void) {
	dispatch_async(dispatch_get_main_queue(), ^{ [NSApp unhideAllApplications:nil]; });
}

static int moreadSystemDark(void) {
	return [[[NSUserDefaults standardUserDefaults] stringForKey:@"AppleInterfaceStyle"] isEqualToString:@"Dark"];
}

static char *moreadPreferredLanguages(void) {
	return strdup([[NSLocale preferredLanguages] componentsJoinedByString:@"\n"].UTF8String);
}
*/
import "C"

import (
	"strings"
	"unsafe"
)

// nativeMenuTitles are the English titles Wails gives its role menus.
var nativeMenuTitles = []string{"Edit", "Undo", "Redo", "Cut", "Copy", "Paste", "Paste and Match Style", "Delete", "Select All", "Speech", "Start Speaking", "Stop Speaking", "Window", "Minimize", "Zoom", "Full Screen"}

func localizeNativeMenus(lang string) {
	pairs := make([]string, 0, len(nativeMenuTitles))
	for _, title := range nativeMenuTitles {
		pairs = append(pairs, title+"\t"+translate(lang, "native."+title))
	}
	s := C.CString(strings.Join(pairs, "\n"))
	defer C.free(unsafe.Pointer(s))
	C.moreadLocalizeMenus(s)
}

func systemLanguages() []string {
	s := C.moreadPreferredLanguages()
	defer C.free(unsafe.Pointer(s))
	return strings.Split(C.GoString(s), "\n")
}

func hideOtherApps()   { C.moreadHideOthers() }
func showAllApps()     { C.moreadShowAll() }
func systemDark() bool { return C.moreadSystemDark() != 0 }
