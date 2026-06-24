"""Encrypt a superadmin password for config/auth.json."""

from __future__ import annotations

import sys

from auth_config import encrypt_superadmin_password


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1]:
        raise SystemExit('Usage: py scripts/encrypt_superadmin_password.py "your-password"')

    print(encrypt_superadmin_password(sys.argv[1]))


if __name__ == "__main__":
    main()
