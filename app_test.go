package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func fixture(t *testing.T) (*App, Document, string) {
	t.Helper()
	dir := t.TempDir()
	p := filepath.Join(dir, "测试.md")
	if e := os.WriteFile(p, []byte("原文\r\n"), 0644); e != nil {
		t.Fatal(e)
	}
	a := NewApp()
	d, e := a.register(p, dir, true)
	if e != nil {
		t.Fatal(e)
	}
	d, e = a.ReadDocument(d.ID)
	if e != nil {
		t.Fatal(e)
	}
	return a, d, a.files[d.ID].Path
}
func TestEncodingRoundTrip(t *testing.T) {
	for _, enc := range []string{"UTF-8", "UTF-8 BOM", "UTF-16 LE", "UTF-16 BE"} {
		s := "中文 😀\r\n第二行\r\n"
		b := encodeDocument(s, enc)
		got, encoding, e := decodeDocument(b)
		if e != nil || got != s || enc != encoding {
			t.Fatalf("%s %q %s %v", enc, got, encoding, e)
		}
	}
	if _, _, e := decodeDocument([]byte{255}); e == nil {
		t.Fatal("invalid accepted")
	}
}
func TestSaveConflictAndOriginal(t *testing.T) {
	a, d, p := fixture(t)
	if e := os.WriteFile(p, []byte("外部修改"), 0644); e != nil {
		t.Fatal(e)
	}
	if _, e := a.saveTo(d.ID, "覆盖", d.Hash, p, d.Encoding); e == nil {
		t.Fatal("conflict accepted")
	}
	b, _ := os.ReadFile(p)
	if string(b) != "外部修改" {
		t.Fatal("original lost")
	}
}
func TestSaveAndReadBaselineIndependent(t *testing.T) {
	a, d, p := fixture(t)
	d2, e := a.saveTo(d.ID, "第一次", d.Hash, p, d.Encoding)
	if e != nil {
		t.Fatal(e)
	}
	a.ReadDocument(d.ID)
	if _, e = a.saveTo(d.ID, "陈旧覆盖", d.Hash, p, d.Encoding); e == nil {
		t.Fatal("stale baseline accepted")
	}
	if d2.Hash == d.Hash {
		t.Fatal("hash unchanged")
	}
}
func TestConcurrentSave(t *testing.T) {
	a, d, p := fixture(t)
	var wg sync.WaitGroup
	var mu sync.Mutex
	ok := 0
	for _, s := range []string{"甲", "乙"} {
		wg.Add(1)
		go func(s string) {
			defer wg.Done()
			_, e := a.saveTo(d.ID, s, d.Hash, p, d.Encoding)
			if e == nil {
				mu.Lock()
				ok++
				mu.Unlock()
			}
		}(s)
	}
	wg.Wait()
	if ok != 1 {
		t.Fatalf("successful writes %d", ok)
	}
}
func TestRelativeBoundaryAndDecode(t *testing.T) {
	a, d, p := fixture(t)
	root := filepath.Dir(p)
	os.WriteFile(filepath.Join(root, "a%20b.md"), []byte("x"), 0644)
	if _, e := a.relativePath(d.ID, "a%2520b.md"); e != nil {
		t.Fatal(e)
	}
	outside := filepath.Join(t.TempDir(), "out.md")
	os.WriteFile(outside, []byte("private"), 0644)
	if e := os.Symlink(outside, filepath.Join(root, "escape.md")); e == nil {
		if _, e = a.relativePath(d.ID, "escape.md"); e == nil {
			t.Fatal("symlink escape")
		}
	}
	for _, ref := range []string{"../out.md", "/etc/passwd", "C:/test.md", "//server/share.md", "file:///etc/passwd", "https://example.com/a.md", "..\\out.md"} {
		if _, e := a.relativePath(d.ID, ref); e == nil {
			t.Fatalf("accepted %s", ref)
		}
	}
}
func TestLimitsAndAtomicFailure(t *testing.T) {
	a, d, p := fixture(t)
	if _, e := a.saveTo(d.ID, strings.Repeat("x", maxDocument+1), d.Hash, p, d.Encoding); e == nil {
		t.Fatal("oversize saved")
	}
	b, _ := os.ReadFile(p)
	if string(b) != "原文\r\n" {
		t.Fatal("original changed")
	}
	if _, e := readLimited(filepath.Dir(p), maxDocument); e == nil {
		t.Fatal("directory read")
	}
	if e := atomicWrite(filepath.Join(p, "missing"), []byte("bad"), 0644); e == nil {
		t.Fatal("expected failure")
	}
}
func TestFolderPartialAndRootExpansion(t *testing.T) {
	a, d, p := fixture(t)
	root := filepath.Dir(p)
	bad := filepath.Join(root, "big.md")
	f, _ := os.Create(bad)
	f.Truncate(maxDocument + 1)
	f.Close()
	r := a.listFolder(root)
	if len(r.Documents) != 1 || len(r.Skipped) != 1 {
		t.Fatalf("%+v", r)
	}
	if _, e := a.register(p, filepath.Dir(root), false); e != nil {
		t.Fatal(e)
	}
	if a.files[d.ID].Root != root {
		t.Fatal("implicit root expansion")
	}
	a.register(p, filepath.Dir(root), true)
	if a.files[d.ID].Root != filepath.Dir(root) {
		t.Fatal("explicit expansion failed")
	}
}
func TestRegisterChecksMetadataWithoutReadingBody(t *testing.T) {
	root := t.TempDir()
	p := filepath.Join(root, "ordinary.md")
	if e := os.WriteFile(p, []byte("synthetic content"), 0600); e != nil {
		t.Fatal(e)
	}
	a := NewApp()
	d, e := a.register(p, root, true)
	if e != nil || d.Content != "" || d.Hash != "" {
		t.Fatalf("registration must be metadata only: %+v %v", d, e)
	}
	got, e := a.ReadDocument(d.ID)
	if e != nil || got.Content != "synthetic content" || got.Hash == "" {
		t.Fatalf("read must load body: %+v %v", got, e)
	}
	large := filepath.Join(root, "large.md")
	f, e := os.Create(large)
	if e != nil {
		t.Fatal(e)
	}
	if e = f.Truncate(maxDocument + 1); e != nil {
		t.Fatal(e)
	}
	f.Close()
	if _, e = a.register(large, root, true); e == nil {
		t.Fatal("oversize registered")
	}
	if _, e = a.register(root, root, true); e == nil {
		t.Fatal("directory registered")
	}
	blocked := filepath.Join(root, "blocked.md")
	if e = os.WriteFile(blocked, []byte("synthetic"), 0000); e != nil {
		t.Fatal(e)
	}
	if _, e = a.register(blocked, root, true); e == nil {
		t.Fatal("unreadable file registered")
	}
	link := filepath.Join(root, "linked.md")
	if e = os.Symlink(p, link); e == nil {
		if _, e = a.register(link, root, true); e != nil {
			t.Fatalf("explicit in-root symlink should keep existing semantics: %v", e)
		}
		r := a.listFolder(root)
		for _, item := range r.Documents {
			if item.Relative == "linked.md" {
				t.Fatal("folder followed symlink")
			}
		}
	}
	outside := filepath.Join(t.TempDir(), "outside.md")
	if e = os.WriteFile(outside, []byte("synthetic"), 0600); e != nil {
		t.Fatal(e)
	}
	if e = os.Symlink(outside, filepath.Join(root, "escape.md")); e == nil {
		if _, e = a.register(filepath.Join(root, "escape.md"), root, true); e == nil {
			t.Fatal("out-of-root symlink registered")
		}
	}
}

