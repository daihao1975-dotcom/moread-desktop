#!/usr/bin/env python3
"""Verify a published release and the release Mac. Never installs or quits apps."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import re
import stat
import subprocess
import sys
import tempfile
import zipfile


APP = Path("/Applications/MoRead.app")
BUNDLE_ID = "app.moread.reader"
LSREGISTER = (
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/"
    "LaunchServices.framework/Support/lsregister"
)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(*args):
    result = subprocess.run(args, text=True, capture_output=True, timeout=180)
    require(result.returncode == 0, f"{args[0]} failed: {result.stderr.strip()}")
    return result.stdout


def api(repo, endpoint):
    return json.loads(run("gh", "api", f"repos/{repo}/{endpoint}"))


def sha256(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def app_info(app, version):
    # Wails emits valid Apple XML without an XML declaration. Parse a converted
    # stream; never rewrite the signed plist on disk.
    info = plistlib.loads(run(
        "plutil", "-convert", "xml1", "-o", "-", str(app / "Contents/Info.plist")
    ).encode())
    require(info.get("CFBundleIdentifier") == BUNDLE_ID, "Wrong application identifier")
    for key in ("CFBundleShortVersionString", "CFBundleVersion"):
        require(info.get(key) == version, f"{app}: {key}={info.get(key)}, expected {version}")
    return app / "Contents/MacOS/MoRead"


def verify_app(app, version, commit):
    binary = app_info(app, version)
    require(commit.encode() in binary.read_bytes(), f"{app}: release commit stamp missing")
    run("codesign", "--verify", "--deep", "--strict", str(app))
    run("xcrun", "stapler", "validate", str(app))
    # spctl writes its assessment to stderr, even on success.
    assessment = subprocess.run(
        ["spctl", "--assess", "--type", "execute", "--verbose=2", str(app)],
        text=True, capture_output=True, timeout=180,
    )
    require(
        assessment.returncode == 0 and "source=Notarized Developer ID" in assessment.stderr,
        f"{app}: notarized Gatekeeper assessment failed: {assessment.stderr.strip()}",
    )
    require("arm64" in run("lipo", "-archs", str(binary)), "Missing arm64 architecture")
    return sha256(binary)


def bundle_files(app):
    """Compare sealed resources too; ignore filesystem dates and extended attributes."""
    files = {}
    for item in sorted(app.rglob("*")):
        relative = str(item.relative_to(app))
        if item.is_symlink():
            files[relative] = ["symlink", os.readlink(item)]
        elif item.is_file():
            files[relative] = ["file", sha256(item), stat.S_IMODE(item.stat().st_mode)]
    return files


def validate_zip(file):
    with zipfile.ZipFile(file) as archive:
        for item in archive.infolist():
            name = PurePosixPath(item.filename)
            require(not name.is_absolute() and ".." not in name.parts, "Unsafe ZIP path")
            if stat.S_ISLNK(item.external_attr >> 16):
                target = PurePosixPath(archive.read(item).decode())
                require(not target.is_absolute() and ".." not in target.parts, "Unsafe ZIP link")


def verify_assets(assets, downloads):
    digests = {}
    for name, asset in assets.items():
        require(Path(name).name == name, "Unsafe asset name")
        file = downloads / name
        require(file.is_file(), f"Missing downloaded asset: {name}")
        digest = sha256(file)
        require(file.stat().st_size == asset["size"], f"Asset size mismatch: {name}")
        require(asset.get("digest") == f"sha256:{digest}", f"GitHub digest mismatch: {name}")
        digests[name] = digest
    manifest = {}
    for line in (downloads / "SHA256SUMS.txt").read_text().splitlines():
        digest, name = line.split(None, 1)
        require(name not in manifest, "Duplicate checksum entry")
        manifest[name] = digest
    require(manifest == {k: v for k, v in digests.items() if k != "SHA256SUMS.txt"},
            "SHA256SUMS differs from published assets")
    return digests


def verify_entries():
    candidates = {APP}
    dump = run(LSREGISTER, "-dump")
    for block in re.split(r"(?m)^-{20,}\n", dump):
        if re.search(r"^identifier:\s+app\.moread\.reader\s*$", block, re.M):
            match = re.search(r"^path:\s+(.+?)\s+\(0x[0-9a-f]+\)\s*$", block, re.M)
            require(match is not None, "Cannot parse LaunchServices application path")
            candidates.add(Path(match[1]))
    candidates.update(Path(line) for line in run(
        "mdfind", f'kMDItemCFBundleIdentifier == "{BUNDLE_ID}"'
    ).splitlines() if line)
    valid = {str(item.resolve()) for item in candidates if item.is_dir()}
    require(valid == {str(APP.resolve())}, f"Multiple valid application entries: {sorted(valid)}")
    for line in run("ps", "-axo", "pid=,comm=").splitlines():
        fields = line.strip().split(None, 1)
        if len(fields) == 2 and fields[1].endswith("/MoRead.app/Contents/MacOS/MoRead"):
            require(fields[1] == str(APP / "Contents/MacOS/MoRead"), "Running a different app copy")
            # A process may still use the old inode after its pathname was replaced.
            opened = run("lsof", "-a", "-p", fields[0], "-d", "txt", "-Fni")
            inode = str((APP / "Contents/MacOS/MoRead").stat().st_ino)
            require(f"i{inode}\n" in opened, "Running instance still uses a different executable")
    return sorted(valid)


def verify(args, report):
    require(sys.platform == "darwin", "Run closeout on the macOS release machine")
    require(re.fullmatch(r"\d+\.\d+\.\d+", args.version), "Expected a stable x.y.z version")
    repo = run("gh", "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner").strip()
    release = api(repo, "releases/latest")
    require(release["tag_name"] == f"v{args.version}", "Latest release differs from expected version")
    require(not release["draft"] and not release["prerelease"], "Release is not final")
    ref = api(repo, f"git/ref/tags/v{args.version}")["object"]
    for _ in range(8):
        if ref["type"] != "tag":
            break
        ref = api(repo, f"git/tags/{ref['sha']}")["object"]
    require(ref["type"] == "commit", "Release tag does not resolve to a commit")
    commit = ref["sha"]
    report.update(release=release["html_url"], version=args.version, commit=commit)
    # Fail early for the original regression, before downloading release assets.
    app_info(APP, args.version)
    assets = {item["name"]: item for item in release["assets"]}
    zip_name = f"MoRead-{args.version}-macOS-arm64.zip"
    dmg_name = f"MoRead-{args.version}-macOS-arm64.dmg"
    require({zip_name, dmg_name, "SHA256SUMS.txt"} <= assets.keys(), "Release assets missing")
    with tempfile.TemporaryDirectory(prefix="codex-moread-closeout-") as temporary:
        work = Path(temporary)
        downloads = Path(args.assets_dir).resolve() if args.assets_dir else work / "assets"
        if not args.assets_dir:
            downloads.mkdir()
            run("gh", "release", "download", release["tag_name"], "--repo", repo,
                "--dir", str(downloads))
        report["assets_sha256"] = verify_assets(assets, downloads)
        validate_zip(downloads / zip_name)
        unpacked = work / "zip"
        run("ditto", "-x", "-k", str(downloads / zip_name), str(unpacked))
        packaged = unpacked / "MoRead.app"
        report["executable_sha256"] = verify_app(packaged, args.version, commit)
        require(verify_app(APP, args.version, commit) == report["executable_sha256"],
                "Installed executable differs from published ZIP")
        require(bundle_files(APP) == bundle_files(packaged), "Installed bundle differs from published ZIP")
        dmg = downloads / dmg_name
        run("codesign", "--verify", "--strict", str(dmg))
        run("xcrun", "stapler", "validate", str(dmg))
        run("spctl", "--assess", "--type", "open", "--context", "context:primary-signature", str(dmg))
        run("hdiutil", "verify", str(dmg))
        mounted = work / "dmg"
        run("hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint", str(mounted), str(dmg))
        try:
            verify_app(mounted / "MoRead.app", args.version, commit)
            require(bundle_files(mounted / "MoRead.app") == bundle_files(packaged),
                    "DMG application differs from published ZIP")
        finally:
            run("hdiutil", "detach", str(mounted))
    report["valid_entries"] = verify_entries()
    report["status"] = "passed"
    report["validation_boundary"] = "Release/install verification; no functional E2E or Windows device acceptance"


def main():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default=json.loads((root / "frontend/package.json").read_text())["version"])
    parser.add_argument("--assets-dir", help="Reuse downloaded assets; all GitHub digests are still checked")
    parser.add_argument("--report", type=Path, help="Write a local JSON receipt, including failures")
    args = parser.parse_args()
    os.chdir(root)
    report = {"status": "failed", "checked_at": datetime.now(timezone.utc).isoformat()}
    try:
        verify(args, report)
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired, zipfile.BadZipFile) as error:
        report["error"] = str(error)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
