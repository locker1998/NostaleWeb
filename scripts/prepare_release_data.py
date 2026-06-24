"""Populate data/_plain for CI and release builds from tracked release_data."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
RELEASE_PLAIN = ROOT / "release_data" / "_plain"
TARGET_PLAIN = ROOT / "data" / "_plain"


def copy_seed_assets() -> None:
    seed_assets = RELEASE_PLAIN / "assets"
    if not seed_assets.is_dir():
        raise SystemExit(
            f"Missing tracked release assets at {seed_assets}\n"
            "Copy your local data/_plain/assets into release_data/_plain/assets and commit."
        )

    target_assets = TARGET_PLAIN / "assets"
    if target_assets.exists():
        shutil.rmtree(target_assets)
    shutil.copytree(seed_assets, target_assets)


def download_items_json() -> None:
    sys.path.insert(0, str(SCRIPTS))
    from item_catalog import load_items_json

    load_items_json(ROOT)


def main() -> None:
    TARGET_PLAIN.mkdir(parents=True, exist_ok=True)
    copy_seed_assets()
    download_items_json()
    print(f"Release data ready under {TARGET_PLAIN}")


if __name__ == "__main__":
    main()