func BenchmarkFolderRegistrationMetadata(b *testing.B) {
	root := b.TempDir()
	for i := 0; i < 100; i++ {
		p := filepath.Join(root, fmt.Sprintf("%03d.md", i))
		f, e := os.Create(p)
		if e != nil {
			b.Fatal(e)
		}
		if e = f.Truncate(1024 * 1024); e != nil {
			b.Fatal(e)
		}
		f.Close()
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		a := NewApp()
		r := a.listFolder(root)
		if len(r.Documents) != 100 {
			b.Fatalf("got %d", len(r.Documents))
		}
	}
}
func TestImageContentValidation(t *testing.T) {
	a, d, p := fixture(t)
	os.WriteFile(filepath.Join(filepath.Dir(p), "fake.png"), []byte("<script>evil</script>"), 0644)
	if _, e := a.ReadImage(d.ID, "fake.png"); e == nil {
		t.Fatal("fake image accepted")
	}
}

func TestSVGSanitization(t *testing.T) {
	b, e := sanitizeSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://example.com/x"/><path onclick="bad()" style="fill:url(https://example.com)" d="M0 0"/><use href="https://example.com"/><text>安全</text></svg>`))
	if e != nil {
		t.Fatal(e)
	}
	s := string(b)
	for _, bad := range []string{"script", "onclick", "style=", "https://", "image"} {
		if strings.Contains(s, bad) {
			t.Fatalf("unsafe %s", s)
		}
	}
	if !strings.Contains(s, "安全") {
		t.Fatal("lost text")
	}
}

func TestInvalidUTF16Rejected(t *testing.T) {
	for _, b := range [][]byte{{255, 254, 0, 216}, {255, 254, 0, 220}, {254, 255, 216, 0, 0, 65}} {
		if _, _, e := decodeDocument(b); e == nil {
			t.Fatal("invalid surrogate accepted")
		}
	}
}

func TestPendingDropAndSystemOpenDrain(t *testing.T) {
	a, _, p := fixture(t)
	a.sendPaths([]string{p})
	a.fileOpen(p)
	if len(a.pending) != 2 {
		t.Fatal("open event lost before frontend subscription")
	}
	r := a.FrontendReady()
	if len(r.Documents) != 2 || len(a.pending) != 0 || !a.domReady {
		t.Fatalf("drain failed: %+v", r)
	}
	if len(a.FrontendReady().Documents) != 0 {
		t.Fatal("pending replay duplicated")
	}
}

