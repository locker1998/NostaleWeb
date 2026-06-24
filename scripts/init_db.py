"""Create an empty SQLite database."""

import sqlite3

from app_paths import app_root
from data_vault import get_vault

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
  IsGM INTEGER NOT NULL DEFAULT 0,
  IsDeleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, slot_index),
  CHECK(slot_index BETWEEN 1 AND 3)
);

CREATE TABLE IF NOT EXISTS items (
  ItemVNum INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
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
  Description TEXT
);

CREATE TABLE IF NOT EXISTS item_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ItemVNum INTEGER NOT NULL,
  Quantity INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (ItemVNum) REFERENCES items(ItemVNum)
);

CREATE TABLE IF NOT EXISTS bazaar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  item_instance_id INTEGER NOT NULL,
  price INTEGER NOT NULL,
  list_date TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id),
  FOREIGN KEY (item_instance_id) REFERENCES item_instances(id)
);

CREATE INDEX IF NOT EXISTS idx_bazaar_character ON bazaar(character_id);
CREATE INDEX IF NOT EXISTS idx_bazaar_instance ON bazaar(item_instance_id);
CREATE INDEX IF NOT EXISTS idx_bazaar_list_date ON bazaar(list_date);
CREATE INDEX IF NOT EXISTS idx_item_instances_vnum ON item_instances(ItemVNum);
CREATE INDEX IF NOT EXISTS idx_characters_account ON characters(account_id);

CREATE TABLE IF NOT EXISTS skills (
  name TEXT PRIMARY KEY,
  description TEXT
);
"""


def main() -> None:
    work_db = vault.db_work_path()
    if work_db.exists():
        work_db.unlink()

    conn = sqlite3.connect(work_db)
    conn.executescript(SCHEMA_SQL)
    conn.commit()
    conn.close()

    vault.persist_db()
    print("Wrote empty nosbazaar.db to data vault")


if __name__ == "__main__":
    main()
