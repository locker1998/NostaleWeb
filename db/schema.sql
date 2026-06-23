PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  gold INTEGER NOT NULL DEFAULT 0,
  skill_page INTEGER NOT NULL DEFAULT 1,
  skill_slots_locked INTEGER NOT NULL DEFAULT 0,
  skill_alt_hotkeys INTEGER NOT NULL DEFAULT 0
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
  player_id INTEGER NOT NULL,
  item_instance_id INTEGER NOT NULL,
  price INTEGER NOT NULL,
  list_date TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(id),
  FOREIGN KEY (item_instance_id) REFERENCES item_instances(id)
);

CREATE INDEX IF NOT EXISTS idx_bazaar_player ON bazaar(player_id);
CREATE INDEX IF NOT EXISTS idx_bazaar_instance ON bazaar(item_instance_id);
CREATE INDEX IF NOT EXISTS idx_bazaar_list_date ON bazaar(list_date);
CREATE INDEX IF NOT EXISTS idx_item_instances_vnum ON item_instances(ItemVNum);

CREATE TABLE IF NOT EXISTS skills (
  name TEXT PRIMARY KEY,
  description TEXT
);
