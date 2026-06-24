"""Build a Windows release folder and zip archive for GitHub Releases."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
DIST_DIR = ROOT / "dist" / "NostaleWeb"
ZIP_BASE = ROOT / "dist" / "NostaleWeb-windows-x64"

RELEASE_README = """NostaleWeb for Windows (64-bit)
===============================

No Python installation required.

1. Extract this entire folder somewhere (for example Downloads\\NostaleWeb).
2. Double-click NostaleWeb.exe.
3. Your browser opens to http://127.0.0.1:8080/
4. Keep the console window open while you play.

Important:
- Keep NostaleWeb.exe together with the _internal, web, config, and data folders.
- On first run the app creates its own database automatically.
- Register an account at /register to sign in.

Internet connection is required for item icons.
"""


def copy_runtime_files() -> None:
    shutil.copytree(ROOT / "web", DIST_DIR / "web", dirs_exist_ok=True)
    shutil.copytree(ROOT / "config", DIST_DIR / "config", dirs_exist_ok=True)
    (DIST_DIR / "README.txt").write_text(RELEASE_README, encoding="utf-8")

    sys.path.insert(0, str(SCRIPTS))
    from data_vault import copy_compiled_vault

    copy_compiled_vault(ROOT / "data", DIST_DIR / "data", exclude_db=True)


def main() -> None:
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)

    subprocess.run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--onedir",
            "--name",
            "NostaleWeb",
            "--paths",
            str(SCRIPTS),
            "--hidden-import",
            "app_paths",
            "--hidden-import",
            "auth_config",
            "--hidden-import",
            "routing.router",
            "--hidden-import",
            "init_db",
            "--hidden-import",
            "data_vault",
            "--hidden-import",
            "inventory",
            "--hidden-import",
            "item_catalog",
            "--hidden-import",
            "cryptography",
            "--collect-all",
            "cryptography",
            "--console",
            str(SCRIPTS / "server.py"),
        ],
        check=True,
        cwd=ROOT,
    )

    copy_runtime_files()

    zip_path = shutil.make_archive(str(ZIP_BASE), "zip", ROOT / "dist", "NostaleWeb")
    print(f"Release ready: {zip_path}")


if __name__ == "__main__":
    main()
