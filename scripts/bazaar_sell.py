"""NosBazaar listing rules: merchant medals and listing fees."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import ceil
from typing import Any

import sqlite3

ALLOWED_LISTING_PERIODS = {1, 7, 15, 30}
DEFAULT_LISTING_PERIOD = 30


def listing_expiry_sql() -> str:
    return "date(b.list_date, '+' || b.listing_period || ' days')"


def format_listing_days_remaining(remaining_days: float) -> int:
    """Round up partial days; active listings always show at least 1 Day(s)."""
    remaining = float(remaining_days)
    if remaining <= 0:
        return 1
    return max(1, int(ceil(remaining)))


MERCHANT_MEDAL_VNUMS: dict[int, int] = {
    5060: 30,
    5061: 7,
    5062: 7,
    9066: 30,
    9067: 7,
    9068: 7,
}

MAX_UNIT_PRICE_WITHOUT_MEDAL = 2_000_000
MAX_UNIT_PRICE_WITH_MEDAL = 2_000_000_000
CHANGE_PRICE_FEE = 20_000


def is_merchant_medal_vnum(item_vnum: int) -> bool:
    return int(item_vnum) in MERCHANT_MEDAL_VNUMS


def medal_duration_days(item_vnum: int) -> int | None:
    return MERCHANT_MEDAL_VNUMS.get(int(item_vnum))


def calculate_listing_fee(total_price: int, has_merchant_medal: bool) -> int:
    """OpenNos SellBazaar tax formula (price = unit price * quantity)."""
    price = max(0, int(total_price))
    if has_merchant_medal:
        if price < 4000:
            return 50
        fee = 60 + (price - 4000) // 2000 * 30
        return min(fee, 10_000)

    if price > 100_000:
        return price // 200
    return 500


def calculate_sale_fee(total_price: int, has_merchant_medal: bool) -> int:
    if has_merchant_medal:
        return 0
    return calculate_listing_fee(total_price, False)


def max_unit_price(has_merchant_medal: bool) -> int:
    return MAX_UNIT_PRICE_WITH_MEDAL if has_merchant_medal else MAX_UNIT_PRICE_WITHOUT_MEDAL


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _iso_datetime(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def format_medal_remaining_text(total_seconds: int) -> str:
    if total_seconds <= 0:
        return ""

    total_hours = total_seconds // 3600
    days = total_hours // 24
    hours = total_hours % 24
    parts: list[str] = []
    if days > 0:
        parts.append(f"{days}Day(s)")
    if hours > 0 or not parts:
        parts.append(f"{hours}Hours")
    return f"( Time remaining: {' '.join(parts)} )"


def purge_expired_merchant_medals(conn: sqlite3.Connection, character_id: int) -> None:
    conn.execute(
        """
        DELETE FROM character_merchant_medals
        WHERE character_id = ? AND expires_at <= ?
        """,
        (character_id, _iso_datetime(_utc_now())),
    )


def get_active_merchant_medal(
    conn: sqlite3.Connection,
    character_id: int,
) -> dict[str, Any] | None:
    purge_expired_merchant_medals(conn, character_id)
    now = _utc_now()

    rows = conn.execute(
        """
        SELECT
          cm.item_vnum,
          cm.started_at,
          cm.expires_at,
          i.name,
          i.IconId
        FROM character_merchant_medals cm
        JOIN items i ON cm.item_vnum = i.ItemVNum
        WHERE cm.character_id = ? AND cm.expires_at > ?
        ORDER BY cm.started_at ASC, cm.id ASC
        """,
        (character_id, _iso_datetime(now)),
    ).fetchall()
    if not rows:
        return None

    total_seconds = 0
    for row in rows:
        expires_at = _parse_datetime(str(row["expires_at"]))
        total_seconds += max(0, int((expires_at - now).total_seconds()))

    if total_seconds <= 0:
        purge_expired_merchant_medals(conn, character_id)
        return None

    display = rows[0]
    return {
        "itemVNum": int(display["item_vnum"]),
        "name": display["name"],
        "iconId": int(display["IconId"]),
        "remainingText": format_medal_remaining_text(total_seconds),
    }


def activate_merchant_medal(
    conn: sqlite3.Connection,
    character_id: int,
    item_vnum: int,
) -> str:
    vnum = int(item_vnum)
    duration_days = medal_duration_days(vnum)
    if duration_days is None:
        raise ValueError("Item is not a NosMerchant Medal.")

    item = conn.execute(
        "SELECT ItemVNum, name, IconId FROM items WHERE ItemVNum = ?",
        (vnum,),
    ).fetchone()
    if item is None:
        raise ValueError(f"Unknown item vnum: {vnum}")

    now = _utc_now()
    expires_at = now + timedelta(days=duration_days)
    conn.execute(
        """
        INSERT INTO character_merchant_medals (character_id, item_vnum, started_at, expires_at)
        VALUES (?, ?, ?, ?)
        """,
        (character_id, vnum, _iso_datetime(now), _iso_datetime(expires_at)),
    )
    return str(item["name"])


def consume_inventory_quantity(
    conn: sqlite3.Connection,
    character_id: int,
    instance_id: int,
    amount: int = 1,
) -> None:
    if amount < 1:
        raise ValueError("Invalid amount.")

    row = conn.execute(
        """
        SELECT ii.Quantity AS quantity
        FROM character_inventory ci
        JOIN item_instances ii ON ci.item_instance_id = ii.id
        WHERE ci.character_id = ? AND ci.item_instance_id = ?
        """,
        (character_id, instance_id),
    ).fetchone()
    if row is None:
        raise ValueError("Item not found in inventory.")

    quantity = int(row["quantity"])
    if quantity < amount:
        raise ValueError("Not enough items in stack.")

    if quantity == amount:
        conn.execute("DELETE FROM item_instances WHERE id = ?", (instance_id,))
        return

    conn.execute(
        "UPDATE item_instances SET Quantity = ? WHERE id = ?",
        (quantity - amount, instance_id),
    )


def use_merchant_medal_from_inventory(
    conn: sqlite3.Connection,
    character_id: int,
    instance_id: int,
) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT ii.ItemVNum AS item_vnum
        FROM character_inventory ci
        JOIN item_instances ii ON ci.item_instance_id = ii.id
        WHERE ci.character_id = ? AND ci.item_instance_id = ?
        """,
        (character_id, instance_id),
    ).fetchone()
    if row is None:
        raise ValueError("Item not found in inventory.")

    item_vnum = int(row["item_vnum"])
    if not is_merchant_medal_vnum(item_vnum):
        raise ValueError("Item is not a NosMerchant Medal.")

    consume_inventory_quantity(conn, character_id, instance_id, 1)
    activated_item_name = activate_merchant_medal(conn, character_id, item_vnum)
    medal_state = get_active_merchant_medal(conn, character_id)
    if medal_state is None:
        raise ValueError("Failed to activate NosMerchant Medal.")

    return {
        **medal_state,
        "activatedItemName": activated_item_name,
    }


