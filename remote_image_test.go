package main

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

var tinyPNG = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89")

func TestRemoteImageFetchesWithoutReferer(t *testing.T) {
	var referer string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/go":
			http.Redirect(w, r, "/a.png", http.StatusFound)
		case "/a.png":
			referer = r.Header.Get("Referer")
			w.Write(tinyPNG)
		case "/page":
			w.Write([]byte("<html>not an image</html>"))
		case "/big":
			w.Write(make([]byte, 64))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	a := &App{}
	uri, e := a.ReadRemoteImage(srv.URL + "/go")
	if e != nil || !strings.HasPrefix(uri, "data:image/png;base64,") {
		t.Fatalf("got %q, %v", uri, e)
	}
	if referer != "" {
		t.Fatalf("referer leaked: %q", referer)
	}
	if _, e := a.ReadRemoteImage(srv.URL + "/page"); e == nil || !strings.Contains(e.Error(), "imageType") {
		t.Fatalf("html accepted: %v", e)
	}
	if _, e := a.ReadRemoteImage(srv.URL + "/missing.png"); e == nil || !strings.Contains(e.Error(), "moread:remoteImage|HTTP 404") {
		t.Fatalf("404 not reported: %v", e)
	}
	if _, e := fetchRemoteImage(context.Background(), remoteImageClient, srv.URL+"/big", 16); e == nil || !strings.Contains(e.Error(), "tooLarge") {
		t.Fatalf("size cap not enforced: %v", e)
	}
}

func TestRemoteImageRejectsNonWebSchemes(t *testing.T) {
	a := &App{}
	for _, raw := range []string{"file:///etc/passwd", "javascript:alert(1)", "data:image/png;base64,AA==", "https://"} {
		if _, e := a.ReadRemoteImage(raw); e == nil {
			t.Fatalf("%s accepted", raw)
		}
	}
}

func TestRemoteSVGIsSanitized(t *testing.T) {
	uri, e := imageDataURI([]byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="1" height="1"/></svg>`), true)
	if e != nil && !strings.Contains(e.Error(), "moread:") {
		t.Fatal(e)
	}
	if e == nil {
		b, _ := base64.StdEncoding.DecodeString(strings.TrimPrefix(uri, "data:image/svg+xml;base64,"))
		if strings.Contains(strings.ToLower(string(b)), "script") {
			t.Fatalf("svg script survived: %s", b)
		}
	}
}
