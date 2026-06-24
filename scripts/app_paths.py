"""Application root paths (dev checkout and PyInstaller bundle)."""

from __future__ import annotations

import sys
from pathlib import Path


def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def app_root() -> Path:
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def server_run_hint() -> str:
    if is_frozen():
        return "NostaleWeb.exe"
    return "py scripts\\server.py"


def init_db_hint() -> str:
    if is_frozen():
        return "Close and restart NostaleWeb.exe to initialize the database."
    return "Run: py scripts\\init_db.py"
