#!/bin/bash
# Build, verify and package a MoRead release for macOS (Apple Silicon) and Windows (x64).
#
#   scripts/release.sh [output-directory]
#
# Requires Go 1.25+, Node.js 22.12+, Wails CLI 2.17.0 and Xcode 26+ (actool compiles the
# Icon Composer icon). The working tree must be committed: the commit is stamped into "About".
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
version="$(node -p "require('./frontend/package.json').version")"
out="${1:-$root/dist/MoRead-$version}"
wails="${WAILS:-wails}"
limit=30000000

if [ -n "$(git status --porcelain)" ] && [ "${ALLOW_DIRTY:-0}" != 1 ]; then
  echo "Commit the working tree first (or set ALLOW_DIRTY=1 for a local test build)." >&2
  exit 1
fi
commit="$(git rev-parse HEAD)"
[ -z "$(git status --porcelain)" ] || commit="$commit-dirty"
stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ldflags="-X main.buildCommit=$commit -X main.buildTime=$stamp"

echo "==> MoRead $version ($commit)"
echo "==> Tests"
(cd frontend && npm test >/dev/null && npm run build >/dev/null)
go vet ./...
go test -race ./... >/dev/null
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go vet ./...

echo "==> macOS build"
"$wails" build -clean -platform darwin/arm64 -trimpath -skipbindings -s -ldflags "$ldflags" >/dev/null
app="build/bin/MoRead.app"
# macOS 26 and later draw Icon Composer icons edge to edge; older systems keep using iconfile.icns.
icon="$(mktemp -d)"
xcrun actool build/darwin/AppIcon.icon --compile "$icon" --app-icon AppIcon --platform macosx \
  --target-device mac --minimum-deployment-target 12.0 --output-partial-info-plist "$icon/partial.plist" >/dev/null
cp "$icon/Assets.car" "$app/Contents/Resources/Assets.car"
rm -rf "$icon"
codesign --force --deep --sign - "$app" >/dev/null 2>&1
codesign --verify --deep --strict "$app"

echo "==> Windows build"
CGO_ENABLED=0 "$wails" build -platform windows/amd64 -webview2 error -trimpath -skipbindings -s -ldflags "$ldflags" >/dev/null
exe="build/bin/MoRead.exe"
file "$exe" | grep -q "PE32+ executable (GUI) x86-64"

echo "==> Packages in $out"
rm -rf "$out"
mkdir -p "$out"
out="$(cd "$out" && pwd)"   # later steps run from temporary directories
docs=(LICENSE THIRD_PARTY_NOTICES.txt docs/使用手册.md docs/User-Guide.md docs/版本说明.md docs/隐私说明.md)
stage="$(mktemp -d)"
mkdir -p "$stage/dmg" "$stage/win/MoRead-$version-Windows-x64"
ditto "$app" "$stage/dmg/MoRead.app"
ln -s /Applications "$stage/dmg/Applications"
cp "${docs[@]}" docs/安装说明-macOS.txt "$stage/dmg/"
hdiutil create -quiet -volname "MoRead $version" -srcfolder "$stage/dmg" -format UDZO -ov "$out/MoRead-$version-macOS-arm64.dmg"
hdiutil verify -quiet "$out/MoRead-$version-macOS-arm64.dmg"
ditto -c -k --keepParent "$app" "$out/MoRead-$version-macOS-arm64.zip"
cp "$exe" "$out/MoRead-$version-Windows-x64.exe"
cp "$exe" "${docs[@]}" docs/安装说明-Windows.txt "$stage/win/MoRead-$version-Windows-x64/"
(cd "$stage/win" && zip -qr -X "$out/MoRead-$version-Windows-x64.zip" "MoRead-$version-Windows-x64")
# Loose documents use ASCII names: GitHub release assets reject non-ASCII file names.
cp docs/User-Guide.md "$out/"
cp docs/使用手册.md "$out/User-Guide-zh-CN.md"
cp docs/版本说明.md "$out/Release-Notes.md"
cp docs/隐私说明.md "$out/Privacy.md"
rm -rf "$stage"

for f in "$out"/*; do
  size=$(stat -f %z "$f")
  [ "$size" -le "$limit" ] || { echo "$f is $size bytes, over $limit" >&2; exit 1; }
done
(cd "$out" && shasum -a 256 -- * | grep -v SHA256SUMS > SHA256SUMS.txt)
echo "==> Done"
ls -l "$out"
