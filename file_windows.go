//go:build windows

package main

import "os"

func openReadFile(p string) (*os.File, error) { return os.Open(p) }
