"""Character inventory pockets and slot management (OpenNos-aligned)."""

from __future__ import annotations

import sqlite3
from typing import Any

# Pocket ids match OpenNos InventoryType for player tabs.
POCKET_EQUIPMENT = 0
POCKET_MAIN = 1
POCKET_ETC = 2
POCKET_MINILAND = 3
POCKET_SPECIALIST = 6
POCKET_COSTUME = 7

POCKET_SLOT_COUNT = 48
MAX_STACK_SIZE = 99

STACKABLE_POCKETS = {POCKET_MAIN, POCKET_ETC}

# itempicker InventoryType -> default storage pocket
_ITEMPICKER_TO_POCKET = {
    0: POCKET_EQUIPMENT,
    1: POCKET_MAIN,
    2: POCKET_ETC,
    3: POCKET_ETC,
    4: POCKET_EQUIPMENT,
    6: POCKET_SPECIALIST,
    7: POCKET_COSTUME,
    8: POCKET_EQUIPMENT,
    9: POCKET_MAIN,
    10: POCKET_MAIN,
}

POCKET_KEYS: dict[int, str] = {
    POCKET_EQUIPMENT: "equip",
    POCKET_MAIN: "main",
    POCKET_ETC: "etc",
    POCKET_SPECIALIST: "card",
    POCKET_COSTUME: "costume",
}

POCKET_KEY_TO_ID: dict[str, int] = {value: key for key, value in POCKET_KEYS.items()}


def pocket_id_to_key(pocket: int) -> str:
    key = POCKET_KEYS.get(pocket)
    if key is None:
        raise ValueError(f"Unknown pocket id: {pocket}")
    return key


def pocket_key_to_id(pocket_key: str) -> int:
    normalized = pocket_key.strip().lower()
    if normalized == "mount":
        return POCKET_EQUIPMENT
    pocket = POCKET_KEY_TO_ID.get(normalized)
    if pocket is None:
        raise ValueError(f"Unknown pocket: {pocket_key}")
    return pocket


def resolve_default_pocket(item_row: sqlite3.Row | dict[str, Any]) -> int:
    """Pick the first pocket for a new item based on catalog metadata."""
    inventory_type = int(item_row["InventoryType"])
    return _ITEMPICKER_TO_POCKET.get(inventory_type, POCKET_MAIN)


def is_mount_item(item_row: sqlite3.Row | dict[str, Any]) -> bool:
    return int(item_row["ItemType"]) == 5 and int(item_row["ItemSubType"]) == 4


def is_stackable_item(item_row: sqlite3.Row | dict[str, Any], pocket: int) -> bool:
    return pocket in STACKABLE_POCKETS


def _used_slots(conn: sqlite3.Connection, character_id: int, pocket: int) -> set[int]:
    rows = conn.execute(
        """
        SELECT slot
        FROM character_inventory
        WHERE character_id = ? AND pocket = ?
        """,
        (character_id, pocket),
    ).fetchall()
    return {int(row["slot"]) for row in rows}


def find_free_slot(conn: sqlite3.Connection, character_id: int, pocket: int) -> int | None:
    used = _used_slots(conn, character_id, pocket)
    for slot in range(POCKET_SLOT_COUNT):
        if slot not in used:
            return slot
    return None


def find_stack_target(
    conn: sqlite3.Connection,
    character_id: int,
    pocket: int,
    item_vnum: int,
) -> tuple[int, int, int] | None:
    """Return (instance_id, slot, current_quantity) when a stack has room."""
    row = conn.execute(
        """
        SELECT ii.id AS instance_id, ci.slot, ii.Quantity
        FROM character_inventory ci
        JOIN item_instances ii ON ci.item_instance_id = ii.id
        WHERE ci.character_id = ?
          AND ci.pocket = ?
          AND ii.ItemVNum = ?
          AND ii.Quantity < ?
        ORDER BY ci.slot
        LIMIT 1
        """,
        (character_id, pocket, item_vnum, MAX_STACK_SIZE),
    ).fetchone()
    if row is None:
        return None
    return int(row["instance_id"]), int(row["slot"]), int(row["Quantity"])