def migrate_merchant_medals_table(conn: sqlite3.Connection) -> None:
    table = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'character_merchant_medals'"
    ).fetchone()
    if table is None:
        conn.execute(
            """
            CREATE TABLE character_merchant_medals (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              character_id INTEGER NOT NULL,
              item_vnum INTEGER NOT NULL,
              started_at TEXT NOT NULL,
              expires_at TEXT NOT NULL,
              FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
              FOREIGN KEY (item_vnum) REFERENCES items(ItemVNum)
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_character_merchant_medals_character
            ON character_merchant_medals(character_id)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_character_merchant_medals_expires
            ON character_merchant_medals(character_id, expires_at)
            """
        )
        return

    columns = {
        row[1] for row in conn.execute("PRAGMA table_info(character_merchant_medals)").fetchall()
    }
    if "started_at" in columns and "id" in columns:
        return

    old_rows = conn.execute(
        "SELECT character_id, item_vnum, expires_at FROM character_merchant_medals"
    ).fetchall()

    conn.execute("DROP TABLE character_merchant_medals")
    conn.execute(
        """
        CREATE TABLE character_merchant_medals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          character_id INTEGER NOT NULL,
          item_vnum INTEGER NOT NULL,
          started_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
          FOREIGN KEY (item_vnum) REFERENCES items(ItemVNum)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_character_merchant_medals_character
        ON character_merchant_medals(character_id)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_character_merchant_medals_expires
        ON character_merchant_medals(character_id, expires_at)
        """
    )

    for row in old_rows:
        expires_at = _parse_datetime(str(row["expires_at"]))
        duration_days = medal_duration_days(int(row["item_vnum"])) or 7
        started_at = expires_at - timedelta(days=duration_days)
        conn.execute(
            """
            INSERT INTO character_merchant_medals (character_id, item_vnum, started_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                int(row["character_id"]),
                int(row["item_vnum"]),
                _iso_datetime(started_at),
                _iso_datetime(expires_at),
            ),
        )


def _is_instance_listed(conn: sqlite3.Connection, instance_id: int) -> bool:
    row = conn.execute(
        "SELECT 1 FROM bazaar WHERE item_instance_id = ? LIMIT 1",
        (instance_id,),
    ).fetchone()
    return row is not None


def _get_listable_inventory_item(
    conn: sqlite3.Connection,
    character_id: int,
    instance_id: int,
) -> sqlite3.Row:
    row = conn.execute(
        """
        SELECT
          ci.item_instance_id,
          ii.Quantity AS quantity,
          ii.ItemVNum AS item_vnum,
          i.name,
          i.IconId
        FROM character_inventory ci
        JOIN item_instances ii ON ci.item_instance_id = ii.id
        JOIN items i ON ii.ItemVNum = i.ItemVNum
        WHERE ci.character_id = ? AND ci.item_instance_id = ?
        """,
        (character_id, instance_id),
    ).fetchone()
    if row is None:
        raise ValueError("Item not found in inventory.")
    if _is_instance_listed(conn, instance_id):
        raise ValueError("Item is already listed on the NosBazaar.")
    return row


def create_bazaar_listing(
    conn: sqlite3.Connection,
    character_id: int,
    instance_id: int,
    quantity: int,
    unit_price: int,
    listing_period: int,
    bundle_sale: bool = False,
) -> dict[str, Any]:
    quantity = int(quantity)
    unit_price = int(unit_price)
    listing_period = int(listing_period)
    instance_id = int(instance_id)

    if quantity < 1:
        raise ValueError("Invalid quantity.")
    if unit_price < 1:
        raise ValueError("Invalid price.")
    if listing_period not in ALLOWED_LISTING_PERIODS:
        raise ValueError("Invalid listing period.")

    has_medal = get_active_merchant_medal(conn, character_id) is not None
    if not has_medal and listing_period != 1:
        raise ValueError("Listing period requires a NosMerchant Medal.")

    max_price = max_unit_price(has_medal)
    if unit_price > max_price:
        raise ValueError(f"Price cannot exceed {max_price:,} gold per unit.")

    source = _get_listable_inventory_item(conn, character_id, instance_id)
    available = int(source["quantity"])
    if quantity > available:
        raise ValueError("Not enough items in stack.")

    total_price = unit_price * quantity
    fee = calculate_listing_fee(total_price, has_medal)

    character = conn.execute(
        "SELECT id, gold FROM characters WHERE id = ? AND COALESCE(IsDeleted, 0) = 0",
        (character_id,),
    ).fetchone()
    if character is None:
        raise ValueError("Character not found.")

    gold = int(character["gold"])
    if gold < fee:
        raise ValueError("You don't have enough Gold to pay the listing fee.")

    list_instance_id = instance_id
    if quantity < available:
        conn.execute(
            "UPDATE item_instances SET Quantity = ? WHERE id = ?",
            (available - quantity, instance_id),
        )
        conn.execute(
            "INSERT INTO item_instances (ItemVNum, Quantity) VALUES (?, ?)",
            (int(source["item_vnum"]), quantity),
        )
        list_instance_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    else:
        conn.execute(
            "DELETE FROM character_inventory WHERE character_id = ? AND item_instance_id = ?",
            (character_id, instance_id),
        )

    list_date = datetime.now(timezone.utc).date().isoformat()
    conn.execute(
        """
        INSERT INTO bazaar (
          character_id,
          item_instance_id,
          price,
          list_date,
          listing_period,
          bundle_sale,
          listed_quantity
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            character_id,
            list_instance_id,
            unit_price,
            list_date,
            listing_period,
            1 if bundle_sale else 0,
            quantity,
        ),
    )
    listing_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    new_gold = gold - fee
    conn.execute(
        "UPDATE characters SET gold = ? WHERE id = ?",
        (new_gold, character_id),
    )

    return {
        "listingId": listing_id,
        "gold": new_gold,
        "fee": fee,
        "itemName": source["name"],
    }


