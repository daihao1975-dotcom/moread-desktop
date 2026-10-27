package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	w "github.com/wailsapp/wails/v2/pkg/runtime"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf16"
	"unicode/utf8"
)

const maxDocument = 10 * 1024 * 1024
const maxImage = 20 * 1024 * 1024

type Document struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Relative string `json:"relative"`
	Content  string `json:"content"`
	Encoding string `json:"encoding"`
	Hash     string `json:"hash"`
}
type OpenResult struct {
	Documents []Document `json:"documents"`
	Skipped   []string   `json:"skipped"`
}
type SaveResult struct {
	Cancelled bool     `json:"cancelled"`
	Document  Document `json:"document"`
}
type record struct{ Path, Root string }
type App struct {
	openTiming     OpenTiming
	timingDocument string
	ctx            context.Context
	mu             sync.Mutex
	saveMu         sync.Mutex
	files          map[string]*record
	pending        []string
	domReady       bool
	dirty          bool
	aboutCalls     int64
	closePending   bool
	quitApproved   bool
	lang           string
	settings       settings
	settingsFile   string
}

func NewApp() *App { return &App{files: make(map[string]*record), lang: fallbackLanguage} }

// newDesktopApp restores the saved language and window size, or follows the system language on first launch.
func newDesktopApp() *App {
	a := NewApp()
	a.settingsFile = settingsPath()
	a.settings = loadSettings(a.settingsFile)
	a.lang = a.settings.Language
	if a.lang == "" {
		a.lang = pickLanguage(systemLanguages())
	}
	return a
}
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	for _, p := range os.Args[1:] {
		if !strings.HasPrefix(p, "-") {
			a.pending = append(a.pending, p)
		}
	}
	w.OnFileDrop(ctx, func(x, y int, paths []string) { a.sendPaths(paths) })
}
func (a *App) ready(ctx context.Context) {
	a.mu.Lock()
	lang := a.lang
	a.mu.Unlock()
	localizeNativeMenus(lang)
}
func (a *App) FrontendReady() OpenResult {
	a.mu.Lock()
	a.domReady = true
	p := a.pending
	a.pending = nil
	pendingClose := a.closePending && !a.quitApproved
	a.mu.Unlock()
	if pendingClose && a.ctx != nil {
		w.EventsEmit(a.ctx, "close-request")
	}
	return a.registerPaths(p)
}
func (a *App) fileOpen(p string) { a.sendPaths([]string{p}) }
func (a *App) sendPaths(paths []string) {
	a.mu.Lock()
	if !a.domReady {
		a.pending = append(a.pending, paths...)
		a.mu.Unlock()
		return
	}
	a.mu.Unlock()
	w.EventsEmit(a.ctx, "files-opened", a.registerPaths(paths))
}

