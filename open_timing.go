package main

import "time"

var processStartedAt = time.Now().UnixMilli()

// OpenTiming contains timestamps only: no document text, names or filesystem paths.
// The frontend reports after two animation frames; screenshots independently verify visible content.
// This is a renderer paint opportunity, not an operating-system compositor timestamp.
type OpenTiming struct {
	ProcessStartedAt  int64 `json:"processStartedAt"`
	ReadStartedAt     int64 `json:"readStartedAt"`
	PaintConfirmedAt  int64 `json:"paintConfirmedAt"`
	ContentfulPaintAt int64 `json:"contentfulPaintAt"`
}

func (a *App) ReportDocumentPaint(id string, contentfulPaintAt int64) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if id == "" || id != a.timingDocument || a.files[id] == nil {
		return fail("notAuthorized")
	}
	if a.openTiming.PaintConfirmedAt == 0 {
		a.openTiming.PaintConfirmedAt = time.Now().UnixMilli()
		if contentfulPaintAt >= a.openTiming.ReadStartedAt && contentfulPaintAt <= a.openTiming.PaintConfirmedAt {
			a.openTiming.ContentfulPaintAt = contentfulPaintAt
		}
	}
	return nil
}
