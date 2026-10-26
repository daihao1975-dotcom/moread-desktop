//go:build !windows

package main

import (
	"os"
	"syscall"
)

func openReadFile(p string) (*os.File, error) {
	return os.OpenFile(p, os.O_RDONLY|syscall.O_NONBLOCK, 0)
}