def add_item_to_character_inventory(
    conn: sqlite3.Connection,
    character_id: int,
    item_vnum: int,
    amount: int,
) -> tuple[int, int, int]:
    """Add items to the character inventory. Returns (pocket, slot, amount_added)."""
    if amount < 1:
        raise ValueError("Amount must be at least 1")

    item = conn.execute("SELECT * FROM items WHERE ItemVNum = ?", (item_vnum,)).fetchone()
    if item is None:
        raise ValueError(f"Unknown item vnum: {item_vnum}")

    pocket = resolve_default_pocket(item)
    remaining = amount
    last_pocket = pocket
    last_slot = 0
    added_total = 0

    if is_stackable_item(item, pocket):
        while remaining > 0:
            stack = find_stack_target(conn, character_id, pocket, item_vnum)
            if stack is None:
                break
            instance_id, slot, current_qty = stack
            add_here = min(remaining, MAX_STACK_SIZE - current_qty)
            conn.execute(
                "UPDATE item_instances SET Quantity = Quantity + ? WHERE id = ?",
                (add_here, instance_id),
            )
            remaining -= add_here
            added_total += add_here
            last_pocket, last_slot = pocket, slot

    while remaining > 0:
        slot = find_free_slot(conn, character_id, pocket)
        if slot is None:
            if added_total == 0:
                raise ValueError("Not enough inventory space.")
            break

        if is_stackable_item(item, pocket):
            stack_amount = min(remaining, MAX_STACK_SIZE)
        else:
            stack_amount = 1

        conn.execute(
            "INSERT INTO item_instances (ItemVNum, Quantity) VALUES (?, ?)",
            (item_vnum, stack_amount),
        )
        instance_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
        conn.execute(
            """
            INSERT INTO character_inventory (character_id, pocket, slot, item_instance_id)
            VALUES (?, ?, ?, ?)
            """,
            (character_id, pocket, slot, instance_id),
        )
        remaining -= stack_amount
        added_total += stack_amount
        last_pocket, last_slot = pocket, slot

        if not is_stackable_item(item, pocket):
            if remaining > 0:
                continue

    if added_total == 0:
        raise ValueError("Not enough inventory space.")

    return last_pocket, last_slot, added_total


def can_item_go_in_pocket(item_row: sqlite3.Row | dict[str, Any], pocket: int) -> bool:
    return resolve_default_pocket(item_row) == pocket


