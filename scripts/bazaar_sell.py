"""NosBazaar listing rules: merchant medals and listing fees."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import ceil
from typing import Any

import sqlite3

ALLOWED_LISTING_PERIODS = {1, 7, 15, 30}
ALLOWED_AUCTION_PERIODS_MINUTES = {60, 180, 360, 720, 1440, 4320, 10080}
DEFAULT_LISTING_PERIOD = 30
LISTING_TYPE_FIXED = "fixed"
LISTING_TYPE_AUCTION = "auction"
ALLOWED_BID_INCREMENTS = {1, 2, 5, 10, 20, 50, 100_000_000}
ANONYMOUS_MASK = "Anonymous"
AUCTION_STATE_ACTIVE = "active"
AUCTION_STATE_ENDED = "ended"
AUCTION_STATE_SOLD = "sold"


def listing_expiry_sql() -> str:
    return "COALESCE(datetime(b.expires_at), datetime(b.list_date, '+' || b.listing_period || ' days'))"


def seconds_until_expiry(expires_at: str | None) -> int:
    if not expires_at:
        return 0
    expires = _parse_datetime(str(expires_at))
    return max(0, int((expires - _utc_now()).total_seconds()))


def format_auction_time_remaining(total_seconds: int) -> str:
    total_seconds = max(0, int(total_seconds))
    days, remainder = divmod(total_seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, seconds = divmod(remainder, 60)
    if days > 0:
        return f"{days}d {hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


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
    *,
    anonymous_seller: bool = False,
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
          listed_quantity,
          listing_type,
          starting_price,
          anonymous_seller
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            character_id,
            list_instance_id,
            unit_price,
            list_date,
            listing_period,
            1 if bundle_sale else 0,
            quantity,
            LISTING_TYPE_FIXED,
            unit_price,
            1 if anonymous_seller else 0,
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
          b.listing_type,
          b.current_bid,
          b.current_bidder_id,
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

    if is_auction_listing_row(row):
        bid_count = _auction_bid_count(conn, listing_id)
        if bid_count > 0 or int(row["current_bid"] or 0) > 0:
            raise ValueError("Cannot withdraw an auction listing that has bids.")
        conn.execute("DELETE FROM bazaar_bid_escrow WHERE bazaar_id = ?", (listing_id,))
        conn.execute("DELETE FROM bazaar WHERE id = ?", (listing_id,))
        item = conn.execute("SELECT * FROM items WHERE ItemVNum = ?", (int(row["item_vnum"]),)).fetchone()
        if item is None:
            raise ValueError("Item not found.")
        pocket = resolve_default_pocket(item)
        slot = find_free_slot(conn, character_id, pocket)
        if slot is None:
            raise ValueError("Not enough inventory space.")
        conn.execute(
            """
            INSERT INTO character_inventory (character_id, pocket, slot, item_instance_id)
            VALUES (?, ?, ?, ?)
            """,
            (character_id, pocket, slot, int(row["item_instance_id"])),
        )
        character = conn.execute(
            "SELECT gold FROM characters WHERE id = ? AND COALESCE(IsDeleted, 0) = 0",
            (character_id,),
        ).fetchone()
        if character is None:
            raise ValueError("Character not found.")
        return {
            "gold": int(character["gold"]),
            "saleFee": 0,
            "soldFee": 0,
            "receivedGold": 0,
            "soldQuantity": 0,
            "quantity": 1,
            "name": row["item_name"],
        }

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
          b.listing_type,
          b.current_bid,
          b.current_bidder_id,
          b.auction_state,
          b.seller_collected,
          b.listed_quantity AS stored_listed_quantity,
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

    if is_auction_listing_row(row):
        return receive_auction_listing(conn, character_id, listing_id, row)

    sold_qty = fixed_listing_sold_quantity(row)
    if sold_qty <= 0:
        raise ValueError("Nothing to receive.")

    current_qty = int(row["quantity"])
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
          b.listing_type,
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
    if is_auction_listing_row(row):
        raise ValueError("Auction listings cannot change price.")

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


def migrate_bazaar_auction_columns(conn: sqlite3.Connection) -> None:
    columns = {
        row[1] for row in conn.execute("PRAGMA table_info(bazaar)").fetchall()
    }
    additions = [
        ("listing_type", f"TEXT NOT NULL DEFAULT '{LISTING_TYPE_FIXED}'"),
        ("starting_price", "INTEGER"),
        ("instant_price", "INTEGER"),
        ("bid_increment", "INTEGER"),
        ("current_bid", "INTEGER NOT NULL DEFAULT 0"),
        ("current_bidder_id", "INTEGER"),
        ("anonymous_seller", "INTEGER NOT NULL DEFAULT 0"),
        ("anonymous_buyer", "INTEGER NOT NULL DEFAULT 0"),
        ("listed_at", "TEXT"),
        ("expires_at", "TEXT"),
    ]
    for name, ddl in additions:
        if name not in columns:
            conn.execute(f"ALTER TABLE bazaar ADD COLUMN {name} {ddl}")

    conn.execute(
        """
        UPDATE bazaar
        SET starting_price = price
        WHERE starting_price IS NULL
        """
    )

    conn.execute(
        """
        UPDATE bazaar
        SET listed_at = COALESCE(listed_at, list_date || 'T00:00:00+00:00'),
            expires_at = COALESCE(
              expires_at,
              CASE
                WHEN listing_type = ?
                  THEN datetime(list_date || ' 00:00:00', '+' || listing_period || ' days')
                ELSE datetime(list_date, '+' || listing_period || ' days')
              END
            )
        WHERE expires_at IS NULL
        """,
        (LISTING_TYPE_AUCTION,),
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS bazaar_bids (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bazaar_id INTEGER NOT NULL,
          bidder_id INTEGER NOT NULL,
          amount INTEGER NOT NULL,
          is_anonymous INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          FOREIGN KEY (bazaar_id) REFERENCES bazaar(id) ON DELETE CASCADE,
          FOREIGN KEY (bidder_id) REFERENCES characters(id)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_bazaar_bids_bazaar
        ON bazaar_bids(bazaar_id, id DESC)
        """
    )

    escrow_additions = [
        ("auction_state", f"TEXT NOT NULL DEFAULT '{AUCTION_STATE_ACTIVE}'"),
        ("seller_collected", "INTEGER NOT NULL DEFAULT 0"),
        ("buyer_claimed", "INTEGER NOT NULL DEFAULT 0"),
    ]
    for name, ddl in escrow_additions:
        if name not in columns:
            conn.execute(f"ALTER TABLE bazaar ADD COLUMN {name} {ddl}")
        columns.add(name)

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS bazaar_bid_escrow (
          bazaar_id INTEGER NOT NULL,
          character_id INTEGER NOT NULL,
          amount_held INTEGER NOT NULL DEFAULT 0,
          refunded INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (bazaar_id, character_id),
          FOREIGN KEY (bazaar_id) REFERENCES bazaar(id) ON DELETE CASCADE,
          FOREIGN KEY (character_id) REFERENCES characters(id)
        )
        """
    )

    conn.execute(
        """
        INSERT OR IGNORE INTO bazaar_bid_escrow (bazaar_id, character_id, amount_held, refunded)
        SELECT b.id, b.current_bidder_id, b.current_bid, 0
        FROM bazaar b
        WHERE b.listing_type = ?
          AND b.current_bidder_id IS NOT NULL
          AND COALESCE(b.current_bid, 0) > 0
        """,
        (LISTING_TYPE_AUCTION,),
    )


def is_auction_listing_row(row: sqlite3.Row | dict[str, Any]) -> bool:
    listing_type = row["listing_type"] if "listing_type" in row.keys() else LISTING_TYPE_FIXED
    return str(listing_type or LISTING_TYPE_FIXED) == LISTING_TYPE_AUCTION


def auction_starting_price(row: sqlite3.Row | dict[str, Any]) -> int:
    if "starting_price" in row.keys() and row["starting_price"] is not None:
        return int(row["starting_price"])
    return int(row["listing_price"] if "listing_price" in row.keys() else row["price"])


def auction_current_offer(row: sqlite3.Row | dict[str, Any]) -> int:
    current_bid = int(row["current_bid"] or 0) if "current_bid" in row.keys() else 0
    starting = auction_starting_price(row)
    return current_bid if current_bid > 0 else starting


def auction_has_winner(row: sqlite3.Row | dict[str, Any]) -> bool:
    current_bid = int(row["current_bid"] or 0) if "current_bid" in row.keys() else 0
    winner_id = row["current_bidder_id"] if "current_bidder_id" in row.keys() else None
    return current_bid > 0 and winner_id is not None


def fixed_listing_sold_quantity(row: sqlite3.Row | dict[str, Any]) -> int:
    stored = None
    if "stored_listed_quantity" in row.keys():
        stored = row["stored_listed_quantity"]
    elif "listed_quantity" in row.keys() and row["listed_quantity"] is not None:
        stored = row["listed_quantity"]
    current_qty = int(row["quantity"])
    if stored is not None:
        return max(0, int(stored) - current_qty)
    return 0


def minimum_auction_bid_amount(row: sqlite3.Row) -> int:
    increment = int(row["bid_increment"] or 0)
    return auction_current_offer(row) + increment


def _display_seller_name(row: sqlite3.Row, seller_name: str) -> str:
    if "anonymous_seller" in row.keys() and int(row["anonymous_seller"] or 0):
        return ANONYMOUS_MASK
    return seller_name


def _display_bidder_name(
    row: sqlite3.Row,
    bidder_name: str | None,
    *,
    bid_is_anonymous: bool = False,
) -> str:
    if not bidder_name:
        return "—"
    allows_anonymous = int(row["anonymous_buyer"] or 0) if "anonymous_buyer" in row.keys() else 0
    if bid_is_anonymous and allows_anonymous:
        return ANONYMOUS_MASK
    return bidder_name


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _refund_bidder_gold(conn: sqlite3.Connection, bidder_id: int | None, amount: int) -> None:
    if not bidder_id or amount <= 0:
        return
    conn.execute(
        "UPDATE characters SET gold = gold + ? WHERE id = ?",
        (int(amount), int(bidder_id)),
    )


def _deduct_character_gold(conn: sqlite3.Connection, character_id: int, amount: int) -> int:
    row = conn.execute(
        "SELECT gold FROM characters WHERE id = ? AND COALESCE(IsDeleted, 0) = 0",
        (character_id,),
    ).fetchone()
    if row is None:
        raise ValueError("Character not found.")
    gold = int(row["gold"])
    if gold < amount:
        raise ValueError("Not enough gold.")
    new_gold = gold - int(amount)
    conn.execute(
        "UPDATE characters SET gold = ? WHERE id = ?",
        (new_gold, character_id),
    )
    return new_gold


def _auction_bid_count(conn: sqlite3.Connection, listing_id: int) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS count FROM bazaar_bids WHERE bazaar_id = ?",
        (int(listing_id),),
    ).fetchone()
    return int(row["count"] if row else 0)


def _auction_state(row: sqlite3.Row | dict[str, Any]) -> str:
    if "auction_state" in row.keys() and row["auction_state"]:
        return str(row["auction_state"])
    return AUCTION_STATE_ACTIVE


def _get_escrow_held(conn: sqlite3.Connection, listing_id: int, character_id: int) -> int:
    row = conn.execute(
        """
        SELECT amount_held
        FROM bazaar_bid_escrow
        WHERE bazaar_id = ? AND character_id = ? AND refunded = 0
        """,
        (int(listing_id), int(character_id)),
    ).fetchone()
    return int(row["amount_held"]) if row else 0


def _upsert_escrow_held(
    conn: sqlite3.Connection,
    listing_id: int,
    character_id: int,
    amount: int,
) -> None:
    conn.execute(
        """
        INSERT INTO bazaar_bid_escrow (bazaar_id, character_id, amount_held, refunded)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(bazaar_id, character_id) DO UPDATE SET
          amount_held = excluded.amount_held,
          refunded = 0
        """,
        (int(listing_id), int(character_id), int(amount)),
    )


def _listing_is_expired(conn: sqlite3.Connection, listing_id: int) -> bool:
    expiry = listing_expiry_sql()
    row = conn.execute(
        f"""
        SELECT CASE WHEN julianday({expiry}) < julianday('now') THEN 1 ELSE 0 END AS is_expired
        FROM bazaar b
        WHERE b.id = ?
        """,
        (int(listing_id),),
    ).fetchone()
    return bool(row and int(row["is_expired"]))


def finalize_due_auctions(conn: sqlite3.Connection) -> None:
    expiry = listing_expiry_sql()
    rows = conn.execute(
        f"""
        SELECT b.id
        FROM bazaar b
        WHERE b.listing_type = ?
          AND COALESCE(b.auction_state, ?) = ?
          AND julianday({expiry}) < julianday('now')
        """,
        (LISTING_TYPE_AUCTION, AUCTION_STATE_ACTIVE, AUCTION_STATE_ACTIVE),
    ).fetchall()
    for row in rows:
        listing_id = int(row["id"])
        listing = conn.execute(
            """
            SELECT current_bid, current_bidder_id
            FROM bazaar
            WHERE id = ?
            """,
            (listing_id,),
        ).fetchone()
        if listing is None:
            continue
        conn.execute(
            "UPDATE bazaar SET auction_state = ? WHERE id = ?",
            (AUCTION_STATE_ENDED, listing_id),
        )


def _try_cleanup_settled_auction(conn: sqlite3.Connection, listing_id: int) -> None:
    row = conn.execute(
        """
        SELECT
          b.id,
          b.listing_type,
          b.seller_collected,
          b.buyer_claimed,
          b.item_instance_id,
          ii.Quantity AS quantity
        FROM bazaar b
        JOIN item_instances ii ON b.item_instance_id = ii.id
        WHERE b.id = ?
        """,
        (int(listing_id),),
    ).fetchone()
    if row is None or not is_auction_listing_row(row):
        return
    if not int(row["seller_collected"] or 0) or not int(row["buyer_claimed"] or 0):
        return
    pending = conn.execute(
        """
        SELECT COUNT(*) AS count
        FROM bazaar_bid_escrow
        WHERE bazaar_id = ? AND refunded = 0 AND amount_held > 0
        """,
        (int(listing_id),),
    ).fetchone()
    if pending and int(pending["count"] or 0) > 0:
        return
    instance_id = int(row["item_instance_id"])
    conn.execute("DELETE FROM bazaar WHERE id = ?", (int(listing_id),))
    if int(row["quantity"] or 0) <= 0:
        conn.execute("DELETE FROM item_instances WHERE id = ?", (instance_id,))


def receive_auction_listing(
    conn: sqlite3.Connection,
    character_id: int,
    listing_id: int,
    row: sqlite3.Row | None = None,
) -> dict[str, Any]:
    if row is None:
        row = conn.execute(
            """
            SELECT
              b.id,
              b.character_id,
              b.current_bid,
              b.current_bidder_id,
              b.auction_state,
              b.seller_collected,
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
    finalize_due_auctions(conn)
    state = _auction_state(row)
    if state not in {AUCTION_STATE_ENDED, AUCTION_STATE_SOLD}:
        raise ValueError("This auction is not ready to collect.")
    if int(row["seller_collected"] or 0):
        raise ValueError("Gold already collected.")
    sale_amount = int(row["current_bid"] or 0)
    winner_id = row["current_bidder_id"]
    if sale_amount < 1 or winner_id is None:
        raise ValueError("Nothing to receive.")

    winner_escrow = _get_escrow_held(conn, listing_id, int(winner_id))
    if winner_escrow < sale_amount:
        raise ValueError("Winning bid escrow is unavailable.")

    has_medal = get_active_merchant_medal(conn, character_id) is not None
    sale_fee = calculate_sale_fee(sale_amount, has_medal)
    net_gold = sale_amount - sale_fee

    character = conn.execute(
        "SELECT gold FROM characters WHERE id = ? AND COALESCE(IsDeleted, 0) = 0",
        (character_id,),
    ).fetchone()
    if character is None:
        raise ValueError("Character not found.")

    conn.execute(
        "DELETE FROM bazaar_bid_escrow WHERE bazaar_id = ? AND character_id = ?",
        (int(listing_id), int(winner_id)),
    )
    new_gold = int(character["gold"]) + net_gold
    conn.execute(
        "UPDATE characters SET gold = ? WHERE id = ?",
        (new_gold, character_id),
    )
    conn.execute(
        "UPDATE bazaar SET seller_collected = 1 WHERE id = ?",
        (int(listing_id),),
    )
    _try_cleanup_settled_auction(conn, int(listing_id))
    return {
        "gold": new_gold,
        "saleFee": sale_fee,
        "receivedQuantity": 1,
        "totalAmount": net_gold,
        "name": row["item_name"],
    }


