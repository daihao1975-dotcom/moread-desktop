//go:build !windows

package main

import (
	"path/filepath"
	"syscall"
	"testing"
)

func TestSpecialFileRejected(t *testing.T) {
	p := filepath.Join(t.TempDir(), "pipe.md")
	if e := syscall.Mkfifo(p, 0600); e != nil {
		t.Fatal(e)
	}
	if _, e := readLimited(p, maxDocument); e == nil {
		t.Fatal("FIFO accepted")
	}
}