// Closing is authorized by the current frontend state, never by asynchronously updated dirty hints.
func (a *App) requestClose() (approved, notify bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.quitApproved {
		return true, false
	}
	if a.closePending {
		return false, false
	}
	a.closePending = true
	return false, true
}
func (a *App) beforeClose(ctx context.Context) bool {
	approved, notify := a.requestClose()
	if approved {
		return false
	}
	a.mu.Lock()
	ready := a.domReady
	a.mu.Unlock()
	if notify && ready {
		w.EventsEmit(ctx, "close-request")
	}
	return true
}
func (a *App) CancelClose() {
	a.mu.Lock()
	a.closePending = false
	a.quitApproved = false
	a.mu.Unlock()
}
func (a *App) approveQuit() {
	a.mu.Lock()
	a.quitApproved = true
	a.closePending = false
	a.mu.Unlock()
}
func (a *App) Quit() {
	a.approveQuit()
	a.rememberWindow()
	w.Quit(a.ctx)
}
func (a *App) SetDirty(v bool) { a.mu.Lock(); a.dirty = v; a.mu.Unlock() }
func isMarkdown(p string) bool {
	switch strings.ToLower(filepath.Ext(p)) {
	case ".md", ".markdown", ".mdown", ".mkd":
		return true
	}
	return false
}
func hashBytes(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }
func readLimited(p string, limit int64) ([]byte, error) {
	f, e := openReadFile(p)
	if e != nil {
		return nil, e
	}
	defer f.Close()
	st, e := f.Stat()
	if e != nil {
		return nil, e
	}
	if !st.Mode().IsRegular() {
		return nil, fail("notRegular")
	}
	if st.Size() > limit {
		return nil, fail("tooLarge")
	}
	b, e := io.ReadAll(io.LimitReader(f, limit+1))
	if e != nil {
		return nil, e
	}
	if int64(len(b)) > limit {
		return nil, fail("tooLarge")
	}
	return b, nil
}
func checkReadableDocument(p string) error {
	f, e := openReadFile(p)
	if e != nil {
		return e
	}
	defer f.Close()
	st, e := f.Stat()
	if e != nil {
		return e
	}
	if !st.Mode().IsRegular() {
		return fail("notRegular")
	}
	if st.Size() > maxDocument {
		return fail("tooLarge")
	}
	return nil
}
func (a *App) register(p, root string, expand bool) (Document, error) {
	real, e := filepath.EvalSymlinks(p)
	if e != nil {
		return Document{}, e
	}
	real, e = filepath.Abs(real)
	if e != nil {
		return Document{}, e
	}
	if !isMarkdown(real) {
		return Document{}, fail("notMarkdown")
	}
	if e = checkReadableDocument(real); e != nil {
		return Document{}, e
	}
	if root == "" {
		root = filepath.Dir(real)
	}
	root, e = filepath.EvalSymlinks(root)
	if e != nil {
		return Document{}, e
	}
	root, _ = filepath.Abs(root)
	if !within(root, real) {
		return Document{}, fail("outsideRoot")
	}
	id := hashBytes([]byte(real))
	rel, _ := filepath.Rel(root, real)
	a.mu.Lock()
	if old, ok := a.files[id]; !ok || expand && within(root, old.Root) {
		a.files[id] = &record{Path: real, Root: root}
	}
	a.mu.Unlock()
	return Document{ID: id, Name: filepath.Base(real), Relative: filepath.ToSlash(rel)}, nil
}
func (a *App) registerPaths(paths []string) OpenResult {
	out := OpenResult{Documents: []Document{}, Skipped: []string{}}
	for _, p := range paths {
		st, e := os.Stat(p)
		if e != nil {
			out.Skipped = append(out.Skipped, filepath.Base(p)+": "+describe(e))
			continue
		}
		if st.IsDir() {
			r := a.listFolder(p)
			out.Documents = append(out.Documents, r.Documents...)
			out.Skipped = append(out.Skipped, r.Skipped...)
		} else {
			d, e := a.register(p, "", true)
			if e != nil {
				out.Skipped = append(out.Skipped, filepath.Base(p)+": "+describe(e))
			} else {
				out.Documents = append(out.Documents, d)
			}
		}
	}
	return out
}
func (a *App) OpenFiles() (OpenResult, error) {
	p, e := w.OpenMultipleFilesDialog(a.ctx, w.OpenDialogOptions{Title: a.tr("dialog.open"), Filters: []w.FileFilter{{DisplayName: a.tr("dialog.markdown"), Pattern: "*.md;*.markdown;*.mdown;*.mkd"}}})
	return a.registerPaths(p), e
}
func (a *App) OpenFolder() (OpenResult, error) {
	p, e := w.OpenDirectoryDialog(a.ctx, w.OpenDialogOptions{Title: a.tr("dialog.folder")})
	if e != nil || p == "" {
		return OpenResult{}, e
	}
	return a.listFolder(p), nil
}
func (a *App) listFolder(root string) OpenResult {
	out := OpenResult{Documents: []Document{}, Skipped: []string{}}
	root, e := filepath.EvalSymlinks(root)
	if e != nil {
		out.Skipped = append(out.Skipped, describe(e))
		return out
	}
	e = filepath.WalkDir(root, func(p string, d fs.DirEntry, walkerr error) error {
		if walkerr != nil {
			out.Skipped = append(out.Skipped, filepath.Base(p)+": "+fail("unreadable").Error())
			return nil
		}
		if d.IsDir() {
			if p != root && (strings.HasPrefix(d.Name(), ".") || d.Name() == "node_modules" || d.Name() == "vendor") {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 || !isMarkdown(p) {
			return nil
		}
		if len(out.Documents) >= 2000 {
			out.Skipped = append(out.Skipped, fail("folderLimit").Error())
			return fs.SkipAll
		}
		doc, err := a.register(p, root, true)
		if err != nil {
			out.Skipped = append(out.Skipped, filepath.Base(p)+": "+describe(err))
		} else {
			out.Documents = append(out.Documents, doc)
		}
		return nil
	})
	if e != nil {
		out.Skipped = append(out.Skipped, describe(e))
	}
	sort.Slice(out.Documents, func(i, j int) bool { return out.Documents[i].Relative < out.Documents[j].Relative })
	return out
}
func decodeDocument(b []byte) (string, string, error) {
	if len(b) >= 2 && ((b[0] == 255 && b[1] == 254) || (b[0] == 254 && b[1] == 255)) {
		if len(b)%2 != 0 {
			return "", "", fail("utf16Length")
		}
		words := make([]uint16, (len(b)-2)/2)
		var order binary.ByteOrder = binary.LittleEndian
		enc := "UTF-16 LE"
		if b[0] == 254 {
			order = binary.BigEndian
			enc = "UTF-16 BE"
		}
		for i := range words {
			words[i] = order.Uint16(b[2+i*2:])
		}
		for i := 0; i < len(words); i++ {
			v := words[i]
			if v >= 0xd800 && v <= 0xdbff {
				if i+1 >= len(words) || words[i+1] < 0xdc00 || words[i+1] > 0xdfff {
					return "", "", fail("utf16Surrogate")
				}
				i++
			} else if v >= 0xdc00 && v <= 0xdfff {
				return "", "", fail("utf16Surrogate")
			}
		}
		return string(utf16.Decode(words)), enc, nil
	}
	if !utf8.Valid(b) {
		return "", "", fail("encoding")
	}
	enc := "UTF-8"
	if strings.HasPrefix(string(b), "\ufeff") {
		enc = "UTF-8 BOM"
	}
	return strings.TrimPrefix(string(b), "\ufeff"), enc, nil
}
func encodeDocument(s, enc string) []byte {
	if strings.HasPrefix(enc, "UTF-16") {
		words := utf16.Encode([]rune(s))
		b := make([]byte, 2+len(words)*2)
		var order binary.ByteOrder = binary.LittleEndian
		b[0] = 255
		b[1] = 254
		if enc == "UTF-16 BE" {
			order = binary.BigEndian
			b[0] = 254
			b[1] = 255
		}
		for i, v := range words {
			order.PutUint16(b[2+i*2:], v)
		}
		return b
	}
	if enc == "UTF-8 BOM" {
		return append([]byte{239, 187, 191}, []byte(s)...)
	}
	return []byte(s)
}
func (a *App) ReadDocument(id string) (Document, error) {
	started := time.Now().UnixMilli()
	a.mu.Lock()
	r, ok := a.files[id]
	if !ok {
		a.mu.Unlock()
		return Document{}, fail("notAuthorized")
	}
	p, root := r.Path, r.Root
	a.mu.Unlock()
	real, e := filepath.EvalSymlinks(p)
	if e != nil || !within(root, real) {
		return Document{}, fail("moved")
	}
	b, e := readLimited(real, maxDocument)
	if e != nil {
		return Document{}, e
	}
	s, enc, e := decodeDocument(b)
	if e != nil {
		return Document{}, e
	}
	rel, _ := filepath.Rel(root, p)
	a.mu.Lock()
	a.timingDocument = id
	a.openTiming = OpenTiming{ProcessStartedAt: processStartedAt, ReadStartedAt: started}
	a.mu.Unlock()
	return Document{ID: id, Name: filepath.Base(p), Relative: filepath.ToSlash(rel), Content: s, Encoding: enc, Hash: hashBytes(b)}, nil
}

// DocumentHash reports the current on-disk hash so the frontend can notice edits made by other programs.
func (a *App) DocumentHash(id string) (string, error) {
	a.mu.Lock()
	r, ok := a.files[id]
	if !ok {
		a.mu.Unlock()
		return "", fail("notAuthorized")
	}
	p, root := r.Path, r.Root
	a.mu.Unlock()
	real, e := filepath.EvalSymlinks(p)
	if e != nil || !within(root, real) {
		return "", fail("moved")
	}
	b, e := readLimited(real, maxDocument)
	if e != nil {
		return "", e
	}
	return hashBytes(b), nil
}
func atomicWrite(p string, b []byte, mode fs.FileMode) error {
	f, e := os.CreateTemp(filepath.Dir(p), ".moread-*")
	if e != nil {
		return e
	}
	name := f.Name()
	defer os.Remove(name)
	if e = f.Chmod(mode); e != nil {
		f.Close()
		return e
	}
	if _, e = f.Write(b); e != nil {
		f.Close()
		return e
	}
	if e = f.Sync(); e != nil {
		f.Close()
		return e
	}
	if e = f.Close(); e != nil {
		return e
	}
	return os.Rename(name, p)
}
func (a *App) saveTo(id, content, baseline, p, enc string) (Document, error) {
	a.saveMu.Lock()
	defer a.saveMu.Unlock()
	if len(content) > maxDocument {
		return Document{}, fail("saveTooLarge")
	}
	encoded := encodeDocument(content, enc)
	if len(encoded) > maxDocument {
		return Document{}, fail("encodedTooLarge")
	}
	mode := fs.FileMode(0644)
	if st, e := os.Stat(p); e == nil {
		if !st.Mode().IsRegular() {
			return Document{}, fail("notRegular")
		}
		mode = st.Mode().Perm()
	}
	if baseline != "" {
		b, e := readLimited(p, maxDocument)
		if e != nil {
			return Document{}, e
		}
		if hashBytes(b) != baseline {
			return Document{}, fail("conflict")
		}
	}
	if e := atomicWrite(p, encoded, mode); e != nil {
		return Document{}, e
	}
	d, e := a.register(p, "", false)
	if e != nil {
		return Document{}, e
	}
	return a.ReadDocument(d.ID)
}
func (a *App) SaveDocument(id, content, baseline, encoding string, saveAs bool) (SaveResult, error) {
	a.mu.Lock()
	r, known := a.files[id]
	p := ""
	if known {
		p = r.Path
	}
	a.mu.Unlock()
	if !known || saveAs {
		var e error
		name := a.tr("doc.untitled")
		if known {
			name = filepath.Base(p)
		}
		p, e = w.SaveFileDialog(a.ctx, w.SaveDialogOptions{Title: a.tr("dialog.save"), DefaultFilename: name, Filters: []w.FileFilter{{DisplayName: a.tr("dialog.markdown"), Pattern: "*.md;*.markdown"}}})
		if e != nil {
			return SaveResult{}, e
		}
		if p == "" {
			return SaveResult{Cancelled: true}, nil
		}
		if filepath.Ext(p) == "" {
			p += ".md"
		}
		if !isMarkdown(p) {
			return SaveResult{}, fail("markdownExt")
		}
		if real, e := filepath.EvalSymlinks(p); e == nil {
			p = real
		}
		baseline = ""
		encoding = "UTF-8"
	} else {
		if baseline == "" {
			return SaveResult{}, fail("noBaseline")
		}
		real, e := filepath.EvalSymlinks(p)
		if e != nil || real != p {
			return SaveResult{}, fail("pathChanged")
		}
	}
	d, e := a.saveTo(id, content, baseline, p, encoding)
	return SaveResult{Document: d}, e
}
func within(root, p string) bool {
	rel, e := filepath.Rel(root, p)
	return e == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator)) && !filepath.IsAbs(rel)
}
func (a *App) relativePath(id, ref string) (string, error) {
	a.mu.Lock()
	r, ok := a.files[id]
	if !ok {
		a.mu.Unlock()
		return "", fail("openFirst")
	}
	root, base := r.Root, filepath.Dir(r.Path)
	a.mu.Unlock()
	u, e := url.Parse(ref)
	if e != nil || u.IsAbs() || u.Host != "" || strings.HasPrefix(u.Path, "/") || strings.Contains(u.Path, "\\") || strings.Contains(u.Path, ":") {
		return "", fail("relativeOnly")
	}
	p, e := filepath.EvalSymlinks(filepath.Join(base, filepath.FromSlash(u.Path)))
	if e != nil {
		return "", e
	}
	if !within(root, p) {
		return "", fail("resourceOutside")
	}
	return p, nil
}
func (a *App) ReadImage(id, ref string) (string, error) {
	p, e := a.relativePath(id, ref)
	if e != nil {
		return "", e
	}
	b, e := readLimited(p, maxImage)
	if e != nil {
		return "", e
	}
	mime := http.DetectContentType(b)
	if strings.EqualFold(filepath.Ext(p), ".svg") {
		b, e = sanitizeSVG(b)
		if e != nil {
			return "", e
		}
		mime = "image/svg+xml"
	}
	if len(b) > 12 && string(b[4:8]) == "ftyp" && (string(b[8:12]) == "avif" || string(b[8:12]) == "avis") {
		mime = "image/avif"
	}
	if mime != "image/svg+xml" && mime != "image/avif" && mime != "image/png" && mime != "image/jpeg" && mime != "image/gif" && mime != "image/webp" {
		return "", fail("imageType")
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(b), nil
}
func (a *App) OpenRelative(id, ref string) (Document, error) {
	p, e := a.relativePath(id, ref)
	if e != nil {
		return Document{}, e
	}
	a.mu.Lock()
	root := a.files[id].Root
	a.mu.Unlock()
	return a.register(p, root, false)
}
func (a *App) OpenLink(raw string) error {
	u, e := url.Parse(raw)
	if e != nil {
		return e
	}
	if u.Scheme != "http" && u.Scheme != "https" && u.Scheme != "mailto" {
		return fail("linkScheme")
	}
	w.BrowserOpenURL(a.ctx, raw)
	return nil
}
func (a *App) Print() { w.WindowPrint(a.ctx) }
func (a *App) ExportHTML(name, html string) (string, error) {
	if len(html) > 28*1024*1024 {
		return "", fail("exportTooLarge")
	}
	p, e := w.SaveFileDialog(a.ctx, w.SaveDialogOptions{Title: a.tr("dialog.export"), DefaultFilename: strings.TrimSuffix(name, filepath.Ext(name)) + ".html", Filters: []w.FileFilter{{DisplayName: a.tr("dialog.html"), Pattern: "*.html"}}})
	if e != nil || p == "" {
		return "", e
	}
	if filepath.Ext(p) == "" {
		p += ".html"
	}
	if strings.ToLower(filepath.Ext(p)) != ".html" {
		return "", fail("htmlExt")
	}
	if e := atomicWrite(p, []byte(html), 0644); e != nil {
		return "", failDetail("exportFailed", e)
	}
	return p, nil
}