def claim_auction_item(
    conn: sqlite3.Connection,
    character_id: int,
    listing_id: int,
) -> dict[str, Any]:
    from inventory import find_free_slot, resolve_default_pocket

    finalize_due_auctions(conn)
    row = conn.execute(
        """
        SELECT
          b.id,
          b.current_bidder_id,
          b.auction_state,
          b.buyer_claimed,
          b.item_instance_id,
          ii.Quantity AS quantity,
          ii.ItemVNum AS item_vnum,
          i.name AS item_name
        FROM bazaar b
        JOIN item_instances ii ON b.item_instance_id = ii.id
        JOIN items i ON ii.ItemVNum = i.ItemVNum
        WHERE b.id = ? AND b.listing_type = ?
        """,
        (int(listing_id), LISTING_TYPE_AUCTION),
    ).fetchone()
    if row is None:
        raise ValueError("Auction listing not found.")
    if int(row["current_bidder_id"] or 0) != int(character_id):
        raise ValueError("You did not win this auction.")
    if int(row["buyer_claimed"] or 0):
        raise ValueError("Item already claimed.")
    state = _auction_state(row)
    if state not in {AUCTION_STATE_ENDED, AUCTION_STATE_SOLD}:
        raise ValueError("This auction is not ready to claim.")
    if int(row["quantity"] or 0) <= 0:
        raise ValueError("Item already claimed.")

    item = conn.execute("SELECT * FROM items WHERE ItemVNum = ?", (int(row["item_vnum"]),)).fetchone()
    if item is None:
        raise ValueError("Item not found.")
    pocket = resolve_default_pocket(item)
    slot = find_free_slot(conn, character_id, pocket)
    if slot is None:
        raise ValueError("Not enough inventory space.")

    instance_id = int(row["item_instance_id"])
    conn.execute("UPDATE item_instances SET Quantity = 0 WHERE id = ?", (instance_id,))
    conn.execute(
        """
        INSERT INTO character_inventory (character_id, pocket, slot, item_instance_id)
        VALUES (?, ?, ?, ?)
        """,
        (character_id, pocket, slot, instance_id),
    )
    conn.execute(
        "UPDATE bazaar SET buyer_claimed = 1 WHERE id = ?",
        (int(listing_id),),
    )
    _try_cleanup_settled_auction(conn, int(listing_id))
    character = conn.execute(
        "SELECT gold FROM characters WHERE id = ? AND COALESCE(IsDeleted, 0) = 0",
        (character_id,),
    ).fetchone()
    return {
        "gold": int(character["gold"]) if character else 0,
        "name": row["item_name"],
        "listingId": int(listing_id),
    }


