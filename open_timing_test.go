package main

import (
	"testing"
)

func TestPaintTimingRejectsUnknownDocumentsAndResetsOnRead(t *testing.T) {
	a, d, _ := fixture(t)
	if err := a.ReportDocumentPaint("unknown", 0); err == nil {
		t.Fatal("unknown document accepted")
	}
	if a.AboutInfo().OpenTiming.PaintConfirmedAt != 0 {
		t.Fatal("unknown report changed timing")
	}
	if err := a.ReportDocumentPaint(d.ID, 0); err != nil {
		t.Fatal(err)
	}
	first := a.AboutInfo().OpenTiming
	if first.PaintConfirmedAt < first.ReadStartedAt || first.ReadStartedAt < first.ProcessStartedAt {
		t.Fatalf("invalid timing: %+v", first)
	}
	if err := a.ReportDocumentPaint(d.ID, 0); err != nil {
		t.Fatal(err)
	}
	if a.AboutInfo().OpenTiming != first {
		t.Fatal("enrichment replaced first-paint timing")
	}
	if _, err := a.ReadDocument(d.ID); err != nil {
		t.Fatal(err)
	}
	if a.AboutInfo().OpenTiming.PaintConfirmedAt != 0 {
		t.Fatal("new read reused stale paint timing")
	}
}
