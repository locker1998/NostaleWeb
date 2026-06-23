"""Create SQLite database and seed from data/items.json (one-time migration source)."""

import hashlib
import json
import sqlite3
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "nosbazaar.db"
ITEMS_JSON = ROOT / "data" / "items.json"
FILTERS_JSON = ROOT / "data" / "filters.json"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

LISTING_TTL_DAYS = 30

CATEGORY_MAP = {
    "accessory": "accessories",
    "armor": "armour",
    "material": "miscellaneous",
}

ITEM_COLUMNS = (
    "ItemVNum",
    "name",
    "category",
    "IsSwordsman",
    "IsArcher",
    "IsMage",
    "IsMartialArtist",
    "RequiredLv",
    "RequiredCLv",
    "MinAttack",
    "MaxAttack",
    "HitRate",
    "CritChance",
    "CritDmg",
    "Concentration",
    "MeleeDefence",
    "RangedDefence",
    "MagicDefence",
    "Dodge",
    "Duration",
    "Price",
    "Rarity",
    "DynamicGroupName",
    "Shell",
    "Effects",
    "Description",
)

# Per-vnum stat overrides; unset fields use category defaults below.
ITEM_OVERRIDES: dict[int, dict] = {
    4202: {
        "name": "Antler Hat",
        "IsSwordsman": 1,
        "IsArcher": 1,
        "IsMage": 1,
        "RequiredLv": 20,
        "MeleeDefence": 4,
        "RangedDefence": 5,
        "MagicDefence": 4,
        "Dodge": 0,
        "Price": 2400,
        "Rarity": "Normal",
        "DynamicGroupName": "Hat",
        "Effects": (
            "Increase HP.\n"
            "Provide a chance of protection from the Mandra's scream."
        ),
        "Description": (
            "Generates resistance to a certian effect.\n"
            "Maximum HP is increased by 100."
        ),
    },
    3012: {
        "IsSwordsman": 1,
        "IsArcher": 1,
        "IsMage": 1,
        "IsMartialArtist": 1,
        "RequiredLv": 55,
        "MeleeDefence": 120,
        "RangedDefence": 120,
        "MagicDefence": 120,
        "Dodge": 8,
        "Price": 45000,
        "Rarity": "Legendary",
        "DynamicGroupName": "Armour",
        "Description": "Armor forged from dragon scales.",
    },
    5101: {
        "IsSwordsman": 1,
        "IsArcher": 1,
        "IsMage": 1,
        "MinAttack": 180,
        "MaxAttack": 220,
        "HitRate": 120,
        "CritChance": 8,
        "Price": 12000,
        "Rarity": "Rare",
        "DynamicGroupName": "Shell",
        "Effects": "Shell weapon appearance.",
    },
    1012: {
        "IsSwordsman": 1,
        "IsArcher": 1,
        "IsMage": 1,
        "RequiredLv": 30,
        "Price": 8000,
        "Effects": "Increases attack power.",
    },
    1246: {
        "Price": 500,
        "Description": "A fairy's blessing in material form.",
    },
    2017: {
        "RequiredLv": 40,
        "Price": 25000,
        "Description": "A specialist card infused with golden light.",
    },
}

CATEGORY_DEFAULTS: dict[str, dict] = {
    "weapon": {"IsSwordsman": 1, "MinAttack": 50, "MaxAttack": 80, "Price": 5000},
    "armour": {
        "IsSwordsman": 1,
        "IsArcher": 1,
        "IsMage": 1,
        "MeleeDefence": 10,
        "RangedDefence": 10,
        "MagicDefence": 10,
        "Price": 3000,
    },
    "accessories": {"Price": 2000},
    "miscellaneous": {"Price": 150},
    "specialist": {"RequiredLv": 15, "Price": 10000},
    "material": {"Price": 100},
}


def hash_password(password: str) -> str:
    return hashlib.sha1(password.encode("utf-8")).hexdigest()


def normalize_category(category: str) -> str:
    return CATEGORY_MAP.get(category, category)


def build_item_row(item_vnum: int, name: str, category: str) -> dict:
    row = {
        "ItemVNum": item_vnum,
        "name": name,
        "category": category,
        "IsSwordsman": 0,
        "IsArcher": 0,
        "IsMage": 0,
        "IsMartialArtist": 0,
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
        "Price": 100,
        "Rarity": None,
        "DynamicGroupName": None,
        "Shell": None,
        "Effects": None,
        "Description": None,
    }
    row.update(CATEGORY_DEFAULTS.get(category, {}))
    row.update(ITEM_OVERRIDES.get(item_vnum, {}))
    row["ItemVNum"] = item_vnum
    row["category"] = category
    if "name" not in ITEM_OVERRIDES.get(item_vnum, {}):
        row["name"] = name
    return row


def insert_item(conn: sqlite3.Connection, row: dict) -> None:
    placeholders = ", ".join("?" for _ in ITEM_COLUMNS)
    columns = ", ".join(ITEM_COLUMNS)
    values = tuple(row[column] for column in ITEM_COLUMNS)
    conn.execute(
        f"INSERT OR REPLACE INTO items ({columns}) VALUES ({placeholders})",
        values,
    )


def main() -> None:
    if not ITEMS_JSON.exists():
        raise SystemExit(f"Missing seed file: {ITEMS_JSON}")

    raw = json.loads(ITEMS_JSON.read_text(encoding="utf-8"))

    filters = {key: value for key, value in raw.items() if key not in ("listings", "player")}
    FILTERS_JSON.write_text(json.dumps(filters, indent=2) + "\n", encoding="utf-8")

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))

    demo_gold = raw.get("player", {}).get("gold", 0)
    conn.execute(
        "INSERT INTO players (id, username, password, gold) VALUES (1, ?, ?, ?)",
        ("demo", hash_password("demo"), demo_gold),
    )

    conn.execute(
        "INSERT INTO skills (name, description) VALUES (?, ?)",
        ("NosBazaar", None),
    )

    sellers: dict[str, int] = {}
    next_player_id = 2
    seeded_items: set[int] = set()

    for listing in raw.get("listings", []):
        seller_name = listing["seller"]
        if seller_name not in sellers:
            conn.execute(
                "INSERT INTO players (id, username, password, gold) VALUES (?, ?, ?, 0)",
                (next_player_id, seller_name, hash_password("password")),
            )
            sellers[seller_name] = next_player_id
            next_player_id += 1

        item_vnum = int(listing["iconId"])
        category = normalize_category(listing["category"])
        if item_vnum not in seeded_items:
            insert_item(conn, build_item_row(item_vnum, listing["name"], category))
            seeded_items.add(item_vnum)

        quantity = int(listing["amount"])
        instance = conn.execute(
            "INSERT INTO item_instances (ItemVNum, Quantity) VALUES (?, ?)",
            (item_vnum, quantity),
        )
        instance_id = instance.lastrowid

        days_remaining = int(listing["days"])
        list_date = (
            date.today() - timedelta(days=LISTING_TTL_DAYS - days_remaining)
        ).isoformat()

        conn.execute(
            """
            INSERT INTO bazaar (id, player_id, item_instance_id, price, list_date)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                int(listing["id"]),
                sellers[seller_name],
                instance_id,
                int(listing["price"]),
                list_date,
            ),
        )

    conn.commit()
    conn.close()
    print(f"Wrote {FILTERS_JSON}")
    print(f"Database ready: {DB_PATH}")


if __name__ == "__main__":
    main()
