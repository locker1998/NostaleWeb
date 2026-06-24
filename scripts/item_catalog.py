"""Fetch and normalize item data from itempicker.atlagaming.eu."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ITEMS_JSON_URL = "https://itempicker.atlagaming.eu/items.json"
ITEM_ICON_URL_BASE = "https://itempicker.atlagaming.eu/api/items/icon"
USER_AGENT = "Mozilla/5.0 (compatible; NostaleWeb/2.0; +https://github.com/locker1998/NostaleWeb)"

# itempicker / in-game labels: ADV, WAR, ARC, MAG, M.A
ITEM_CLASS_BITS: tuple[tuple[int, str], ...] = (
    (1, "ADV"),
    (2, "WAR"),
    (4, "ARC"),
    (8, "MAG"),
    (16, "M.A"),
)

ITEM_INSERT_SQL = """
INSERT INTO items (
  ItemVNum,
  name,
  category,
  IsAdventurer,
  IsSwordsman,
  IsArcher,
  IsMage,
  IsMartialArtist,
  RequiredLv,
  RequiredCLv,
  MinAttack,
  MaxAttack,
  HitRate,
  CritChance,
  CritDmg,
  Concentration,
  MeleeDefence,
  RangedDefence,
  MagicDefence,
  Dodge,
  Duration,
  Price,
  Rarity,
  DynamicGroupName,
  Shell,
  Effects,
  Description,
  NameCode,
  DescCode,
  LineDesc,
  InventoryType,
  ItemType,
  ItemSubType,
  EquipmentSlot,
  IconId,
  Design,
  RawUnknown,
  ClassMask,
  FlagJson,
  BuffCodeJson,
  BuffJson,
  NameI18nJson,
  DescI18nJson
) VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
)
"""


def pick_localized_text(values: dict[str, Any] | None, preferred: tuple[str, ...] = ("uk", "en")) -> str:
    if not values:
        return ""
    for key in preferred:
        text = values.get(key)
        if isinstance(text, str) and text.strip():
            return text.strip()
    for text in values.values():
        if isinstance(text, str) and text.strip():
            return text.strip()
    return ""


def pick_localized_lines(values: dict[str, Any] | None, preferred: tuple[str, ...] = ("uk", "en")) -> list[str]:
    if not values:
        return []
    for key in preferred:
        lines = values.get(key)
        if isinstance(lines, list):
            return [str(line).strip() for line in lines if str(line).strip()]
    for lines in values.values():
        if isinstance(lines, list):
            return [str(line).strip() for line in lines if str(line).strip()]
    return []


def map_category(item: dict[str, Any]) -> str:
    item_type = int(item.get("itemType") or 0)
    item_sub_type = int(item.get("itemSubType") or 0)

    if item_type == 0:
        return "weapon"
    if item_type == 1:
        return "armour"
    if item_type == 2:
        return "equipment"
    if item_type == 3:
        return "accessories"
    if item_type == 4:
        return "specialist"
    if item_type == 5:
        if item_sub_type in {3, 4, 5}:
            return "main_item"
        return "consumer_item"
    if item_type == 6:
        return "shell"
    if item_type == 7:
        return "pet"
    if item_type == 8:
        return "miscellaneous"
    return "miscellaneous"


def parse_class_flags(class_mask: int) -> dict[str, int]:
    """Map itempicker class bitmask to per-class flags.

    Bits: 1=ADV, 2=WAR, 4=ARC, 8=MAG, 16=M.A (0 = all classes).
    """
    if class_mask == 0:
        return {
            "IsAdventurer": 1,
            "IsSwordsman": 1,
            "IsArcher": 1,
            "IsMage": 1,
            "IsMartialArtist": 1,
        }

    return {
        "IsAdventurer": int(bool(class_mask & 1)),
        "IsSwordsman": int(bool(class_mask & 2)),
        "IsArcher": int(bool(class_mask & 4)),
        "IsMage": int(bool(class_mask & 8)),
        "IsMartialArtist": int(bool(class_mask & 16)),
    }


def class_abbreviations(class_mask: int) -> list[str]:
    if class_mask == 0:
        return [abbr for _, abbr in ITEM_CLASS_BITS]
    return [abbr for bit, abbr in ITEM_CLASS_BITS if class_mask & bit]


def class_display(class_mask: int) -> str:
    return "".join(class_abbreviations(class_mask))


def item_icon_url(item_vnum: int) -> str:
    return f"{ITEM_ICON_URL_BASE}/{int(item_vnum)}"


def _positive(value: Any) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def parse_buff_stats(item: dict[str, Any]) -> dict[str, int | None]:
    item_type = int(item.get("itemType") or 0)
    buff_code = [int(value) for value in (item.get("buff_code") or [])]
    stats: dict[str, int | None] = {
        "RequiredLv": None,
        "RequiredCLv": None,
        "MinAttack": None,
        "MaxAttack": None,
        "HitRate": None,
        "CritChance": None,
        "CritDmg": None,
        "Concentration": None,
        "MeleeDefence": None,
        "RangedDefence": None,
        "MagicDefence": None,
        "Dodge": None,
        "Duration": None,
    }

    if not buff_code:
        return stats

    if item_type == 0:
        first = buff_code[0]
        second = buff_code[1] if len(buff_code) > 1 else None
        if first == -1:
            stats["MaxAttack"] = _positive(second)
        elif first > 0:
            stats["RequiredLv"] = first
            stats["MaxAttack"] = _positive(second)
        return stats

    if item_type in {1, 2}:
        stats["RequiredLv"] = _positive(buff_code[0])
        if len(buff_code) > 5:
            stats["MeleeDefence"] = _positive(buff_code[5])
        if len(buff_code) > 6:
            stats["RangedDefence"] = _positive(buff_code[6])
        if len(buff_code) > 7:
            stats["MagicDefence"] = _positive(buff_code[7])
        if len(buff_code) > 8:
            stats["Dodge"] = _positive(buff_code[8])
        return stats

    if item_type == 3:
        stats["RequiredLv"] = _positive(buff_code[0])
        return stats

    stats["RequiredLv"] = _positive(buff_code[0])
    return stats


def normalize_item(item: dict[str, Any]) -> dict[str, Any]:
    class_mask = int(item.get("class") or 0)
    class_flags = parse_class_flags(class_mask)
    stats = parse_buff_stats(item)
    buff_lines = pick_localized_lines(item.get("buff"))

    return {
        "ItemVNum": int(item["id"]),
        "name": pick_localized_text(item.get("name")) or f"Item {item['id']}",
        "category": map_category(item),
        **class_flags,
        **stats,
        "Price": int(item.get("price") or 0),
        "Rarity": None,
        "DynamicGroupName": None,
        "Shell": None,
        "Effects": "\n".join(buff_lines) if buff_lines else None,
        "Description": pick_localized_text(item.get("desc")) or None,
        "NameCode": item.get("name_code"),
        "DescCode": item.get("desc_code"),
        "LineDesc": int(item.get("linedesc") or 0),
        "InventoryType": int(item.get("inventoryType") or 0),
        "ItemType": int(item.get("itemType") or 0),
        "ItemSubType": int(item.get("itemSubType") or 0),
        "EquipmentSlot": int(item.get("equipmentSlot") or 0),
        "IconId": int(item.get("iconId") or 0),
        "Design": int(item.get("design") or 0),
        "RawUnknown": int(item.get("unknown") or 0),
        "ClassMask": class_mask,
        "FlagJson": json.dumps(item.get("flag") or {}, ensure_ascii=False, separators=(",", ":")),
        "BuffCodeJson": json.dumps(item.get("buff_code") or [], separators=(",", ":")),
        "BuffJson": json.dumps(item.get("buff") or {}, ensure_ascii=False, separators=(",", ":")),
        "NameI18nJson": json.dumps(item.get("name") or {}, ensure_ascii=False, separators=(",", ":")),
        "DescI18nJson": json.dumps(item.get("desc") or {}, ensure_ascii=False, separators=(",", ":")),
    }


def item_row_tuple(row: dict[str, Any]) -> tuple[Any, ...]:
    return (
        row["ItemVNum"],
        row["name"],
        row["category"],
        row["IsAdventurer"],
        row["IsSwordsman"],
        row["IsArcher"],
        row["IsMage"],
        row["IsMartialArtist"],
        row["RequiredLv"],
        row["RequiredCLv"],
        row["MinAttack"],
        row["MaxAttack"],
        row["HitRate"],
        row["CritChance"],
        row["CritDmg"],
        row["Concentration"],
        row["MeleeDefence"],
        row["RangedDefence"],
        row["MagicDefence"],
        row["Dodge"],
        row["Duration"],
        row["Price"],
        row["Rarity"],
        row["DynamicGroupName"],
        row["Shell"],
        row["Effects"],
        row["Description"],
        row["NameCode"],
        row["DescCode"],
        row["LineDesc"],
        row["InventoryType"],
        row["ItemType"],
        row["ItemSubType"],
        row["EquipmentSlot"],
        row["IconId"],
        row["Design"],
        row["RawUnknown"],
        row["ClassMask"],
        row["FlagJson"],
        row["BuffCodeJson"],
        row["BuffJson"],
        row["NameI18nJson"],
        row["DescI18nJson"],
    )


def fetch_items_json(url: str = ITEMS_JSON_URL, timeout: int = 120) -> list[dict[str, Any]]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read())

    if not isinstance(payload, list):
        raise ValueError("items.json must be a JSON array")
    return payload


def load_items_json(root: Path, *, url: str = ITEMS_JSON_URL) -> list[dict[str, Any]]:
    from data_vault import get_vault

    vault = get_vault(root / "data")

    def load_from_vault() -> list[dict[str, Any]] | None:
        if not vault.exists("items.json"):
            return None
        payload = json.loads(vault.read_text("items.json"))
        if not isinstance(payload, list):
            raise ValueError("items.json in data vault must be a JSON array")
        return payload

    try:
        return fetch_items_json(url=url)
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        payload = load_from_vault()
        if payload is not None:
            return payload
        raise RuntimeError(
            f"Could not download items.json ({exc}) and items.json is not in the data vault"
        ) from exc


def build_item_rows(items: list[dict[str, Any]]) -> list[tuple[Any, ...]]:
    rows: list[tuple[Any, ...]] = []
    for item in items:
        if "id" not in item:
            continue
        rows.append(item_row_tuple(normalize_item(item)))
    return rows
