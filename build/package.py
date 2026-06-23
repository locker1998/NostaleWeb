"""Build a Windows release folder and zip archive for GitHub Releases."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "dist" / "NostaleWeb"
ZIP_BASE = ROOT / "dist" / "NostaleWeb-windows-x64"


def copy_runtime_files() -> None:
    for pattern in ("*.html", "*.js", "*.css"):
        for path in ROOT.glob(pattern):
            shutil.copy2(path, DIST_DIR / path.name)

    shutil.copytree(ROOT / "assets", DIST_DIR / "assets", dirs_exist_ok=True)
    shutil.copytree(ROOT / "db", DIST_DIR / "db", dirs_exist_ok=True)

    data_dir = DIST_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "data" / "items.json", data_dir / "items.json")

    for generated in (data_dir / "nosbazaar.db", data_dir / "filters.json"):
        if generated.exists():
            generated.unlink()


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
            "--hidden-import",
            "db.init_db",
            "--console",
            str(ROOT / "server.py"),
        ],
        check=True,
        cwd=ROOT,
    )

    copy_runtime_files()

    zip_path = shutil.make_archive(str(ZIP_BASE), "zip", ROOT / "dist", "NostaleWeb")
    print(f"Release ready: {zip_path}")


if __name__ == "__main__":
    main()
