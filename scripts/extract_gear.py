"""Extract settings gear sprites and pack them into the encrypted vault."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITE_CANDIDATES = (
    ROOT / "data" / "_plain" / "assets" / "ui-sprites.png",
    ROOT.parent
    / "assets"
    / "c__Users_kamin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_1593835568-d2618cd7-d298-4a5d-8887-1ef94f03f454.png",
)
OUT_DIR = ROOT / "data" / "_plain" / "assets"

# Column 8 (1-based) in the top UI strip: 30x30 cells, y rows = normal/hover/active.
GEAR_X = 210
GEAR_Y = 0
GEAR_SIZE = 30


def resolve_spritesheet() -> Path:
    for candidate in SPRITE_CANDIDATES:
        if candidate.is_file():
            return candidate
    raise SystemExit(
        "Missing ui-sprites.png. Add it under data/_plain/assets/ or the workspace assets folder."
    )


def main() -> None:
    sprites = resolve_spritesheet()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.open(sprites).convert("RGBA")
    packed: list[Path] = []
    for row, name in enumerate(("normal", "hover", "active")):
        y = GEAR_Y + row * GEAR_SIZE
        out_path = OUT_DIR / f"settings-gear-{name}.png"
        img.crop((GEAR_X, y, GEAR_X + GEAR_SIZE, y + GEAR_SIZE)).save(out_path)
        packed.append(out_path)

    sys.path.insert(0, str(ROOT / "scripts"))
    from data_vault import DataVault

    vault = DataVault(ROOT / "data")
    for out_path in packed:
        logical_name = f"assets/{out_path.name}"
        vault.pack_plain_file(logical_name, out_path)
        print(f"Packed {logical_name}")

    print(f"Wrote gear sprites from ({GEAR_X}, {GEAR_Y}) size {GEAR_SIZE}x{GEAR_SIZE}")


if __name__ == "__main__":
    main()