def claim_auction_refund(
    conn: sqlite3.Connection,
    character_id: int,
    listing_id: int,
) -> dict[str, Any]:
    finalize_due_auctions(conn)
    row = conn.execute(
        """
        SELECT b.id, b.current_bidder_id, b.auction_state
        FROM bazaar b
        WHERE b.id = ? AND b.listing_type = ?
        """,
        (int(listing_id), LISTING_TYPE_AUCTION),
    ).fetchone()
    if row is None:
        raise ValueError("Auction listing not found.")
    state = _auction_state(row)
    if state not in {AUCTION_STATE_ENDED, AUCTION_STATE_SOLD} and not _listing_is_expired(conn, listing_id):
        raise ValueError("This auction is still active.")
    if int(row["current_bidder_id"] or 0) == int(character_id):
        raise ValueError("Winning bidders must claim the item, not a refund.")

    escrow_row = conn.execute(
        """
        SELECT amount_held
        FROM bazaar_bid_escrow
        WHERE bazaar_id = ? AND character_id = ? AND refunded = 0
        """,
        (int(listing_id), int(character_id)),
    ).fetchone()
    if escrow_row is None or int(escrow_row["amount_held"] or 0) <= 0:
        raise ValueError("No escrowed gold to claim.")

    refund_amount = int(escrow_row["amount_held"])
    character = conn.execute(
        "SELECT gold FROM characters WHERE id = ? AND COALESCE(IsDeleted, 0) = 0",
        (character_id,),
    ).fetchone()
    if character is None:
        raise ValueError("Character not found.")
    new_gold = int(character["gold"]) + refund_amount
    conn.execute(
        "UPDATE characters SET gold = ? WHERE id = ?",
        (new_gold, character_id),
    )
    conn.execute(
        """
        UPDATE bazaar_bid_escrow
        SET amount_held = 0, refunded = 1
        WHERE bazaar_id = ? AND character_id = ?
        """,
        (int(listing_id), int(character_id)),
    )
    _try_cleanup_settled_auction(conn, int(listing_id))
    return {
        "gold": new_gold,
        "refundAmount": refund_amount,
        "listingId": int(listing_id),
    }


