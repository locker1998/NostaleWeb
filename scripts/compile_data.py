"""Compile plain files from data/_plain/ into encrypted data/data000, data001, …"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

from data_vault import DataVault, resolve_work_plain


def main() -> None:
    try:
        source = resolve_work_plain(ROOT)
    except FileNotFoundError as exc:
        raise SystemExit(str(exc)) from exc

    vault = DataVault(ROOT / "data")
    packed = vault.compile_from_plain(source)
    print(f"Compiled {len(packed)} file(s) from {source} into {vault.data_dir}:")
    for name in packed:
        print(f"  - {name}")


if __name__ == "__main__":
    main()