func TestEncodedSizeLimitPreservesOriginal(t *testing.T) {
	a, d, p := fixture(t)
	if _, e := a.saveTo(d.ID, strings.Repeat("x", maxDocument/2), d.Hash, p, "UTF-16 LE"); e == nil {
		t.Fatal("encoded oversize allowed")
	}
	b, _ := os.ReadFile(p)
	if string(b) != "原文\r\n" {
		t.Fatal("original replaced before encoded size validation")
	}
}

func TestCloseHandshakeIgnoresOutOfOrderDirty(t *testing.T) {
	a := NewApp()
	a.SetDirty(true)
	a.SetDirty(false)
	approved, notify := a.requestClose()
	if approved || !notify {
		t.Fatal("first close must ask frontend regardless dirty hint")
	}
	a.SetDirty(true)
	a.SetDirty(false)
	approved, notify = a.requestClose()
	if approved || notify {
		t.Fatal("duplicate close must not bypass or duplicate guard")
	}
	a.CancelClose()
	approved, notify = a.requestClose()
	if approved || !notify {
		t.Fatal("cancelled close must be requestable again")
	}
	a.approveQuit()
	a.SetDirty(true)
	approved, notify = a.requestClose()
	if !approved || notify {
		t.Fatal("explicit quit approval must survive late dirty hints")
	}
}

func TestCloseApprovalCanBeRevokedOnFailure(t *testing.T) {
	a := NewApp()
	a.approveQuit()
	a.CancelClose()
	approved, notify := a.requestClose()
	if approved || !notify {
		t.Fatal("failed quit must return to guarded state")
	}
}
func TestCloseBeforeFrontendReadyIsRetained(t *testing.T) {
	a := NewApp()
	approved, notify := a.requestClose()
	if approved || !notify {
		t.Fatal("early close must be queued")
	}
	a.FrontendReady()
	if !a.closePending || !a.domReady {
		t.Fatal("early close lost at ready")
	}
}
func TestDocumentHashTracksExternalEdits(t *testing.T) {
	a, d, p := fixture(t)
	if h, e := a.DocumentHash(d.ID); e != nil || h != d.Hash {
		t.Fatalf("unchanged hash %q %v", h, e)
	}
	if e := os.WriteFile(p, []byte("外部修改"), 0644); e != nil {
		t.Fatal(e)
	}
	if h, e := a.DocumentHash(d.ID); e != nil || h == d.Hash || h != hashBytes([]byte("外部修改")) {
		t.Fatalf("external edit not reported %q %v", h, e)
	}
	if _, e := a.DocumentHash("unknown"); e == nil {
		t.Fatal("unregistered document accepted")
	}
	os.Remove(p)
	if _, e := a.DocumentHash(d.ID); e == nil {
		t.Fatal("missing file reported as unchanged")
	}
}

func TestStreamingHashLimitsAndBytes(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "hash.md")
	for _, content := range []string{"", "中文\r\n😀", strings.Repeat("a", 65536)} {
		b := []byte(content)
		if e := os.WriteFile(p, b, 0600); e != nil {
			t.Fatal(e)
		}
		got, e := hashFileLimited(p, int64(len(b)))
		if e != nil || got != hashBytes(b) {
			t.Fatalf("hash mismatch: %s %v", got, e)
		}
		if len(b) > 0 {
			if _, e := hashFileLimited(p, int64(len(b)-1)); e == nil {
				t.Fatal("oversized file accepted")
			}
		}
	}
	if _, e := hashFileLimited(dir, maxDocument); e == nil {
		t.Fatal("directory accepted")
	}
	if _, e := hashFileLimited(filepath.Join(dir, "missing"), maxDocument); e == nil {
		t.Fatal("missing file accepted")
	}
}

func TestDocumentHashDetectsSameSizeSameTimestampReplacement(t *testing.T) {
	a, d, p := fixture(t)
	st, e := os.Stat(p)
	if e != nil {
		t.Fatal(e)
	}
	b, e := os.ReadFile(p)
	if e != nil {
		t.Fatal(e)
	}
	b[0] ^= 1
	if e = os.WriteFile(p, b, 0644); e != nil {
		t.Fatal(e)
	}
	if e = os.Chtimes(p, st.ModTime(), st.ModTime()); e != nil {
		t.Fatal(e)
	}
	if got, e := a.DocumentHash(d.ID); e != nil || got != hashBytes(b) || got == d.Hash {
		t.Fatalf("missed replacement: %s %v", got, e)
	}
}

func BenchmarkDocumentHash(b *testing.B) {
	p := filepath.Join(b.TempDir(), "large.md")
	if e := os.WriteFile(p, []byte(strings.Repeat("a", maxDocument)), 0600); e != nil {
		b.Fatal(e)
	}
	for _, streaming := range []bool{false, true} {
		name := "buffered"
		if streaming {
			name = "streaming"
		}
		b.Run(name, func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(maxDocument)
			for b.Loop() {
				if streaming {
					if _, e := hashFileLimited(p, maxDocument); e != nil {
						b.Fatal(e)
					}
				} else {
					data, e := readLimited(p, maxDocument)
					if e != nil {
						b.Fatal(e)
					}
					hashBytes(data)
				}
			}
		})
	}
}
