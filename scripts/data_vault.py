"""Encrypted data storage: data000 table of contents + data001… blobs."""

from __future__ import annotations

import hashlib
import json
import tempfile
from base64 import urlsafe_b64encode
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

TOC_NAME = "data000"
TOC_MASTER_KEY = "madebylocker"


def _toc_fernet() -> Fernet:
    digest = hashlib.sha256(TOC_MASTER_KEY.encode("utf-8")).digest()
    return Fernet(urlsafe_b64encode(digest))


class DataVault:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self._db_work_path: Path | None = None

    def toc_path(self) -> Path:
        return self.data_dir / TOC_NAME

    def has_toc(self) -> bool:
        return self.toc_path().exists()

    def load_toc(self) -> dict:
        raw = self.toc_path().read_bytes()
        try:
            payload = _toc_fernet().decrypt(raw)
        except InvalidToken:
            payload = raw
        return json.loads(payload.decode("utf-8"))

    def save_toc(self, toc: dict) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        payload = (json.dumps(toc, indent=2) + "\n").encode("utf-8")
        self.toc_path().write_bytes(_toc_fernet().encrypt(payload))

    def _entry_for_name(self, toc: dict, logical_name: str) -> tuple[str, dict] | None:
        for file_id, entry in toc.get("entries", {}).items():
            if entry["name"] == logical_name:
                return file_id, entry
        return None

    def _next_file_id(self, toc: dict) -> str:
        index = 1
        entries = toc.get("entries", {})
        while True:
            file_id = f"data{index:03d}"
            if file_id not in entries:
                return file_id
            index += 1

    def _fernet_key(self, entry: dict) -> bytes:
        key = entry["key"]
        return key.encode("utf-8") if isinstance(key, str) else key

    def exists(self, logical_name: str) -> bool:
        if not self.has_toc():
            return False
        return self._entry_for_name(self.load_toc(), logical_name) is not None

    def read_bytes(self, logical_name: str) -> bytes:
        toc = self.load_toc()
        found = self._entry_for_name(toc, logical_name)
        if not found:
            raise FileNotFoundError(logical_name)
        file_id, entry = found
        blob = (self.data_dir / file_id).read_bytes()
        return Fernet(self._fernet_key(entry)).decrypt(blob)

    def write_bytes(self, logical_name: str, data: bytes) -> None:
        toc = self.load_toc() if self.has_toc() else {"version": 1, "entries": {}}
        found = self._entry_for_name(toc, logical_name)
        if found:
            file_id, entry = found
            key = self._fernet_key(entry)
        else:
            file_id = self._next_file_id(toc)
            key = Fernet.generate_key()
            toc["entries"][file_id] = {
                "name": logical_name,
                "key": key.decode("utf-8"),
            }

        encrypted = Fernet(key).encrypt(data)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        (self.data_dir / file_id).write_bytes(encrypted)
        self.save_toc(toc)

    def read_text(self, logical_name: str) -> str:
        return self.read_bytes(logical_name).decode("utf-8")

    def write_text(self, logical_name: str, text: str) -> None:
        self.write_bytes(logical_name, text.encode("utf-8"))

    def pack_plain_file(self, logical_name: str, plain_path: Path) -> None:
        self.write_bytes(logical_name, plain_path.read_bytes())

    def compile_from_plain(self, plain_dir: Path) -> list[str]:
        if not plain_dir.is_dir():
            raise FileNotFoundError(plain_dir)

        plain_files = sorted(
            (path for path in plain_dir.rglob("*") if path.is_file()),
            key=lambda path: path.relative_to(plain_dir).as_posix(),
        )
        if not plain_files:
            raise ValueError(f"No files found in {plain_dir}")

        self.data_dir.mkdir(parents=True, exist_ok=True)

        preserve_names = ("nosbazaar.db",)
        preserved = {
            name: self.read_bytes(name)
            for name in preserve_names
            if self.exists(name)
        }

        for path in self.data_dir.glob("data*"):
            path.unlink()

        toc: dict = {"version": 1, "entries": {}}
        packed: list[str] = []
        for index, plain_path in enumerate(plain_files, start=1):
            logical_name = plain_path.relative_to(plain_dir).as_posix()
            file_id = f"data{index:03d}"
            key = Fernet.generate_key()
            encrypted = Fernet(key).encrypt(plain_path.read_bytes())
            (self.data_dir / file_id).write_bytes(encrypted)
            toc["entries"][file_id] = {
                "name": logical_name,
                "key": key.decode("utf-8"),
            }
            packed.append(logical_name)

        self.save_toc(toc)
        self._db_work_path = None

        for name, data in preserved.items():
            self.write_bytes(name, data)

        return packed

    def db_work_path(self) -> Path:
        if self._db_work_path is None:
            work_dir = Path(tempfile.gettempdir()) / "nostaleweb"
            work_dir.mkdir(parents=True, exist_ok=True)
            self._db_work_path = work_dir / "nosbazaar.db"
            if self.exists("nosbazaar.db"):
                self._db_work_path.write_bytes(self.read_bytes("nosbazaar.db"))
            elif self._db_work_path.exists():
                self._db_work_path.unlink()
        return self._db_work_path

    def persist_db(self) -> None:
        if self._db_work_path is None or not self._db_work_path.exists():
            return
        self.write_bytes("nosbazaar.db", self._db_work_path.read_bytes())


_vault: DataVault | None = None


def plain_dir(data_dir: Path) -> Path:
    return data_dir / "_plain"


def resolve_work_plain(root: Path) -> Path:
    """Return data/_plain when it exists and contains files to compile."""
    plain = plain_dir(root / "data")

    if not plain.is_dir():
        raise FileNotFoundError(
            f"Missing {plain}\n"
            f"Create it and add game files under {plain / 'assets'}\\, then run:\n"
            "  py scripts\\compile_data.py"
        )

    if not any(plain.rglob("*")):
        raise FileNotFoundError(f"No files found in {plain}")

    return plain


def ensure_vault_compiled(vault: DataVault, root: Path) -> None:
    if vault.has_toc():
        return

    plain = resolve_work_plain(root)
    vault.compile_from_plain(plain)


def ensure_vault_seed(vault: DataVault, root: Path) -> None:
    """Backward-compatible alias."""
    ensure_vault_compiled(vault, root)


def get_vault(data_dir: Path | None = None) -> DataVault:
    global _vault
    if _vault is None:
        if data_dir is None:
            from app_paths import app_root

            data_dir = app_root() / "data"
        _vault = DataVault(data_dir)
    return _vault
