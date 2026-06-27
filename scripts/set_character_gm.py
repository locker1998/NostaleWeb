"""Set IsGM on a character by name (run with server stopped)."""

from __future__ import annotations

import sqlite3
import sys

from app_paths import app_root
from data_vault import get_vault


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python scripts/set_character_gm.py <characterName> <0|1>")

    name = sys.argv[1].strip()
    is_gm = int(sys.argv[2])
    if is_gm not in (0, 1):
        raise SystemExit("GM flag must be 0 or 1")

    vault = get_vault(app_root() / "data")
    conn = sqlite3.connect(vault.db_work_path())
    try:
        row = conn.execute(
            """
            SELECT id, name, IsGM
            FROM characters
            WHERE lower(name) = lower(?) AND COALESCE(IsDeleted, 0) = 0
            """,
            (name,),
        ).fetchone()
        if row is None:
            raise SystemExit(f"Character not found: {name}")

        conn.execute("UPDATE characters SET IsGM = ? WHERE id = ?", (is_gm, row[0]))
        conn.commit()
        vault.persist_db()
        print(f"Set IsGM={is_gm} for id={row[0]} name={row[1]} (was IsGM={row[2]})")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
