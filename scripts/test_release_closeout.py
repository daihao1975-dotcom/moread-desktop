"""Failure cases for the release/install completion gate. No network or user apps."""

import importlib.util
from pathlib import Path
import plistlib
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile


spec = importlib.util.spec_from_file_location(
    "closeout", Path(__file__).with_name("verify-release-closeout.py")
)
closeout = importlib.util.module_from_spec(spec)
spec.loader.exec_module(closeout)


class CloseoutTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="codex-moread-gate-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def assets(self, manifest=None):
        package = self.root / "package.zip"
        package.write_bytes(b"release artifact")
        sums = self.root / "SHA256SUMS.txt"
        sums.write_text(manifest if manifest is not None else f"{closeout.sha256(package)}  package.zip\n")
        return {file.name: {"size": file.stat().st_size, "digest": f"sha256:{closeout.sha256(file)}"}
                for file in (package, sums)}

    def test_published_asset_and_manifest_match(self):
        self.assertEqual(len(closeout.verify_assets(self.assets(), self.root)), 2)

    def test_same_size_tampering_is_rejected(self):
        assets = self.assets()
        (self.root / "package.zip").write_bytes(b"changed artifact")
        with self.assertRaisesRegex(RuntimeError, "GitHub digest mismatch"):
            closeout.verify_assets(assets, self.root)

    def test_missing_asset_is_rejected(self):
        assets = self.assets()
        (self.root / "package.zip").unlink()
        with self.assertRaisesRegex(RuntimeError, "Missing downloaded asset"):
            closeout.verify_assets(assets, self.root)

    def test_incomplete_manifest_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "SHA256SUMS differs"):
            closeout.verify_assets(self.assets(manifest=""), self.root)

    def test_duplicate_manifest_entry_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "Duplicate checksum entry"):
            closeout.verify_assets(self.assets(manifest="abc  package.zip\nabc  package.zip\n"), self.root)

    def test_zip_cannot_escape_temporary_directory(self):
        file = self.root / "bad.zip"
        with zipfile.ZipFile(file, "w") as archive:
            archive.writestr("../outside", "bad")
        with self.assertRaisesRegex(RuntimeError, "Unsafe ZIP path"):
            closeout.validate_zip(file)

    def test_zip_symlink_cannot_escape(self):
        file = self.root / "bad-link.zip"
        link = zipfile.ZipInfo("MoRead.app/link")
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        with zipfile.ZipFile(file, "w") as archive:
            archive.writestr(link, "../../outside")
        with self.assertRaisesRegex(RuntimeError, "Unsafe ZIP link"):
            closeout.validate_zip(file)

    @unittest.skipUnless(sys.platform == "darwin", "Requires the Apple plist parser")
    def test_wails_plist_parses_without_rewriting_signed_bytes(self):
        app = self.root / "MoRead.app"
        info_file = app / "Contents/Info.plist"
        info_file.parent.mkdir(parents=True)
        info = {"CFBundleIdentifier": closeout.BUNDLE_ID,
                "CFBundleVersion": "1.1.1", "CFBundleShortVersionString": "1.1.1"}
        original = plistlib.dumps(info).split(b"\n", 1)[1]
        info_file.write_bytes(original)
        self.assertEqual(closeout.app_info(app, "1.1.1"), app / "Contents/MacOS/MoRead")
        self.assertEqual(info_file.read_bytes(), original)
        with self.assertRaisesRegex(RuntimeError, "expected 1.1.2"):
            closeout.app_info(app, "1.1.2")

    def entries(self, second_exists):
        app = self.root / "MoRead.app"
        app.mkdir()
        second = self.root / "build/MoRead.app"
        if second_exists:
            second.mkdir(parents=True)
        # Real lsregister formatting, including separators of different lengths.
        dump = (f"{'-' * 80}\npath: {app} (0x1)\nidentifier: {closeout.BUNDLE_ID}\n"
                f"{'-' * 81}\npath: {second} (0x2)\nidentifier: {closeout.BUNDLE_ID}\n")
        def fake_run(*args):
            if args[0] == closeout.LSREGISTER:
                return dump
            return ""
        with patch.object(closeout, "APP", app), patch.object(closeout, "run", side_effect=fake_run):
            return closeout.verify_entries()

    def test_existing_duplicate_entry_blocks_closeout(self):
        with self.assertRaisesRegex(RuntimeError, "Multiple valid application entries"):
            self.entries(second_exists=True)

    def test_removed_entry_does_not_count_as_valid_copy(self):
        self.assertEqual(self.entries(second_exists=False), [str((self.root / "MoRead.app").resolve())])

    def running_instance(self, inode):
        app = self.root / "MoRead.app"
        binary = app / "Contents/MacOS/MoRead"
        binary.parent.mkdir(parents=True)
        binary.touch()
        def fake_run(*args):
            if args[0] == "ps":
                return f"123 {binary}\n"
            if args[0] == "lsof":
                return f"p123\nftxt\ni{inode or binary.stat().st_ino}\nn{binary}\n"
            return ""
        with patch.object(closeout, "APP", app), patch.object(closeout, "run", side_effect=fake_run):
            return closeout.verify_entries()

    def test_old_running_inode_blocks_closeout(self):
        with self.assertRaisesRegex(RuntimeError, "different executable"):
            self.running_instance(inode=-1)

    def test_current_running_inode_passes(self):
        self.assertEqual(self.running_instance(inode=None), [str((self.root / "MoRead.app").resolve())])


if __name__ == "__main__":
    unittest.main()
