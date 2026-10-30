# MoRead User Guide

Version 1.0.7 · macOS 12 or later (Apple silicon) and Windows 10 / 11 (64-bit)

MoRead is an offline Markdown reader and light editor. Documents are read and saved only on your computer: nothing is uploaded, no network connection is made, and scripts inside documents never run.

## 1. Installation

### macOS

1. Open `MoRead-1.0.7-macOS-arm64.dmg` and drag **MoRead** into **Applications**.
2. If macOS says it cannot verify the developer the first time, Control-click MoRead in Applications and choose **Open**. If it is still blocked, go to **System Settings → Privacy & Security** and click **Open Anyway** near the bottom. You only need to do this once.
3. To open every Markdown file with MoRead, select any `.md` file in Finder → **Get Info** → **Open with: MoRead** → **Change All**.

### Windows

1. Run `MoRead-1.0.7-Windows-x64.exe`. No installation is needed; keep it in any folder and create a shortcut if you like.
2. Microsoft Edge WebView2 Runtime is required (included in Windows 11 and up-to-date Windows 10). If it is missing, MoRead tells you and exits; download it from Microsoft.
3. If SmartScreen appears on first run, click **More info → Run anyway**.

## 2. Opening documents

| How | Notes |
| --- | --- |
| Open File | Toolbar or ⌘ / Ctrl + O; select several files at once |
| Open Folder | Lists every Markdown file in the folder and its subfolders, up to 2,000. Files created, renamed or deleted in other apps show up when you come back to MoRead |
| Drag and drop | Drop files or folders onto the window |
| From Finder / Explorer | Open `.md`, `.markdown`, `.mdown` or `.mkd` files with MoRead |

The **Files** tab supports logical folders. Use the folder-plus button to create a folder or a subfolder inside the selected folder. Use the document-plus button or a folder’s **⋯** menu to create a document or add existing documents. A new document appears as an unsaved draft; you still choose its disk location when saving.

Use **⋯**, the context menu or drag and drop to organise files and folders. Drop onto **Ungrouped / Root** to return to the top level. Filtering matches document and folder names and reveals matching ancestors. Removing a folder promotes its documents and subfolders to its parent. Removing a document from the list keeps the disk file. These actions change only the local library index; they never move, rename or delete disk files. Folders, collapsed states and saved file references survive a restart; unsaved drafts must be saved first.

The **Outline** tab lists the headings of the current document; click one to jump there. The heading you are reading is highlighted.

Each document can be up to 10 MB. UTF-8, UTF-8 with BOM and UTF-16 LE / BE are supported; saving keeps the original encoding and line endings (LF / CRLF).

## 3. Views

- **Read** (⌘ / Ctrl + 1): the formatted document.
- **Source** (⌘ / Ctrl + 2): edit the Markdown text. Headings, list markers, code, links and emphasis are coloured; documents longer than about 150,000 characters, and unusually long lines or runs of backticks, stay plain so typing stays smooth.
- **Split** (⌘ / Ctrl + 3): edit on the left with a live preview on the right by default; both sides scroll together, aligned by heading. Use “Swap left and right panes” in the toolbar to exchange their positions. Settings also offers pane order and left pane width (20%–80%). Drag the divider to resize, double-click it to reset. Order and width are remembered for the next launch.

Double-click empty space in the title bar to maximise or restore the window. Focus mode hides the sidebar and status bar; press Esc to leave.

## 4. Editing

| Action | macOS | Windows |
| --- | --- | --- |
| Bold / italic / inline code | ⌘B / ⌘I / ⌘E | Ctrl+B / Ctrl+I / Ctrl+E |
| Insert link | ⌘K | Ctrl+K |
| Indent / outdent | Tab / ⇧Tab (or ⌘] / ⌘[) | Tab / Shift+Tab (or Ctrl+] / Ctrl+[) |
| Continue a list or quote | Enter at the end of an item; Enter on an empty item ends the list | Same |
| Find | ⌘F | Ctrl+F |
| Find and replace | ⌥⌘F | Ctrl+H |
| Undo / redo | ⌘Z / ⇧⌘Z | Ctrl+Z / Ctrl+Y |

Pressing ⌘B / Ctrl+B again on bold text removes the bold. Tab nests a list item under the one above it and restarts numbered lists at 1.

Find and replace works on the Markdown text, literally and ignoring case. **Replace all** can be undone in one step.