def quit_bazaar_listing(
    conn: sqlite3.Connection,
    character_id: int,
    listing_id: int,
) -> dict[str, Any]:
    from inventory import find_free_slot, resolve_default_pocket

    row = conn.execute(
        """
        SELECT
          b.id,
          b.character_id,
          b.price,
          b.item_instance_id,
          COALESCE(b.listed_quantity, ii.Quantity) AS listed_quantity,
          ii.Quantity AS quantity,
          ii.ItemVNum AS item_vnum,
          i.name AS item_name
        FROM bazaar b
        JOIN item_instances ii ON b.item_instance_id = ii.id
        JOIN items i ON ii.ItemVNum = i.ItemVNum
        WHERE b.id = ?
        """,
        (listing_id,),
    ).fetchone()
    if row is None:
        raise ValueError("Listing not found.")
    if int(row["character_id"]) != int(character_id):
        raise ValueError("Listing not found.")

    listed_qty = int(row["listed_quantity"])
    current_qty = int(row["quantity"])
    if current_qty <= 0:
        raise ValueError("Listing has no items to withdraw.")

    sold_qty = listed_qty - current_qty
    instance_id = int(row["item_instance_id"])
    unit_price = int(row["price"])
    has_medal = get_active_merchant_medal(conn, character_id) is not None

    sold_gross = unit_price * sold_qty if sold_qty > 0 else 0
    remaining_gross = unit_price * current_qty
    sold_fee = calculate_sale_fee(sold_gross, has_medal) if sold_qty > 0 else 0
    quit_fee = calculate_sale_fee(remaining_gross, has_medal) if current_qty > 0 else 0
    received_gold = sold_gross - sold_fee

    character = conn.execute(
        "SELECT gold FROM characters WHERE id = ? AND COALESCE(IsDeleted, 0) = 0",
        (character_id,),
    ).fetchone()
    if character is None:
        raise ValueError("Character not found.")

    gold = int(character["gold"])
    if gold + received_gold < quit_fee:
        raise ValueError("Not enough gold to pay the sale fee.")

    item = conn.execute("SELECT * FROM items WHERE ItemVNum = ?", (int(row["item_vnum"]),)).fetchone()
    if item is None:
        raise ValueError("Item not found.")

    pocket = resolve_default_pocket(item)
    slot = find_free_slot(conn, character_id, pocket)
    if slot is None:
        raise ValueError("Not enough inventory space.")

    conn.execute("DELETE FROM bazaar WHERE id = ?", (listing_id,))
    conn.execute(
        """
        INSERT INTO character_inventory (character_id, pocket, slot, item_instance_id)
        VALUES (?, ?, ?, ?)
        """,
        (character_id, pocket, slot, instance_id),
    )

    new_gold = gold + received_gold - quit_fee
    if received_gold or quit_fee:
        conn.execute(
            "UPDATE characters SET gold = ? WHERE id = ?",
            (new_gold, character_id),
        )

    return {
        "gold": new_gold,
        "saleFee": quit_fee,
        "soldFee": sold_fee,
        "receivedGold": received_gold,
        "soldQuantity": sold_qty,
        "quantity": current_qty,
        "name": row["item_name"],
    }


