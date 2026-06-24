"""Superadmin credentials loaded from config/auth.json."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

_SUPERADMIN_KEY_MATERIAL = b"nosbazaar-superadmin-key-v1"


def superadmin_fernet() -> Fernet:
    digest = hashlib.sha256(_SUPERADMIN_KEY_MATERIAL).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_superadmin_password(password: str) -> str:
    return superadmin_fernet().encrypt(password.encode("utf-8")).decode("ascii")


def decrypt_superadmin_password(password_enc: str) -> str:
    return superadmin_fernet().decrypt(password_enc.encode("ascii")).decode("utf-8")


def load_auth_config(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid {path}: {exc}") from exc

    if not isinstance(data, dict):
        raise SystemExit(f"{path} must be a JSON object")

    return data


def get_superadmin_config(auth_config: dict[str, Any] | None) -> dict[str, Any] | None:
    if not auth_config:
        return None

    superadmin = auth_config.get("superadmin")
    if not isinstance(superadmin, dict):
        return None

    username = superadmin.get("username")
    password_enc = superadmin.get("passwordEnc")
    if not isinstance(username, str) or not username.strip():
        return None
    if not isinstance(password_enc, str) or not password_enc.strip():
        return None

    return {
        "username": username.strip(),
        "passwordEnc": password_enc.strip(),
    }


def verify_superadmin(username: str, password: str, auth_config: dict[str, Any] | None) -> bool:
    superadmin = get_superadmin_config(auth_config)
    if superadmin is None:
        return False

    if username.strip() != superadmin["username"]:
        return False

    try:
        stored_password = decrypt_superadmin_password(superadmin["passwordEnc"])
    except (InvalidToken, ValueError):
        return False

    return secrets.compare_digest(password, stored_password)


def is_reserved_superadmin_username(username: str, auth_config: dict[str, Any] | None) -> bool:
    superadmin = get_superadmin_config(auth_config)
    if superadmin is None:
        return False
    return username.strip().lower() == superadmin["username"].lower()