Press ⌘V / Ctrl+V in the Source or Split editor to paste screenshots or PNG, JPEG and GIF images from the clipboard. New documents first ask where to save; cancelling inserts nothing. Images are saved in an `assets` folder beside the Markdown file and relative references replace the current selection or are inserted at the caret, as one undoable edit. Paste up to 20 images and 20 MB in total at once. Include the `assets` folder when moving or sharing the document, or copy it when saving to another directory. Removing a reference or undoing a paste keeps the image files.

### Saving and safeguards

- ⌘ / Ctrl + S saves, ⇧⌘S / Ctrl+Shift+S saves as. New documents ask where to save the first time.
- If you switch documents or close the window with unsaved changes, MoRead asks whether to save, discard or cancel.
- Saving writes a temporary file first and then replaces the original, so an interrupted save never damages the file.
- If another program changes the file: an unedited document reloads automatically; an edited one shows a warning and saving is blocked so the other change is not overwritten. Use **Save As** to keep your version.

## 5. Supported Markdown

GitHub-style tables, task lists, strikethrough and autolinks; highlighted code blocks with a copy button; footnotes, definition lists, abbreviations, sub- and superscript, ==highlight== and emoji; GitHub alerts (`> [!NOTE]` and others); KaTeX math (`$…$`, `$$…$$`); Mermaid flowcharts, sequence diagrams and more; safe native HTML such as `<details>` and `<kbd>`.

**Images**: PNG, JPEG, GIF, WebP, AVIF and safe static SVG, with paths relative to the document's folder. Each image may be up to 20 MB and the images of one document up to 32 MB in total. Click an image to enlarge it. Remote images are not loaded; click the placeholder link to open one in your browser.

**Links**: web and email links open in your browser or mail app. Relative links to other Markdown files open in MoRead, but only within folders you opened.

## 6. Export and print

- **File → Export Offline HTML** creates one HTML file with images, math fonts and diagrams embedded, ready to view offline or send (up to 28 MB).
- **File → Print / Save as PDF** (⌘ / Ctrl + P) uses the system print dialog, where you can also save a PDF. Check paper orientation and margins in the print preview.
- **Add contents when printing** (in Settings, off by default) puts a contents page before documents with several headings, listing up to three heading levels. System printing cannot create PDF bookmarks, so this page is how readers find sections on paper.

## 7. Reading settings

Click **Reading settings** at the right of the toolbar (⌘ / Ctrl + ,):

- **Theme**: System, Light, Paper or Dark.
- **Font size**: 13–24, also from the View menu or ⌘ / Ctrl + = / - / 0.
- **Text width**: Fluid, Compact, Comfortable or Wide.
- **Language**: system default, or 简体中文, 繁體中文, English, 日本語 or 한국어. Menus, dialogs, messages and the built-in example all switch.
- **Remember recent files**: off by default. When it is on and the sidebar is empty, it lists the last 10 files or folders you opened; click one to open it again. Items that were moved or deleted drop off the list. Turning it off clears the list at once.

MoRead remembers these preferences, the window size, logical folders, collapsed states and file path references in a local `library.json`, never document contents. **Remember recent files** independently controls the recent list; turning it off clears that list without changing sidebar folders.

## 8. Questions

**Some files are missing after opening a folder.** Hidden folders (starting with `.`), `node_modules`, `vendor` and symbolic links are skipped. Files over 10 MB or that cannot be read are listed with the reason.

**Images do not show.** A new document has no folder until it is saved, so save it first. Images must be inside the folder you opened.

**"Another program changed the file."** Saving is blocked so the other change is not overwritten. Use Save As for your version, or reopen the file and merge the changes.

**MoRead does not start on Windows.** Check that Microsoft Edge WebView2 Runtime is installed.

**Version and licences.** macOS: **MoRead → About MoRead and Licenses**; Windows: **Help → About MoRead and Licenses**. All shortcuts are under **Help → Keyboard Shortcuts** (⌘ / Ctrl + /).

**Is there a newer version?** MoRead never checks by itself. Choose **Check for Updates…** in the same menu, or **Check for updates** in the About window, to open the release page in your browser and compare it with the version shown in About.

### macOS window controls

- Red close button or ⌘W closes the reader window while keeping MoRead and unsaved edits in memory. Click MoRead in the Dock or open a document to show it again.
- Yellow button or ⌘M minimizes the window.
- ⌘Q quits MoRead and asks you to save or discard unsaved changes.
- Use ⌘ for application shortcuts on Mac; Control remains available for native text editing.