def _get_character_item_row(
    conn: sqlite3.Connection,
    character_id: int,
    instance_id: int,
) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT
          ci.pocket,
          ci.slot,
          ci.item_instance_id,
          ii.Quantity AS quantity,
          i.*
        FROM character_inventory ci
        JOIN item_instances ii ON ci.item_instance_id = ii.id
        JOIN items i ON ii.ItemVNum = i.ItemVNum
        WHERE ci.character_id = ? AND ci.item_instance_id = ?
        """,
        (character_id, instance_id),
    ).fetchone()


def _is_listed_on_bazaar(conn: sqlite3.Connection, instance_id: int) -> bool:
    row = conn.execute(
        "SELECT 1 FROM bazaar WHERE item_instance_id = ? LIMIT 1",
        (instance_id,),
    ).fetchone()
    return row is not None


def _find_temp_slot(conn: sqlite3.Connection, character_id: int) -> tuple[int, int] | None:
    for pocket in (
        POCKET_EQUIPMENT,
        POCKET_MAIN,
        POCKET_ETC,
        POCKET_SPECIALIST,
        POCKET_COSTUME,
    ):
        slot = find_free_slot(conn, character_id, pocket)
        if slot is not None:
            return pocket, slot
    return None


def _set_item_slot(
    conn: sqlite3.Connection,
    character_id: int,
    instance_id: int,
    pocket: int,
    slot: int,
) -> None:
    conn.execute(
        """
        UPDATE character_inventory
        SET pocket = ?, slot = ?
        WHERE character_id = ? AND item_instance_id = ?
        """,
        (pocket, slot, character_id, instance_id),
    )


def _merge_item_stacks(
    conn: sqlite3.Connection,
    character_id: int,
    source_instance_id: int,
    dest_instance_id: int,
) -> None:
    source = _get_character_item_row(conn, character_id, source_instance_id)
    dest = _get_character_item_row(conn, character_id, dest_instance_id)
    if source is None or dest is None:
        raise ValueError("Item not found in inventory.")

    dest_pocket = int(dest["pocket"])
    if not is_stackable_item(source, dest_pocket):
        raise ValueError("Items cannot be stacked in this pocket.")

    if int(source["ItemVNum"]) != int(dest["ItemVNum"]):
        raise ValueError("Items cannot be combined.")

    src_qty = int(source["quantity"])
    dest_qty = int(dest["quantity"])
    merge_room = MAX_STACK_SIZE - dest_qty
    if merge_room <= 0:
        raise ValueError("Stack is full.")

    merge_amount = min(src_qty, merge_room)
    conn.execute(
        "UPDATE item_instances SET Quantity = ? WHERE id = ?",
        (dest_qty + merge_amount, dest_instance_id),
    )

    remaining = src_qty - merge_amount
    if remaining <= 0:
        conn.execute("DELETE FROM item_instances WHERE id = ?", (source_instance_id,))
    else:
        conn.execute(
            "UPDATE item_instances SET Quantity = ? WHERE id = ?",
            (remaining, source_instance_id),
        )


def move_inventory_item(
    conn: sqlite3.Connection,
    character_id: int,
    instance_id: int,
    dest_pocket_key: str,
    dest_slot: int,
) -> None:
    if dest_slot < 0 or dest_slot >= POCKET_SLOT_COUNT:
        raise ValueError("Invalid slot.")

    source = _get_character_item_row(conn, character_id, instance_id)
    if source is None:
        raise ValueError("Item not found in inventory.")

    if _is_listed_on_bazaar(conn, instance_id):
        raise ValueError("Cannot move a listed bazaar item.")

    dest_pocket = pocket_key_to_id(dest_pocket_key)
    if not can_item_go_in_pocket(source, dest_pocket):
        raise ValueError("Item cannot be placed in that pocket.")

    src_pocket = int(source["pocket"])
    src_slot = int(source["slot"])

    if src_pocket == dest_pocket and src_slot == dest_slot:
        return

    dest_row = conn.execute(
        """
        SELECT item_instance_id
        FROM character_inventory
        WHERE character_id = ? AND pocket = ? AND slot = ?
        """,
        (character_id, dest_pocket, dest_slot),
    ).fetchone()

    if dest_row is None:
        _set_item_slot(conn, character_id, instance_id, dest_pocket, dest_slot)
        return

    dest_instance_id = int(dest_row["item_instance_id"])
    if dest_instance_id == instance_id:
        return

    dest_item = _get_character_item_row(conn, character_id, dest_instance_id)
    if dest_item is None:
        _set_item_slot(conn, character_id, instance_id, dest_pocket, dest_slot)
        return

    if (
        int(source["ItemVNum"]) == int(dest_item["ItemVNum"])
        and is_stackable_item(source, dest_pocket)
    ):
        _merge_item_stacks(conn, character_id, instance_id, dest_instance_id)
        return

    if not can_item_go_in_pocket(dest_item, src_pocket):
        raise ValueError("Items cannot be swapped between these pockets.")

    temp = _find_temp_slot(conn, character_id)
    if temp is None:
        raise ValueError("Not enough inventory space to swap items.")

    temp_pocket, temp_slot = temp
    _set_item_slot(conn, character_id, instance_id, temp_pocket, temp_slot)
    _set_item_slot(conn, character_id, dest_instance_id, src_pocket, src_slot)
    _set_item_slot(conn, character_id, instance_id, dest_pocket, dest_slot)


def discard_inventory_item(
    conn: sqlite3.Connection,
    character_id: int,
    instance_id: int,
) -> None:
    source = _get_character_item_row(conn, character_id, instance_id)
    if source is None:
        raise ValueError("Item not found in inventory.")

    if _is_listed_on_bazaar(conn, instance_id):
        raise ValueError("Cannot discard a listed bazaar item.")

    conn.execute("DELETE FROM item_instances WHERE id = ?", (instance_id,))
