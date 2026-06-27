"""Create an empty SQLite database."""

import sqlite3

from app_paths import app_root
from data_vault import get_vault
from item_catalog import ITEM_INSERT_SQL, build_item_rows, load_items_json

ROOT = app_root()
vault = get_vault(ROOT / "data")

SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  IsAdmin INTEGER NOT NULL DEFAULT 0,
  IsDeleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  name TEXT NOT NULL UNIQUE,
  slot_index INTEGER NOT NULL,
  gold INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  champion_level INTEGER NOT NULL DEFAULT 0,
  job TEXT NOT NULL DEFAULT 'Adventurer',
  job_level INTEGER NOT NULL DEFAULT 1,
  gender TEXT NOT NULL DEFAULT 'male',
  hair_style TEXT NOT NULL DEFAULT 'A',
  hair_colour INTEGER NOT NULL DEFAULT 1,
  skill_page INTEGER NOT NULL DEFAULT 1,
  skill_slots_locked INTEGER NOT NULL DEFAULT 0,
  skill_alt_hotkeys INTEGER NOT NULL DEFAULT 0,
  new_bazaar_inventory INTEGER NOT NULL DEFAULT 1,
  IsGM INTEGER NOT NULL DEFAULT 0,
  IsDeleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, slot_index),
  CHECK(slot_index BETWEEN 1 AND 99)
);

CREATE TABLE IF NOT EXISTS items (
  ItemVNum INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  IsAdventurer INTEGER NOT NULL DEFAULT 0,
  IsSwordsman INTEGER NOT NULL DEFAULT 0,
  IsArcher INTEGER NOT NULL DEFAULT 0,
  IsMage INTEGER NOT NULL DEFAULT 0,
  IsMartialArtist INTEGER NOT NULL DEFAULT 0,
  RequiredLv INTEGER,
  RequiredCLv INTEGER,
  MinAttack INTEGER,
  MaxAttack INTEGER,
  HitRate INTEGER,
  CritChance INTEGER,
  CritDmg INTEGER,
  Concentration INTEGER,
  MeleeDefence INTEGER,
  RangedDefence INTEGER,
  MagicDefence INTEGER,
  Dodge INTEGER,
  Duration INTEGER,
  Price INTEGER NOT NULL DEFAULT 0,
  Rarity TEXT,
  DynamicGroupName TEXT,
  Shell TEXT,
  Effects TEXT,
  Description TEXT,
  NameCode TEXT,
  DescCode TEXT,
  LineDesc INTEGER NOT NULL DEFAULT 0,
  InventoryType INTEGER NOT NULL DEFAULT 0,
  ItemType INTEGER NOT NULL DEFAULT 0,
  ItemSubType INTEGER NOT NULL DEFAULT 0,
  EquipmentSlot INTEGER NOT NULL DEFAULT 0,
  IconId INTEGER NOT NULL DEFAULT 0,
  Design INTEGER NOT NULL DEFAULT 0,
  RawUnknown INTEGER NOT NULL DEFAULT 0,
  ClassMask INTEGER NOT NULL DEFAULT 0,
  FlagJson TEXT NOT NULL DEFAULT '{}',
  BuffCodeJson TEXT NOT NULL DEFAULT '[]',
  BuffJson TEXT NOT NULL DEFAULT '{}',
  NameI18nJson TEXT NOT NULL DEFAULT '{}',
  DescI18nJson TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS item_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ItemVNum INTEGER NOT NULL,
  Quantity INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (ItemVNum) REFERENCES items(ItemVNum)
);

CREATE TABLE IF NOT EXISTS character_inventory (
  character_id INTEGER NOT NULL,
  pocket INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  item_instance_id INTEGER NOT NULL UNIQUE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (item_instance_id) REFERENCES item_instances(id) ON DELETE CASCADE,
  UNIQUE(character_id, pocket, slot),
  CHECK(slot BETWEEN 0 AND 47)
);

CREATE TABLE IF NOT EXISTS bazaar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  item_instance_id INTEGER NOT NULL,
  price INTEGER NOT NULL,
  list_date TEXT NOT NULL,
  listing_period INTEGER NOT NULL DEFAULT 30,
  bundle_sale INTEGER NOT NULL DEFAULT 0,
  listed_quantity INTEGER,
  listing_type TEXT NOT NULL DEFAULT 'fixed',
  starting_price INTEGER,
  instant_price INTEGER,
  bid_increment INTEGER,
  current_bid INTEGER NOT NULL DEFAULT 0,
  current_bidder_id INTEGER,
  anonymous_seller INTEGER NOT NULL DEFAULT 0,
  anonymous_buyer INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (character_id) REFERENCES characters(id),
  FOREIGN KEY (item_instance_id) REFERENCES item_instances(id)
);

CREATE TABLE IF NOT EXISTS bazaar_bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bazaar_id INTEGER NOT NULL,
  bidder_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (bazaar_id) REFERENCES bazaar(id) ON DELETE CASCADE,
  FOREIGN KEY (bidder_id) REFERENCES characters(id)
);

CREATE INDEX IF NOT EXISTS idx_bazaar_bids_bazaar ON bazaar_bids(bazaar_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_bazaar_character ON bazaar(character_id);
CREATE INDEX IF NOT EXISTS idx_bazaar_instance ON bazaar(item_instance_id);
CREATE INDEX IF NOT EXISTS idx_bazaar_list_date ON bazaar(list_date);
CREATE INDEX IF NOT EXISTS idx_item_instances_vnum ON item_instances(ItemVNum);
CREATE INDEX IF NOT EXISTS idx_character_inventory_character ON character_inventory(character_id);
CREATE INDEX IF NOT EXISTS idx_character_inventory_instance ON character_inventory(item_instance_id);
CREATE TABLE IF NOT EXISTS character_merchant_medals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  item_vnum INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (item_vnum) REFERENCES items(ItemVNum)
);

CREATE INDEX IF NOT EXISTS idx_character_merchant_medals_character ON character_merchant_medals(character_id);
CREATE INDEX IF NOT EXISTS idx_character_merchant_medals_expires ON character_merchant_medals(character_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_characters_account ON characters(account_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_item_type ON items(ItemType, ItemSubType);

CREATE TABLE IF NOT EXISTS skills (
  name TEXT PRIMARY KEY,
  description TEXT
);
"""


def import_items(conn: sqlite3.Connection) -> int:
    raw_items = load_items_json(ROOT)
    rows = build_item_rows(raw_items)
    conn.executemany(ITEM_INSERT_SQL, rows)
    return len(rows)


def main() -> None:
    work_db = vault.db_work_path()
    if work_db.exists():
        work_db.unlink()

    conn = sqlite3.connect(work_db)
    conn.executescript(SCHEMA_SQL)
    item_count = import_items(conn)
    conn.commit()
    conn.close()

    vault.persist_db()
    print(f"Wrote nosbazaar.db to data vault with {item_count} items")


if __name__ == "__main__":
    main()
