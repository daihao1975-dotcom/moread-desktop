#!/bin/bash
# Build, verify and package a MoRead release for macOS (Apple Silicon) and Windows (x64).
#
#   scripts/release.sh [output-directory]
#
# Requires Go 1.26.10+, Node.js 22.12+, Wails CLI 2.17.0 and Xcode 26+ (actool compiles the
# Icon Composer icon). The working tree must be committed: the commit is stamped into "About".
#
# Optional signing, used only when the variables are set (nothing secret is passed on the command line):
#   MACOS_SIGN_IDENTITY  Developer ID Application identity in the login keychain; without it the app is ad-hoc signed.
#   NOTARY_PROFILE       notarytool keychain profile (xcrun notarytool store-credentials); notarizes and staples
#                        the app and the DMG. Requires MACOS_SIGN_IDENTITY.
#   WINDOWS_SIGN_COMMAND Command that signs a Windows executable in place, called with the file path as its
#                        only argument (for example a jsign or Trusted Signing wrapper).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
version="$(node -p "require('./frontend/package.json').version")"
out="${1:-$root/dist/MoRead-$version}"
wails="${WAILS:-wails}"
limit=30000000
identity="${MACOS_SIGN_IDENTITY:-}"
notary="${NOTARY_PROFILE:-}"
if [ -n "$notary" ] && [ -z "$identity" ]; then
  echo "NOTARY_PROFILE needs MACOS_SIGN_IDENTITY: Apple only notarizes Developer ID signed apps." >&2
  exit 1
fi
# notarize submits one file and waits; a rejection prints Apple's log and stops the release.
notarize() {
  local out
  out="$(xcrun notarytool submit "$1" --keychain-profile "$notary" --wait 2>&1)" || { echo "$out" >&2; return 1; }
  echo "$out" | grep -q "status: Accepted" || {
    echo "$out" >&2
    xcrun notarytool log "$(echo "$out" | awk '/^  id:/{print $2; exit}')" --keychain-profile "$notary" >&2 || true
    return 1
  }
}

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
if [ -n "$identity" ]; then
  codesign --force --deep --options runtime --timestamp --sign "$identity" "$app" >/dev/null 2>&1
else
  codesign --force --deep --sign - "$app" >/dev/null 2>&1
fi
codesign --verify --deep --strict "$app"
if [ -n "$notary" ]; then
  echo "==> Notarizing the app"
  submit="$(mktemp -d)"
  ditto -c -k --keepParent "$app" "$submit/MoRead.zip"
  notarize "$submit/MoRead.zip"
  rm -rf "$submit"
  xcrun stapler staple -q "$app"
  spctl --assess --type execute "$app"
fi

echo "==> Windows build"
CGO_ENABLED=0 "$wails" build -platform windows/amd64 -webview2 error -trimpath -skipbindings -s -ldflags "$ldflags" >/dev/null
exe="build/bin/MoRead.exe"
file "$exe" | grep -q "PE32+ executable (GUI) x86-64"
if [ -n "${WINDOWS_SIGN_COMMAND:-}" ]; then
  echo "==> Signing the Windows executable"
  $WINDOWS_SIGN_COMMAND "$exe"
fi

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
if [ -n "$identity" ]; then
  codesign --force --timestamp --sign "$identity" "$out/MoRead-$version-macOS-arm64.dmg" >/dev/null 2>&1
fi
if [ -n "$notary" ]; then
  echo "==> Notarizing the DMG"
  notarize "$out/MoRead-$version-macOS-arm64.dmg"
  xcrun stapler staple -q "$out/MoRead-$version-macOS-arm64.dmg"
fi
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