def create_auction_listing(
    conn: sqlite3.Connection,
    character_id: int,
    instance_id: int,
    starting_price: int,
    listing_period: int,
    bid_increment: int,
    *,
    instant_price: int | None = None,
    anonymous_seller: bool = False,
    anonymous_buyer: bool = False,
) -> dict[str, Any]:
    starting_price = int(starting_price)
    listing_period = int(listing_period)
    bid_increment = int(bid_increment)
    instance_id = int(instance_id)

    if starting_price < 1:
        raise ValueError("Invalid starting price.")
    if listing_period not in ALLOWED_AUCTION_PERIODS_MINUTES:
        raise ValueError("Invalid listing period.")
    if bid_increment < 1:
        raise ValueError("Invalid bid increment.")

    has_medal = get_active_merchant_medal(conn, character_id) is not None

    max_price = max_unit_price(has_medal)
    if starting_price > max_price:
        raise ValueError(f"Starting price cannot exceed {max_price:,} gold.")
    if instant_price is not None:
        instant_price = int(instant_price)
        if instant_price < starting_price:
            raise ValueError("Instant price must be at least the starting price.")
        if instant_price > max_price:
            raise ValueError(f"Instant price cannot exceed {max_price:,} gold.")

    source = _get_listable_inventory_item(conn, character_id, instance_id)
    available = int(source["quantity"])
    if available < 1:
        raise ValueError("Not enough items in stack.")
    if available > 1:
        raise ValueError("Auction listings must be for a single item.")

    fee = calculate_listing_fee(starting_price, has_medal)
    character = conn.execute(
        "SELECT id, gold FROM characters WHERE id = ? AND COALESCE(IsDeleted, 0) = 0",
        (character_id,),
    ).fetchone()
    if character is None:
        raise ValueError("Character not found.")
    gold = int(character["gold"])
    if gold < fee:
        raise ValueError("You don't have enough Gold to pay the listing fee.")

    conn.execute(
        "DELETE FROM character_inventory WHERE character_id = ? AND item_instance_id = ?",
        (character_id, instance_id),
    )

    list_date = datetime.now(timezone.utc).date().isoformat()
    now = _utc_now()
    listed_at = _iso_datetime(now)
    expires_at = _iso_datetime(now + timedelta(minutes=listing_period))
    conn.execute(
        """
        INSERT INTO bazaar (
          character_id,
          item_instance_id,
          price,
          list_date,
          listed_at,
          expires_at,
          listing_period,
          bundle_sale,
          listed_quantity,
          listing_type,
          starting_price,
          instant_price,
          bid_increment,
          current_bid,
          current_bidder_id,
          anonymous_seller,
          anonymous_buyer
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, 0, NULL, ?, ?)
        """,
        (
            character_id,
            instance_id,
            starting_price,
            list_date,
            listed_at,
            expires_at,
            listing_period,
            LISTING_TYPE_AUCTION,
            starting_price,
            instant_price,
            bid_increment,
            1 if anonymous_seller else 0,
            1 if anonymous_buyer else 0,
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


def place_auction_bid(
    conn: sqlite3.Connection,
    character_id: int,
    listing_id: int,
    amount: int,
    *,
    anonymous: bool = False,
) -> dict[str, Any]:
    amount = int(amount)
    listing_id = int(listing_id)
    finalize_due_auctions(conn)
    expiry = listing_expiry_sql()
    row = conn.execute(
        f"""
        SELECT
          b.id,
          b.character_id,
          b.price,
          b.starting_price,
          b.bid_increment,
          b.current_bid,
          b.current_bidder_id,
          b.anonymous_buyer,
          b.listing_type,
          b.auction_state
        FROM bazaar b
        WHERE b.id = ?
          AND b.listing_type = ?
          AND COALESCE(b.auction_state, ?) = ?
          AND julianday({expiry}) >= julianday('now')
        """,
        (listing_id, LISTING_TYPE_AUCTION, AUCTION_STATE_ACTIVE, AUCTION_STATE_ACTIVE),
    ).fetchone()
    if row is None:
        raise ValueError("Auction listing not found or expired.")
    if int(row["character_id"]) == int(character_id):
        raise ValueError("Cannot bid on your own listing.")

    min_bid = minimum_auction_bid_amount(row)
    if amount < min_bid:
        raise ValueError(f"Bid must be at least {min_bid:,} gold.")

    existing_held = _get_escrow_held(conn, listing_id, character_id)
    delta = amount - existing_held
    if delta <= 0:
        raise ValueError("Bid must increase your locked gold.")

    new_gold = _deduct_character_gold(conn, character_id, delta)
    _upsert_escrow_held(conn, listing_id, character_id, amount)

    conn.execute(
        """
        UPDATE bazaar
        SET current_bid = ?, current_bidder_id = ?
        WHERE id = ?
        """,
        (amount, character_id, listing_id),
    )
    conn.execute(
        """
        INSERT INTO bazaar_bids (bazaar_id, bidder_id, amount, is_anonymous, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            listing_id,
            character_id,
            amount,
            1 if anonymous and int(row["anonymous_buyer"] or 0) else 0,
            _utc_now_iso(),
        ),
    )
    return {
        "gold": new_gold,
        "listingId": listing_id,
        "amount": amount,
        "deltaPaid": delta,
        "escrowHeld": amount,
    }


def buy_auction_instantly(
    conn: sqlite3.Connection,
    character_id: int,
    listing_id: int,
) -> dict[str, Any]:
    listing_id = int(listing_id)
    finalize_due_auctions(conn)
    expiry = listing_expiry_sql()
    row = conn.execute(
        f"""
        SELECT
          b.id,
          b.character_id AS seller_id,
          b.instant_price,
          b.current_bid,
          b.current_bidder_id,
          b.item_instance_id,
          ii.Quantity AS quantity,
          ii.ItemVNum AS item_vnum,
          i.name AS item_name,
          b.listing_type,
          b.auction_state
        FROM bazaar b
        JOIN item_instances ii ON b.item_instance_id = ii.id
        JOIN items i ON ii.ItemVNum = i.ItemVNum
        WHERE b.id = ?
          AND b.listing_type = ?
          AND COALESCE(b.auction_state, ?) = ?
          AND julianday({expiry}) >= julianday('now')
        """,
        (listing_id, LISTING_TYPE_AUCTION, AUCTION_STATE_ACTIVE, AUCTION_STATE_ACTIVE),
    ).fetchone()
    if row is None:
        raise ValueError("Auction listing not found or expired.")
    if int(row["seller_id"]) == int(character_id):
        raise ValueError("Cannot buy your own listing.")
    if row["instant_price"] is None or int(row["instant_price"]) < 1:
        raise ValueError("This auction has no instant price.")

    instant_price = int(row["instant_price"])
    buyer_gold = _deduct_character_gold(conn, character_id, instant_price)
    _upsert_escrow_held(conn, listing_id, character_id, instant_price)

    conn.execute(
        """
        UPDATE bazaar
        SET
          auction_state = ?,
          current_bid = ?,
          current_bidder_id = ?
        WHERE id = ?
        """,
        (AUCTION_STATE_SOLD, instant_price, character_id, listing_id),
    )

    return {
        "gold": buyer_gold,
        "listingId": listing_id,
        "name": row["item_name"],
        "quantity": 1,
        "remaining": 1,
    }


def fetch_auction_bids(conn: sqlite3.Connection, listing_id: int) -> list[dict[str, Any]]:
    listing = conn.execute(
        """
        SELECT anonymous_buyer
        FROM bazaar
        WHERE id = ? AND listing_type = ?
        """,
        (int(listing_id), LISTING_TYPE_AUCTION),
    ).fetchone()
    if listing is None:
        raise ValueError("Auction listing not found.")

    rows = conn.execute(
        """
        SELECT
          bb.amount,
          bb.is_anonymous,
          bb.created_at,
          c.name AS bidder_name
        FROM bazaar_bids bb
        JOIN characters c ON bb.bidder_id = c.id
        WHERE bb.bazaar_id = ?
        ORDER BY bb.id DESC
        """,
        (int(listing_id),),
    ).fetchall()

    bids: list[dict[str, Any]] = []
    for row in rows:
        bids.append(
            {
                "amount": int(row["amount"]),
                "bidder": _display_bidder_name(
                    listing,
                    row["bidder_name"],
                    bid_is_anonymous=bool(row["is_anonymous"]),
                ),
                "createdAt": row["created_at"],
            }
        )
    return bids
