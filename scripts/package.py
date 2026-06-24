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


def copy_runtime_files() -> None:
    shutil.copytree(ROOT / "web", DIST_DIR / "web", dirs_exist_ok=True)
    shutil.copytree(ROOT / "config", DIST_DIR / "config", dirs_exist_ok=True)

    data_dir = DIST_DIR / "data"
    if data_dir.exists():
        shutil.rmtree(data_dir)
    data_dir.mkdir(parents=True)

    sys.path.insert(0, str(SCRIPTS))
    from data_vault import DataVault, resolve_work_plain

    try:
        plain = resolve_work_plain(ROOT)
    except FileNotFoundError as exc:
        raise SystemExit(str(exc)) from exc

    vault = DataVault(data_dir)
    vault.compile_from_plain(plain)


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