def receive_bazaar_listing(
    conn: sqlite3.Connection,
    character_id: int,
    listing_id: int,
) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT
          b.id,
          b.character_id,
          b.price,
          b.item_instance_id,
          COALESCE(b.listed_quantity, ii.Quantity) AS listed_quantity,
          ii.Quantity AS quantity,
          i.name AS item_name
        FROM bazaar b
        JOIN item_instances ii ON b.item_instance_id = ii.id
        JOIN items i ON ii.ItemVNum = i.ItemVNum
        WHERE b.id = ?
        """,
        (listing_id,),
    ).fetchone()
    if row is None:
        raise ValueError("Listing not found.")
    if int(row["character_id"]) != int(character_id):
        raise ValueError("Listing not found.")

    listed_qty = int(row["listed_quantity"])
    current_qty = int(row["quantity"])
    sold_qty = listed_qty - current_qty
    if sold_qty <= 0:
        raise ValueError("Nothing to receive.")

    unit_price = int(row["price"])
    gross = unit_price * sold_qty
    has_medal = get_active_merchant_medal(conn, character_id) is not None
    sale_fee = calculate_sale_fee(gross, has_medal)
    net_gold = gross - sale_fee

    character = conn.execute(
        "SELECT gold FROM characters WHERE id = ? AND COALESCE(IsDeleted, 0) = 0",
        (character_id,),
    ).fetchone()
    if character is None:
        raise ValueError("Character not found.")

    new_gold = int(character["gold"]) + net_gold
    conn.execute(
        "UPDATE characters SET gold = ? WHERE id = ?",
        (new_gold, character_id),
    )

    instance_id = int(row["item_instance_id"])
    if current_qty <= 0:
        conn.execute("DELETE FROM bazaar WHERE id = ?", (listing_id,))
        conn.execute("DELETE FROM item_instances WHERE id = ?", (instance_id,))
    else:
        conn.execute(
            "UPDATE bazaar SET listed_quantity = ? WHERE id = ?",
            (current_qty, listing_id),
        )

    return {
        "gold": new_gold,
        "saleFee": sale_fee,
        "receivedQuantity": sold_qty,
        "totalAmount": net_gold,
        "name": row["item_name"],
    }


def change_bazaar_listing_price(
    conn: sqlite3.Connection,
    character_id: int,
    listing_id: int,
    unit_price: int,
) -> dict[str, Any]:
    unit_price = int(unit_price)
    if unit_price < 1:
        raise ValueError("Invalid price.")

    row = conn.execute(
        """
        SELECT
          b.id,
          b.character_id,
          b.price AS current_price,
          COALESCE(b.listed_quantity, ii.Quantity) AS listed_quantity,
          ii.Quantity AS quantity,
          i.name AS item_name
        FROM bazaar b
        JOIN item_instances ii ON b.item_instance_id = ii.id
        JOIN items i ON ii.ItemVNum = i.ItemVNum
        WHERE b.id = ?
        """,
        (listing_id,),
    ).fetchone()
    if row is None:
        raise ValueError("Listing not found.")
    if int(row["character_id"]) != int(character_id):
        raise ValueError("Listing not found.")

    listed_qty = int(row["listed_quantity"])
    current_qty = int(row["quantity"])
    if current_qty <= 0:
        raise ValueError("Listing is no longer active.")
    if listed_qty != current_qty:
        raise ValueError("Collect sold items before changing the price.")

    current_price = int(row["current_price"])
    if unit_price == current_price:
        raise ValueError("Price is unchanged.")

    has_medal = get_active_merchant_medal(conn, character_id) is not None
    max_price = max_unit_price(has_medal)
    if unit_price > max_price:
        raise ValueError(f"Price cannot exceed {max_price:,} gold per unit.")

    character = conn.execute(
        "SELECT gold FROM characters WHERE id = ? AND COALESCE(IsDeleted, 0) = 0",
        (character_id,),
    ).fetchone()
    if character is None:
        raise ValueError("Character not found.")

    gold = int(character["gold"])
    change_fee = CHANGE_PRICE_FEE
    if gold < change_fee:
        raise ValueError("Not enough gold to pay the change price fee.")

    conn.execute(
        "UPDATE bazaar SET price = ? WHERE id = ?",
        (unit_price, listing_id),
    )
    new_gold = gold - change_fee
    if change_fee:
        conn.execute(
            "UPDATE characters SET gold = ? WHERE id = ?",
            (new_gold, character_id),
        )

    return {
        "listingId": listing_id,
        "price": unit_price,
        "gold": new_gold,
        "changePriceFee": change_fee,
        "name": row["item_name"],
    }


def migrate_bazaar_listing_columns(conn: sqlite3.Connection) -> None:
    columns = {
        row[1] for row in conn.execute("PRAGMA table_info(bazaar)").fetchall()
    }
    if "listing_period" not in columns:
        conn.execute(
            f"""
            ALTER TABLE bazaar
            ADD COLUMN listing_period INTEGER NOT NULL DEFAULT {DEFAULT_LISTING_PERIOD}
            """
        )
    if "bundle_sale" not in columns:
        conn.execute(
            "ALTER TABLE bazaar ADD COLUMN bundle_sale INTEGER NOT NULL DEFAULT 0"
        )
    if "listed_quantity" not in columns:
        conn.execute("ALTER TABLE bazaar ADD COLUMN listed_quantity INTEGER")
        conn.execute(
            """
            UPDATE bazaar
            SET listed_quantity = (
              SELECT Quantity FROM item_instances WHERE id = bazaar.item_instance_id
            )
            WHERE listed_quantity IS NULL
            """
        )
