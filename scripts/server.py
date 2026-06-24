"""NosBazaar static UI + SQLite API server."""

from __future__ import annotations

import hashlib
import io
import json
import re
import secrets
import socket
import sqlite3
import sys
import threading
import time
import webbrowser
from contextlib import contextmanager
from dataclasses import dataclass
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen

from app_paths import app_root
from auth_config import (
    is_reserved_superadmin_username,
    load_auth_config,
    verify_superadmin,
)
from data_vault import ensure_vault_compiled, get_vault
from inventory import (
    POCKET_COSTUME,
    POCKET_EQUIPMENT,
    POCKET_ETC,
    POCKET_MAIN,
    POCKET_SLOT_COUNT,
    POCKET_SPECIALIST,
    add_item_to_character_inventory,
    discard_inventory_item,
    is_mount_item,
    move_inventory_item,
    pocket_id_to_key,
)
from item_catalog import class_abbreviations, class_display, item_icon_url
from routing.router import (
    ADMIN_ACCOUNTS,
    ADMIN_CHARACTERS,
    ADMIN_HOME,
    ADMIN_LOGIN,
    PLAY_CREATE_CHARACTER,
    PLAY_HOME,
    PLAY_LOGIN,
    PLAY_MAIN,
    PLAY_SELECT_CHANNEL,
    PLAY_SELECT_CHARACTER,
    PageId,
    ResolvedRoute,
    RouteKind,
    normalize_path,
    page_file,
    resolve_get_route,
    static_content_type,
)

ROOT = app_root()


def server_run_hint() -> str:
    if getattr(sys, "frozen", False):
        return "NostaleWeb.exe"
    return "py scripts\\server.py"
vault = get_vault(ROOT / "data")
HOST = "127.0.0.1"
CHANNELS_CONFIG_PATH = ROOT / "config" / "channels.json"
GAME_CONFIG_PATH = ROOT / "config" / "game.json"
AUTH_CONFIG_PATH = ROOT / "config" / "auth.json"
auth_config = load_auth_config(AUTH_CONFIG_PATH)
LISTING_TTL_DAYS = 30
MAX_CHARACTERS_PER_ACCOUNT = 3
SUPERADMIN_ACCOUNT_ID = 0
SUPERADMIN_DB_USERNAME = "__superadmin__"
MIN_USERNAME_LENGTH = 3
MAX_USERNAME_LENGTH = 16
MIN_PASSWORD_LENGTH = 4
MAX_PASSWORD_LENGTH = 64
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]+$")
VALID_CHARACTER_GENDERS = frozenset({"male", "female"})
VALID_HAIR_STYLES = frozenset({"A", "B"})
HAIR_COLOUR_MIN = 1
HAIR_COLOUR_MAX = 10
NOSAPKI_SPRITE_BASE = "https://nosapki.com/images/sprites"
NOSAPKI_SPRITE_API_PREFIX = "/api/nosapki-sprites/"
CREATE_CHARACTER_JOBS = frozenset({"Adventurer", "MartialArtist", "Swordsman", "Archer", "Mage"})
ADVANCED_JOBS = frozenset({"Swordsman", "Archer", "Mage"})
JOB_CHANGE_LEVEL = 15
JOB_CHANGE_JOB_LEVEL = 20
MARTIAL_ARTIST_UNLOCK_LEVEL = 80
MARTIAL_ARTIST_START_LEVEL = 81
ADVANCED_JOB_START_LEVEL = 56
ADVANCED_JOB_START_JOB_LEVEL = 50

ASSET_CONTENT_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}

sessions: dict[str, dict[str, Any]] = {}
login_server: BazaarHTTPServer | None = None
channel_runtimes: dict[int, tuple[BazaarHTTPServer, threading.Thread]] = {}
channels_lock = threading.Lock()
CHANNEL_PORTS: dict[int, int] = {1: 8081, 2: 8082, 3: 8083, 4: 8084, 5: 8085}
LOGIN_PORT = 8080
CHANNEL_MAX_PLAYERS = 100
CHANNEL_FULL_RATIO = 0.9
CHANNEL_HALF_RATIO = 0.5
DEFAULT_CHAMPION_LEVEL_THRESHOLD = 90
CHAMPION_LEVEL_THRESHOLD = DEFAULT_CHAMPION_LEVEL_THRESHOLD


class BazaarHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = False


def assert_port_available(port: int) -> None:
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.bind((HOST, port))
    except OSError as exc:
        if getattr(exc, "winerror", None) == 10048 or exc.errno in (48, 98):
            raise SystemExit(
                f"Port {port} is already in use by another process.\n"
                f"Stop stale servers, then run: {server_run_hint()}\n"
                "PowerShell: Get-Process python | Stop-Process -Force"
            ) from exc
        raise
    finally:
        probe.close()


def verify_routes() -> None:
    required_paths = (
        ADMIN_HOME,
        ADMIN_LOGIN,
        PLAY_HOME,
        PLAY_LOGIN,
        PLAY_MAIN,
    )
    for path in required_paths:
        route = resolve_get_route(path, ROOT)
        if route.kind != RouteKind.PAGE:
            raise SystemExit(f"Server route missing: {path}")


@dataclass(frozen=True)
class SessionState:
    account_id: int | None
    channel: int | None = None
    character_id: int | None = None
    is_superadmin: bool = False
    username: str | None = None


def load_server_config() -> tuple[int, dict[int, int]]:
    default_login = 8080
    default_channels = {1: 8081, 2: 8082, 3: 8083, 4: 8084, 5: 8085}

    if not CHANNELS_CONFIG_PATH.is_file():
        return default_login, default_channels

    try:
        data = json.loads(CHANNELS_CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid {CHANNELS_CONFIG_PATH}: {exc}") from exc

    if not isinstance(data, dict):
        raise SystemExit(f"{CHANNELS_CONFIG_PATH} must be a JSON object")

    login_port = int(data.get("loginPort", default_login))
    channels_raw = data.get("channels", default_channels)

    if isinstance(channels_raw, list):
        raise SystemExit(
            f"{CHANNELS_CONFIG_PATH}: channels must be an object mapping channel index to port, "
            'e.g. {"1": 8081, "2": 8082}'
        )

    if not isinstance(channels_raw, dict) or not channels_raw:
        raise SystemExit(
            f"{CHANNELS_CONFIG_PATH} must include a non-empty channels object "
            '(channel index -> port, e.g. {"1": 8081})'
        )

    channel_ports: dict[int, int] = {}
    for key, port in channels_raw.items():
        try:
            channel = int(key)
        except (TypeError, ValueError) as exc:
            raise SystemExit(f"Invalid channel index in {CHANNELS_CONFIG_PATH}: {key!r}") from exc
        if channel < 1:
            raise SystemExit(f"Channel index must be >= 1 in {CHANNELS_CONFIG_PATH}: {channel}")
        if not isinstance(port, int) or port < 1 or port > 65535:
            raise SystemExit(f"Invalid channel port in {CHANNELS_CONFIG_PATH}: {port!r}")
        if channel in channel_ports:
            raise SystemExit(f"Duplicate channel index in {CHANNELS_CONFIG_PATH}: {channel}")
        if port in channel_ports.values():
            raise SystemExit(f"Duplicate channel port in {CHANNELS_CONFIG_PATH}: {port}")
        channel_ports[channel] = port

    if login_port in channel_ports.values():
        raise SystemExit("loginPort must not match any channel port")

    return login_port, dict(sorted(channel_ports.items()))


def load_game_config() -> None:
    global CHAMPION_LEVEL_THRESHOLD
    CHAMPION_LEVEL_THRESHOLD = DEFAULT_CHAMPION_LEVEL_THRESHOLD

    if not GAME_CONFIG_PATH.is_file():
        return

    try:
        data = json.loads(GAME_CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid {GAME_CONFIG_PATH}: {exc}") from exc

    if not isinstance(data, dict):
        raise SystemExit(f"{GAME_CONFIG_PATH} must be a JSON object")

    try:
        threshold = int(data.get("championLevelThreshold", DEFAULT_CHAMPION_LEVEL_THRESHOLD))
    except (TypeError, ValueError) as exc:
        raise SystemExit(f"Invalid championLevelThreshold in {GAME_CONFIG_PATH}") from exc

    if threshold < 1:
        raise SystemExit(f"championLevelThreshold must be >= 1 in {GAME_CONFIG_PATH}")

    CHAMPION_LEVEL_THRESHOLD = threshold


def lobby_url(path: str) -> str:
    return f"http://{HOST}:{LOGIN_PORT}{path}"


def lobby_handoff_url(token: str, target_path: str = PLAY_SELECT_CHANNEL) -> str:
    return (
        f"{lobby_url('/api/lobby-handoff')}"
        f"?token={quote(token, safe='')}"
        f"&to={quote(target_path, safe='')}"
    )


def is_login_port(port: int) -> bool:
    return port == LOGIN_PORT


def is_game_port(port: int) -> bool:
    return port in CHANNEL_PORTS.values()


def channel_for_port(port: int) -> int | None:
    for channel, channel_port in CHANNEL_PORTS.items():
        if channel_port == port:
            return channel
    return None


def port_for_channel(channel: int) -> int:
    try:
        return CHANNEL_PORTS[channel]
    except KeyError as exc:
        raise ValueError("Invalid channel") from exc


def handoff_url(token: str, channel: int) -> str:
    port = port_for_channel(channel)
    return f"http://{HOST}:{port}/api/session-handoff?token={token}"


def hash_password(password: str) -> str:
    return hashlib.sha1(password.encode("utf-8")).hexdigest()


def validate_registration(username: str, password: str) -> tuple[str, str]:
    username = username.strip()
    password = password.strip()

    if not username:
        raise ValueError("Account name is required")
    if len(username) < MIN_USERNAME_LENGTH:
        raise ValueError(f"Account name must be at least {MIN_USERNAME_LENGTH} characters")
    if len(username) > MAX_USERNAME_LENGTH:
        raise ValueError(f"Account name must be at most {MAX_USERNAME_LENGTH} characters")
    if username.startswith("_"):
        raise ValueError("Account name cannot start with an underscore")
    if not USERNAME_PATTERN.fullmatch(username):
        raise ValueError("Account name may only contain letters, numbers, and underscores")

    if not password:
        raise ValueError("Password is required")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_LENGTH} characters")

    return username, password


def validate_character_name(name: str) -> str:
    name = name.strip()
    if not name:
        raise ValueError("Character name is required")
    if len(name) < MIN_USERNAME_LENGTH:
        raise ValueError(f"Character name must be at least {MIN_USERNAME_LENGTH} characters")
    if len(name) > MAX_USERNAME_LENGTH:
        raise ValueError(f"Character name must be at most {MAX_USERNAME_LENGTH} characters")
    if name.startswith("_"):
        raise ValueError("Character name cannot start with an underscore")
    if not USERNAME_PATTERN.fullmatch(name):
        raise ValueError("Character name may only contain letters, numbers, and underscores")
    return name


def format_job_label(job: str) -> str:
    if job == "MartialArtist":
        return "Martial Artist"
    return job


def get_character_start_levels(job: str) -> tuple[int, int]:
    if job == "MartialArtist":
        return MARTIAL_ARTIST_START_LEVEL, 1
    if job in ADVANCED_JOBS:
        return ADVANCED_JOB_START_LEVEL, ADVANCED_JOB_START_JOB_LEVEL
    return 1, 1


def account_has_high_level_character(
    conn: sqlite3.Connection,
    account_id: int,
    min_level: int = MARTIAL_ARTIST_UNLOCK_LEVEL,
) -> bool:
    row = conn.execute(
        """
        SELECT 1
        FROM characters
        WHERE account_id = ?
          AND level >= ?
          AND COALESCE(IsDeleted, 0) = 0
        LIMIT 1
        """,
        (account_id, min_level),
    ).fetchone()
    return row is not None


def martial_artist_unlocked(account_id: int) -> bool:
    if account_id == SUPERADMIN_ACCOUNT_ID:
        return True
    with get_connection() as conn:
        return account_has_high_level_character(conn, account_id)


def get_create_character_options(account_id: int, slot_index: int) -> dict[str, Any]:
    if slot_index < 1 or slot_index > MAX_CHARACTERS_PER_ACCOUNT:
        raise ValueError("Invalid character slot")

    with get_connection() as conn:
        slot_row = conn.execute(
            """
            SELECT id, COALESCE(IsDeleted, 0) AS deleted
            FROM characters
            WHERE account_id = ? AND slot_index = ?
            """,
            (account_id, slot_index),
        ).fetchone()
        if slot_row is not None and not slot_row["deleted"]:
            raise ValueError("Character slot is already in use")

        active_count = conn.execute(
            """
            SELECT COUNT(*)
            FROM characters
            WHERE account_id = ? AND COALESCE(IsDeleted, 0) = 0
            """,
            (account_id,),
        ).fetchone()[0]
        if active_count >= MAX_CHARACTERS_PER_ACCOUNT:
            raise ValueError("No character slots available")

        unlocked = martial_artist_unlocked(account_id)

    return {
        "slotIndex": slot_index,
        "genders": ["male", "female"],
        "hairStyles": sorted(VALID_HAIR_STYLES),
        "jobs": [
            {
                "id": "Adventurer",
                "label": "Adventurer",
                "unlocked": True,
                "startLevel": 1,
                "startJobLevel": 1,
            },
            {
                "id": "MartialArtist",
                "label": "Martial Artist",
                "unlocked": unlocked,
                "requiredLevel": MARTIAL_ARTIST_UNLOCK_LEVEL,
                "startLevel": MARTIAL_ARTIST_START_LEVEL,
                "startJobLevel": 1,
            },
            {
                "id": "Swordsman",
                "label": "Swordsman",
                "unlocked": True,
                "startLevel": ADVANCED_JOB_START_LEVEL,
                "startJobLevel": ADVANCED_JOB_START_JOB_LEVEL,
            },
            {
                "id": "Archer",
                "label": "Archer",
                "unlocked": True,
                "startLevel": ADVANCED_JOB_START_LEVEL,
                "startJobLevel": ADVANCED_JOB_START_JOB_LEVEL,
            },
            {
                "id": "Mage",
                "label": "Mage",
                "unlocked": True,
                "startLevel": ADVANCED_JOB_START_LEVEL,
                "startJobLevel": ADVANCED_JOB_START_JOB_LEVEL,
            },
        ],
        "martialArtistUnlocked": unlocked,
        "martialArtistRequiredLevel": MARTIAL_ARTIST_UNLOCK_LEVEL,
    }


def validate_hair_colour(raw: Any) -> int:
    try:
        colour = int(raw)
    except (TypeError, ValueError):
        raise ValueError("Invalid hair colour") from None
    if colour < HAIR_COLOUR_MIN or colour > HAIR_COLOUR_MAX:
        raise ValueError("Invalid hair colour")
    return colour


def fetch_nosapki_sprite(relative_path: str) -> bytes:
    if not relative_path or ".." in relative_path or not relative_path.endswith(".png"):
        raise ValueError("Invalid sprite path")
    url = f"{NOSAPKI_SPRITE_BASE}/{relative_path.lstrip('/')}"
    request = Request(url, headers={"User-Agent": "NosBazaar/1.0"})
    with urlopen(request, timeout=20) as response:
        data = response.read()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("Unexpected sprite response")
    return data


def create_character(
    account_id: int,
    slot_index: int,
    name: str,
    gender: str,
    job: str,
    hair_style: str = "A",
    hair_colour: int = 1,
) -> dict[str, Any]:
    name = validate_character_name(name)
    gender = str(gender).strip().lower()
    job = str(job).strip()
    hair_style = str(hair_style).strip().upper()

    if gender not in VALID_CHARACTER_GENDERS:
        raise ValueError("Invalid gender")
    if hair_style not in VALID_HAIR_STYLES:
        raise ValueError("Invalid hair style")
    hair_colour = validate_hair_colour(hair_colour)
    if job not in CREATE_CHARACTER_JOBS:
        raise ValueError("Invalid job")
    if job == "MartialArtist" and not martial_artist_unlocked(account_id):
        raise ValueError(
            f"Martial Artist requires another character at Lv.{MARTIAL_ARTIST_UNLOCK_LEVEL} or higher on this account."
        )

    start_level, start_job_level = get_character_start_levels(job)
    character_is_gm = account_id == SUPERADMIN_ACCOUNT_ID

    with get_connection() as conn:
        if slot_index < 1 or slot_index > MAX_CHARACTERS_PER_ACCOUNT:
            raise ValueError("Invalid character slot")

        slot_row = conn.execute(
            """
            SELECT id, COALESCE(IsDeleted, 0) AS deleted
            FROM characters
            WHERE account_id = ? AND slot_index = ?
            """,
            (account_id, slot_index),
        ).fetchone()
        if slot_row is not None and not slot_row["deleted"]:
            raise ValueError("Character slot is already in use")

        active_count = conn.execute(
            """
            SELECT COUNT(*)
            FROM characters
            WHERE account_id = ? AND COALESCE(IsDeleted, 0) = 0
            """,
            (account_id,),
        ).fetchone()[0]
        if active_count >= MAX_CHARACTERS_PER_ACCOUNT:
            raise ValueError("No character slots available")

        existing_name = conn.execute(
            """
            SELECT 1
            FROM characters
            WHERE lower(name) = lower(?) AND COALESCE(IsDeleted, 0) = 0
            """,
            (name,),
        ).fetchone()
        if existing_name is not None:
            raise ValueError("Character name is already taken")

        if slot_row is not None and slot_row["deleted"]:
            conn.execute(
                """
                UPDATE characters
                SET name = ?,
                    gender = ?,
                    hair_style = ?,
                    hair_colour = ?,
                    job = ?,
                    job_level = ?,
                    level = ?,
                    champion_level = 0,
                    gold = 0,
                    IsDeleted = 0,
                    IsGM = ?,
                    skill_page = 1,
                    skill_slots_locked = 0,
                    skill_alt_hotkeys = 0
                WHERE id = ?
                """,
                (name, gender, hair_style, hair_colour, job, start_job_level, start_level, int(character_is_gm), slot_row["id"]),
            )
            character_id = int(slot_row["id"])
        else:
            cursor = conn.execute(
                """
                INSERT INTO characters (
                  account_id, name, slot_index, gender, hair_style, hair_colour, job, job_level, level, IsGM
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    account_id,
                    name,
                    slot_index,
                    gender,
                    hair_style,
                    hair_colour,
                    job,
                    start_job_level,
                    start_level,
                    int(character_is_gm),
                ),
            )
            character_id = int(cursor.lastrowid)

    return {
        "id": character_id,
        "name": name,
        "slotIndex": slot_index,
        "gender": gender,
        "hairStyle": hair_style,
        "hairColour": hair_colour,
        "job": job,
        "jobLabel": format_job_label(job),
        "level": start_level,
        "jobLevel": start_job_level,
        "isGm": character_is_gm,
    }


def list_all_accounts() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
              a.id,
              a.username,
              a.IsAdmin,
              COALESCE(a.IsDeleted, 0) AS deleted,
              (
                SELECT COUNT(*)
                FROM characters c
                WHERE c.account_id = a.id AND COALESCE(c.IsDeleted, 0) = 0
              ) AS character_count
            FROM accounts a
            WHERE a.id != ?
            ORDER BY a.id
            """,
            (SUPERADMIN_ACCOUNT_ID,),
        ).fetchall()

    return [
        {
            "id": row["id"],
            "username": row["username"],
            "isAdmin": bool(row["IsAdmin"]),
            "isDeleted": bool(row["deleted"]),
            "characterCount": row["character_count"],
        }
        for row in rows
    ]


def list_all_characters() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
              c.id,
              c.name,
              c.slot_index,
              c.level,
              c.job_level,
              c.job,
              c.gender,
              c.IsGM,
              COALESCE(c.IsDeleted, 0) AS deleted,
              a.id AS account_id,
              a.username AS account_username
            FROM characters c
            JOIN accounts a ON a.id = c.account_id
            ORDER BY c.id
            """
        ).fetchall()

    return [
        {
            "id": row["id"],
            "name": row["name"],
            "slotIndex": row["slot_index"],
            "level": row["level"],
            "jobLevel": row["job_level"],
            "job": row["job"],
            "jobLabel": format_job_label(row["job"]),
            "gender": row["gender"],
            "isGm": bool(row["IsGM"]),
            "isDeleted": bool(row["deleted"]),
            "accountId": row["account_id"],
            "accountUsername": row["account_username"],
        }
        for row in rows
    ]


def admin_delete_account(account_id: int) -> None:
    if account_id == SUPERADMIN_ACCOUNT_ID:
        raise ValueError("Cannot delete the superadmin account")
    with get_connection() as conn:
        account = conn.execute(
            """
            SELECT id
            FROM accounts
            WHERE id = ? AND COALESCE(IsDeleted, 0) = 0
            """,
            (account_id,),
        ).fetchone()
        if account is None:
            raise ValueError("Account not found")

        conn.execute(
            """
            UPDATE accounts
            SET IsDeleted = 1,
                username = username || '#deleted' || id
            WHERE id = ?
            """,
            (account_id,),
        )
        conn.execute(
            """
            UPDATE characters
            SET IsDeleted = 1,
                name = name || '#deleted' || id
            WHERE account_id = ? AND COALESCE(IsDeleted, 0) = 0
            """,
            (account_id,),
        )

    disconnect_account_sessions(account_id)


def admin_delete_character(character_id: int) -> None:
    with get_connection() as conn:
        character = conn.execute(
            """
            SELECT id, account_id
            FROM characters
            WHERE id = ? AND COALESCE(IsDeleted, 0) = 0
            """,
            (character_id,),
        ).fetchone()
        if character is None:
            raise ValueError("Character not found")

        conn.execute(
            """
            UPDATE characters
            SET IsDeleted = 1,
                name = name || '#deleted' || id
            WHERE id = ?
            """,
            (character_id,),
        )
        account_id = int(character["account_id"])

    for data in sessions.values():
        if data.get("character_id") == character_id:
            data["character_id"] = None


@contextmanager
def get_connection():
    conn = sqlite3.connect(vault.db_work_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    else:
        conn.commit()
        vault.persist_db()
    finally:
        conn.close()


BAZAAR_FILTERS_VAULT_PATH = "assets/bazaar-filters.json"


def load_filters() -> dict:
    return json.loads(vault.read_text(BAZAAR_FILTERS_VAULT_PATH))


def listing_expiry_sql() -> str:
    return f"date(b.list_date, '+{LISTING_TTL_DAYS} days')"


ITEM_SELECT_SQL = """
  i.ItemVNum,
  i.name,
  i.category,
  i.IsAdventurer,
  i.IsSwordsman,
  i.IsArcher,
  i.IsMage,
  i.IsMartialArtist,
  i.RequiredLv,
  i.RequiredCLv,
  i.MinAttack,
  i.MaxAttack,
  i.HitRate,
  i.CritChance,
  i.CritDmg,
  i.Concentration,
  i.MeleeDefence,
  i.RangedDefence,
  i.MagicDefence,
  i.Dodge,
  i.Duration,
  i.Price,
  i.Rarity,
  i.DynamicGroupName,
  i.Shell,
  i.Effects,
  i.Description,
  i.NameCode,
  i.DescCode,
  i.LineDesc,
  i.InventoryType,
  i.ItemType,
  i.ItemSubType,
  i.EquipmentSlot,
  i.IconId,
  i.Design,
  i.RawUnknown,
  i.ClassMask,
  i.FlagJson,
  i.BuffCodeJson,
  i.BuffJson,
  i.NameI18nJson,
  i.DescI18nJson
"""


def item_to_dict(row: sqlite3.Row) -> dict:
    class_mask = int(row["ClassMask"] or 0)
    return {
        "itemVNum": row["ItemVNum"],
        "name": row["name"],
        "category": row["category"],
        "isAdventurer": bool(row["IsAdventurer"]),
        "isSwordsman": bool(row["IsSwordsman"]),
        "isArcher": bool(row["IsArcher"]),
        "isMage": bool(row["IsMage"]),
        "isMartialArtist": bool(row["IsMartialArtist"]),
        "requiredLv": row["RequiredLv"],
        "requiredCLv": row["RequiredCLv"],
        "minAttack": row["MinAttack"],
        "maxAttack": row["MaxAttack"],
        "hitRate": row["HitRate"],
        "critChance": row["CritChance"],
        "critDmg": row["CritDmg"],
        "concentration": row["Concentration"],
        "meleeDefence": row["MeleeDefence"],
        "rangedDefence": row["RangedDefence"],
        "magicDefence": row["MagicDefence"],
        "dodge": row["Dodge"],
        "duration": row["Duration"],
        "price": row["Price"],
        "rarity": row["Rarity"],
        "dynamicGroupName": row["DynamicGroupName"],
        "shell": row["Shell"],
        "effects": row["Effects"],
        "description": row["Description"],
        "nameCode": row["NameCode"],
        "descCode": row["DescCode"],
        "lineDesc": row["LineDesc"],
        "inventoryType": row["InventoryType"],
        "itemType": row["ItemType"],
        "itemSubType": row["ItemSubType"],
        "equipmentSlot": row["EquipmentSlot"],
        "iconId": row["IconId"],
        "design": row["Design"],
        "rawUnknown": row["RawUnknown"],
        "classMask": class_mask,
        "classAbbreviations": class_abbreviations(class_mask),
        "classDisplay": class_display(class_mask),
        "iconUrl": item_icon_url(row["ItemVNum"]),
        "flag": json.loads(row["FlagJson"] or "{}"),
        "buffCode": json.loads(row["BuffCodeJson"] or "[]"),
        "buff": json.loads(row["BuffJson"] or "{}"),
        "nameI18n": json.loads(row["NameI18nJson"] or "{}"),
        "descI18n": json.loads(row["DescI18nJson"] or "{}"),
    }


def fetch_character_inventory(conn: sqlite3.Connection, character_id: int) -> dict[str, Any]:
    rows = conn.execute(
        f"""
        SELECT
          ci.pocket,
          ci.slot,
          ii.id AS item_instance_id,
          ii.Quantity AS quantity,
          {ITEM_SELECT_SQL}
        FROM character_inventory ci
        JOIN item_instances ii ON ci.item_instance_id = ii.id
        JOIN items i ON ii.ItemVNum = i.ItemVNum
        WHERE ci.character_id = ?
        ORDER BY ci.pocket, ci.slot
        """,
        (character_id,),
    ).fetchall()

    pocket_items: dict[int, list[dict[str, Any]]] = {
        POCKET_EQUIPMENT: [],
        POCKET_MAIN: [],
        POCKET_ETC: [],
        POCKET_SPECIALIST: [],
        POCKET_COSTUME: [],
    }
    mount_items: list[dict[str, Any]] = []

    for row in rows:
        entry = {
            "slot": int(row["slot"]),
            "pocket": pocket_id_to_key(pocket),
            "instanceId": int(row["item_instance_id"]),
            "quantity": int(row["quantity"]),
            "item": item_to_dict(row),
        }
        pocket = int(row["pocket"])
        if pocket in pocket_items:
            pocket_items[pocket].append(entry)
        if is_mount_item(row):
            mount_items.append(entry)

    def pocket_payload(items: list[dict[str, Any]]) -> dict[str, Any]:
        return {"slotCount": POCKET_SLOT_COUNT, "items": items}

    return {
        "slotCount": POCKET_SLOT_COUNT,
        "pockets": {
            "equip": pocket_payload(pocket_items[POCKET_EQUIPMENT]),
            "main": pocket_payload(pocket_items[POCKET_MAIN]),
            "etc": pocket_payload(pocket_items[POCKET_ETC]),
            "card": pocket_payload(pocket_items[POCKET_SPECIALIST]),
            "costume": pocket_payload(pocket_items[POCKET_COSTUME]),
            "mount": {"items": mount_items},
        },
    }


def fetch_listings(conn: sqlite3.Connection) -> list[dict]:
    expiry = listing_expiry_sql()
    rows = conn.execute(
        f"""
        SELECT
          b.id,
          b.price AS listing_price,
          b.list_date,
          CAST((julianday({expiry}) - julianday('now')) AS INTEGER) AS days_left,
          ii.id AS item_instance_id,
          ii.Quantity AS quantity,
          c.name AS seller,
          {ITEM_SELECT_SQL}
        FROM bazaar b
        JOIN item_instances ii ON b.item_instance_id = ii.id
        JOIN items i ON ii.ItemVNum = i.ItemVNum
        JOIN characters c ON b.character_id = c.id
        WHERE julianday({expiry}) >= julianday('now')
        ORDER BY b.id
        """
    ).fetchall()

    return [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "itemVNum": row["ItemVNum"],
            "iconId": row["IconId"] or row["ItemVNum"],
            "iconUrl": item_icon_url(row["ItemVNum"]),
            "amount": row["quantity"],
            "price": row["listing_price"],
            "days": max(0, row["days_left"]),
            "seller": row["seller"],
            "category": row["category"],
            "listDate": row["list_date"],
            "itemInstanceId": row["item_instance_id"],
            "item": item_to_dict(row),
        }
        for row in rows
    ]


def fetch_skills(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT name, description FROM skills ORDER BY name").fetchall()
    return [{"name": row["name"], "description": row["description"]} for row in rows]


def fetch_preferences(conn: sqlite3.Connection, character_id: int) -> dict:
    row = conn.execute(
        """
        SELECT skill_page, skill_slots_locked, skill_alt_hotkeys
        FROM characters
        WHERE id = ? AND COALESCE(IsDeleted, 0) = 0
        """,
        (character_id,),
    ).fetchone()
    if row is None:
        raise ValueError("Character not found")

    return {
        "skillPage": int(row["skill_page"]),
        "skillSlotsLocked": bool(row["skill_slots_locked"]),
        "skillAltHotkeys": bool(row["skill_alt_hotkeys"]),
    }


def update_preferences(character_id: int, payload: dict) -> dict:
    skill_page = int(payload.get("skillPage", 1))
    if skill_page not in (1, 2):
        raise ValueError("Invalid skill page")

    skill_slots_locked = 1 if payload.get("skillSlotsLocked") else 0
    skill_alt_hotkeys = 1 if payload.get("skillAltHotkeys") else 0

    with get_connection() as conn:
        updated = conn.execute(
            """
            UPDATE characters
            SET skill_page = ?, skill_slots_locked = ?, skill_alt_hotkeys = ?
            WHERE id = ?
            """,
            (skill_page, skill_slots_locked, skill_alt_hotkeys, character_id),
        ).rowcount
        if updated == 0:
            raise ValueError("Character not found")
        conn.commit()
        return fetch_preferences(conn, character_id)


def get_character(conn: sqlite3.Connection, character_id: int) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT id, account_id, name, gold, IsGM, gender, hair_style, hair_colour, job
        FROM characters
        WHERE id = ? AND COALESCE(IsDeleted, 0) = 0
        """,
        (character_id,),
    ).fetchone()


def is_account_admin(account_id: int) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT IsAdmin FROM accounts WHERE id = ? AND COALESCE(IsDeleted, 0) = 0",
            (account_id,),
        ).fetchone()
    return bool(row and row["IsAdmin"])


def is_session_admin(state: SessionState | None) -> bool:
    if state is None:
        return False
    if state.is_superadmin:
        return True
    if state.account_id is None:
        return False
    return is_account_admin(state.account_id)


def ensure_superadmin_account() -> None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM accounts WHERE id = ?",
            (SUPERADMIN_ACCOUNT_ID,),
        ).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO accounts (id, username, password, IsAdmin, IsDeleted)
                VALUES (?, ?, ?, 1, 0)
                """,
                (
                    SUPERADMIN_ACCOUNT_ID,
                    SUPERADMIN_DB_USERNAME,
                    hash_password(secrets.token_hex(32)),
                ),
            )
        else:
            conn.execute(
                "UPDATE accounts SET IsAdmin = 1 WHERE id = ?",
                (SUPERADMIN_ACCOUNT_ID,),
            )

        conn.execute(
            """
            UPDATE characters
            SET IsGM = 1
            WHERE account_id = ? AND COALESCE(IsDeleted, 0) = 0
            """,
            (SUPERADMIN_ACCOUNT_ID,),
        )


def list_characters(conn: sqlite3.Connection, account_id: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT id, name, slot_index, gold, level, champion_level, job, job_level, gender
        FROM characters
        WHERE account_id = ? AND COALESCE(IsDeleted, 0) = 0
        ORDER BY slot_index
        """,
        (account_id,),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "slotIndex": row["slot_index"],
            "gold": row["gold"],
            "level": row["level"],
            "championLevel": row["champion_level"],
            "job": row["job"],
            "jobLabel": format_job_label(row["job"]),
            "jobLevel": row["job_level"],
            "gender": row["gender"],
        }
        for row in rows
    ]


def mark_character_deleted(account_id: int, character_id: int) -> None:
    with get_connection() as conn:
        character = conn.execute(
            """
            SELECT id
            FROM characters
            WHERE id = ? AND account_id = ? AND COALESCE(IsDeleted, 0) = 0
            """,
            (character_id, account_id),
        ).fetchone()
        if character is None:
            raise ValueError("Character not found")

        conn.execute(
            """
            UPDATE characters
            SET IsDeleted = 1,
                name = name || '#deleted' || id
            WHERE id = ? AND account_id = ?
            """,
            (character_id, account_id),
        )


def mark_account_deleted(account_id: int) -> None:
    admin_delete_account(account_id)


def get_bootstrap(character_id: int) -> dict:
    filters = load_filters()
    with get_connection() as conn:
        character = get_character(conn, character_id)
        if character is None:
            raise ValueError("Character not found")

        listings = fetch_listings(conn)

    return {
        **filters,
        "player": {
            "id": character["id"],
            "name": character["name"],
            "gold": character["gold"],
            "isGm": bool(character["IsGM"]),
        },
        "listings": listings,
    }


def login_account(username: str, password: str) -> dict:
    with get_connection() as conn:
        account = conn.execute(
            "SELECT id, username, IsAdmin FROM accounts WHERE username = ? AND password = ? AND COALESCE(IsDeleted, 0) = 0",
            (username, hash_password(password)),
        ).fetchone()

        if account is None:
            raise ValueError("Invalid username or password")

        if int(account["id"]) == SUPERADMIN_ACCOUNT_ID:
            raise ValueError("Invalid username or password")

        characters = list_characters(conn, account["id"])

    return {
        "accountId": account["id"],
        "isSuperadmin": False,
        "isAdmin": bool(account["IsAdmin"]),
        "characters": characters,
        "maxCharacters": MAX_CHARACTERS_PER_ACCOUNT,
    }


def authenticate_admin_login(username: str, password: str) -> dict:
    if verify_superadmin(username, password, auth_config):
        superadmin_username = username.strip()
        return {
            "accountId": SUPERADMIN_ACCOUNT_ID,
            "username": superadmin_username,
            "isSuperadmin": True,
            "isAdmin": True,
            "redirect": lobby_url(ADMIN_HOME),
        }

    account = login_account(username, password)
    if not account.get("isAdmin"):
        raise ValueError("Administrator access required")
    account["redirect"] = lobby_url(ADMIN_HOME)
    return account


def authenticate_login(username: str, password: str) -> dict:
    if verify_superadmin(username, password, auth_config):
        superadmin_username = username.strip()
        return {
            "accountId": SUPERADMIN_ACCOUNT_ID,
            "username": superadmin_username,
            "isSuperadmin": True,
            "isAdmin": True,
            "characters": [],
            "maxCharacters": MAX_CHARACTERS_PER_ACCOUNT,
            "redirect": lobby_url(PLAY_SELECT_CHANNEL),
        }

    account = login_account(username, password)
    account["redirect"] = None
    return account


def session_dict_from_account(account: dict[str, Any]) -> dict[str, Any]:
    if account.get("isSuperadmin"):
        return {
            "account_id": SUPERADMIN_ACCOUNT_ID,
            "is_superadmin": True,
            "username": account["username"],
            "channel": None,
            "character_id": None,
        }

    return {
        "account_id": account["accountId"],
        "is_superadmin": False,
        "channel": None,
        "character_id": None,
    }


def establish_session(
    existing_token: str | None,
    account: dict[str, Any],
) -> str:
    fresh = session_dict_from_account(account)
    if existing_token and existing_token in sessions:
        current = sessions[existing_token]
        if fresh.get("is_superadmin"):
            sessions[existing_token] = fresh
            return existing_token
        if current.get("is_superadmin"):
            token = secrets.token_urlsafe(32)
            sessions[token] = fresh
            return token
        if current.get("account_id") == fresh.get("account_id"):
            sessions[existing_token] = {
                **fresh,
                "channel": current.get("channel"),
                "character_id": current.get("character_id"),
            }
            return existing_token

    token = secrets.token_urlsafe(32)
    sessions[token] = fresh
    return token


def register_account(username: str, password: str) -> dict:
    username, password = validate_registration(username, password)

    if is_reserved_superadmin_username(username, auth_config):
        raise ValueError("Account name is already taken")

    if username.lower() == SUPERADMIN_DB_USERNAME.lower():
        raise ValueError("Account name is already taken")

    with get_connection() as conn:
        existing = conn.execute(
            """
            SELECT 1
            FROM accounts
            WHERE username = ? COLLATE NOCASE AND COALESCE(IsDeleted, 0) = 0
            """,
            (username,),
        ).fetchone()
        if existing is not None:
            raise ValueError("Account name is already taken")

        cursor = conn.execute(
            "INSERT INTO accounts (username, password) VALUES (?, ?)",
            (username, hash_password(password)),
        )
        account_id = int(cursor.lastrowid)

    return {
        "accountId": account_id,
        "isSuperadmin": False,
        "isAdmin": False,
        "characters": [],
        "maxCharacters": MAX_CHARACTERS_PER_ACCOUNT,
    }


def select_character(account_id: int, character_id: int) -> dict:
    with get_connection() as conn:
        character = conn.execute(
            """
            SELECT id, name, gold
            FROM characters
            WHERE id = ? AND account_id = ? AND COALESCE(IsDeleted, 0) = 0
            """,
            (character_id, account_id),
        ).fetchone()

    if character is None:
        raise ValueError("Character not found")

    return {
        "id": character["id"],
        "name": character["name"],
        "gold": character["gold"],
    }


def channel_populations() -> dict[int, int]:
    counts: dict[int, int] = {}
    for data in sessions.values():
        if data.get("account_id") is None:
            continue
        channel = data.get("channel")
        if channel is None:
            continue
        channel_key = int(channel)
        counts[channel_key] = counts.get(channel_key, 0) + 1
    return counts


MAX_CHAT_BODY = 200
MAX_CHAT_HISTORY = 1000
chat_messages: list[dict[str, Any]] = []
chat_message_id = 0
chat_lock = threading.Lock()
chat_muted_until: dict[str, float] = {}
chat_banned_accounts: set[int] = set()

PLAYER_CHAT_COMMANDS_HELP = [
    "$help - Show available commands",
    "$familycreate - Create a family",
    "$familyinvite {playerName} - Invite a player to your family",
]

GM_CHAT_COMMANDS_HELP = [
    "$ban {playerName} - Ban a player from the server",
    "$mute {playerName} [minutes] - Mute a player from chat (default: 60)",
    "$unmute {playerName} - Unmute a player",
    "$createitem {ItemVNum} {amount} - Create items",
]

ADMIN_CHAT_COMMANDS_HELP = [
    "$startchannel [channel] - Start game channel(s)",
    "$stopchannel [channel] - Stop game channel(s)",
    "$restartchannel [channel] - Restart game channel(s)",
    "$restartserver - Restart all running game channels",
]


def next_chat_id() -> int:
    global chat_message_id
    chat_message_id += 1
    return chat_message_id


def append_chat_message(message: dict[str, Any]) -> dict[str, Any]:
    with chat_lock:
        stored = {**message, "id": next_chat_id()}
        chat_messages.append(stored)
        while len(chat_messages) > MAX_CHAT_HISTORY:
            chat_messages.pop(0)
        return stored


def latest_chat_id() -> int:
    with chat_lock:
        if not chat_messages:
            return 0
        return int(chat_messages[-1]["id"])


def append_private_command(text: str, recipient_name: str, **extra: Any) -> dict[str, Any]:
    return append_chat_message(
        {
            "channel": "system",
            "kind": "app",
            "text": text,
            "recipientName": recipient_name,
            **extra,
        }
    )


def get_character_by_name(conn: sqlite3.Connection, name: str) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT id, account_id, name
        FROM characters
        WHERE lower(name) = lower(?) AND COALESCE(IsDeleted, 0) = 0
        """,
        (name.strip(),),
    ).fetchone()


def is_character_muted(name: str) -> bool:
    key = name.lower()
    until = chat_muted_until.get(key)
    if until is None:
        return False
    if until <= time.time():
        chat_muted_until.pop(key, None)
        return False
    return True


def disconnect_account_sessions(account_id: int) -> None:
    tokens_to_remove = [
        token
        for token, data in sessions.items()
        if data.get("account_id") == account_id
    ]
    for token in tokens_to_remove:
        sessions.pop(token, None)


def ban_character_by_name(name: str) -> str:
    with get_connection() as conn:
        character = get_character_by_name(conn, name)
        if character is None:
            raise ValueError(f"Character not found: {name}")

    chat_banned_accounts.add(int(character["account_id"]))
    disconnect_account_sessions(int(character["account_id"]))
    return f"{character['name']} has been banned."


def mute_character_by_name(name: str, minutes: int) -> str:
    with get_connection() as conn:
        character = get_character_by_name(conn, name)
        if character is None:
            raise ValueError(f"Character not found: {name}")

    display_name = character["name"]
    chat_muted_until[display_name.lower()] = time.time() + minutes * 60
    return f"{display_name} has been muted for {minutes} minute(s)."


def unmute_character_by_name(name: str) -> str:
    with get_connection() as conn:
        character = get_character_by_name(conn, name)
        if character is None:
            raise ValueError(f"Character not found: {name}")

    display_name = character["name"]
    chat_muted_until.pop(display_name.lower(), None)
    return f"{display_name} has been unmuted."


def gm_create_item(character_id: int, item_vnum: int, amount: int) -> str:
    if amount < 1 or amount > 9999:
        raise ValueError("Amount must be between 1 and 9999")

    with get_connection() as conn:
        item = conn.execute(
            "SELECT ItemVNum, name FROM items WHERE ItemVNum = ?",
            (item_vnum,),
        ).fetchone()
        if item is None:
            raise ValueError(f"Unknown item vnum: {item_vnum}")

        character = get_character(conn, character_id)
        if character is None:
            raise ValueError("Character not found.")

        pocket, slot, added = add_item_to_character_inventory(
            conn, character_id, item_vnum, amount
        )

    pocket_names = {
        POCKET_EQUIPMENT: "EQUIP",
        POCKET_MAIN: "MAIN",
        POCKET_ETC: "ETC",
        POCKET_SPECIALIST: "CARD",
        POCKET_COSTUME: "COSTUME",
    }
    pocket_name = pocket_names.get(pocket, str(pocket))
    return (
        f"Created {added}x {item['name']} in {pocket_name} "
        f"(slot {slot + 1}) for {character['name']}."
    )


def build_chat_command_help(is_admin: bool, is_gm: bool) -> str:
    lines = list(PLAYER_CHAT_COMMANDS_HELP)
    if is_gm:
        lines.extend(GM_CHAT_COMMANDS_HELP)
    if is_admin:
        lines.extend(ADMIN_CHAT_COMMANDS_HELP)
    return "\n".join(lines)


def parse_chat_command(body: str) -> tuple[str, list[str]]:
    text = body.strip()
    if not (text.startswith("$") or text.startswith("%")):
        raise ValueError("Not a command")

    parts = text[1:].split()
    if not parts:
        return "", []
    return parts[0].lower(), parts[1:]


def format_channel_command_result(action: str, result: dict[str, Any]) -> str:
    if result.get("alreadyRunning"):
        return "All configured channels are already running."
    if result.get("alreadyStopped"):
        return "No game channels are currently running."

    key = {
        "start": "startedChannels",
        "stop": "stoppedChannels",
        "restart": "restartedChannels",
    }.get(action, "channels")

    channels = result.get(key) or []
    if not channels:
        return "No channels were affected."

    labels = ", ".join(f"CH{channel}" for channel in channels)
    return f"{action.capitalize()} channel(s): {labels}."


def restart_game_channels(channel: int | None = None) -> dict[str, Any]:
    shutdown_result = shutdown_game_channels(channel)
    start_result = start_game_channels(channel)
    restarted = start_result.get("startedChannels") or shutdown_result.get("stoppedChannels") or []
    return {
        **start_result,
        "restartedChannels": restarted,
    }


def handle_chat_command(state: SessionState, body: str) -> list[dict[str, Any]]:
    sender = get_sender_character(state)
    recipient_name = sender["name"]
    is_admin = is_session_admin(state)
    is_gm = bool(sender["isGm"]) or is_admin

    def reply(text: str) -> list[dict[str, Any]]:
        return [append_private_command(text, recipient_name)]

    def reply_inventory(text: str) -> list[dict[str, Any]]:
        return [append_private_command(text, recipient_name, inventoryChanged=True)]

    def deny() -> list[dict[str, Any]]:
        return reply("You do not have permission to use this command.")

    try:
        command, args = parse_chat_command(body)
    except ValueError:
        return reply("Unknown command. Type $help for a list of commands.")

    if not command:
        return reply("Unknown command. Type $help for a list of commands.")

    if command == "help":
        return reply(build_chat_command_help(is_admin, is_gm))

    if command == "familycreate":
        return reply("Family features are not available yet.")

    if command == "familyinvite":
        if not args:
            return reply("Usage: $familyinvite {playerName}")
        return reply("Family features are not available yet.")

    if command == "ban":
        if not is_gm:
            return deny()
        if not args:
            return reply("Usage: $ban {playerName}")
        try:
            return reply(ban_character_by_name(args[0]))
        except ValueError as exc:
            return reply(str(exc))

    if command == "mute":
        if not is_gm:
            return deny()
        if not args:
            return reply("Usage: $mute {playerName} [minutes]")
        minutes = 60
        if len(args) >= 2:
            try:
                minutes = int(args[1])
            except (TypeError, ValueError):
                return reply("Minutes must be a whole number.")
            if minutes < 1 or minutes > 10080:
                return reply("Minutes must be between 1 and 10080.")
        try:
            return reply(mute_character_by_name(args[0], minutes))
        except ValueError as exc:
            return reply(str(exc))

    if command == "unmute":
        if not is_gm:
            return deny()
        if not args:
            return reply("Usage: $unmute {playerName}")
        try:
            return reply(unmute_character_by_name(args[0]))
        except ValueError as exc:
            return reply(str(exc))

    if command == "createitem":
        if not is_gm:
            return deny()
        if len(args) != 2:
            return reply("Usage: $createitem {ItemVNum} {amount}")
        try:
            item_vnum = int(args[0])
            amount = int(args[1])
            if state.character_id is None:
                return reply("Select a character before using $createitem.")
            return reply_inventory(gm_create_item(state.character_id, item_vnum, amount))
        except (TypeError, ValueError) as exc:
            if isinstance(exc, ValueError) and str(exc).startswith(("Unknown item", "Amount must")):
                return reply(str(exc))
            return reply("ItemVNum and amount must be whole numbers.")

    if command == "startchannel":
        if not is_admin:
            return deny()
        channel = None
        if args:
            try:
                channel = int(args[0])
                port_for_channel(channel)
            except (TypeError, ValueError) as exc:
                return reply(str(exc))
        try:
            result = start_game_channels(channel)
            return reply(format_channel_command_result("start", result))
        except ValueError as exc:
            return reply(str(exc))

    if command == "stopchannel":
        if not is_admin:
            return deny()
        channel = None
        if args:
            try:
                channel = int(args[0])
                port_for_channel(channel)
            except (TypeError, ValueError) as exc:
                return reply(str(exc))
        try:
            result = shutdown_game_channels(channel)
            return reply(format_channel_command_result("stop", result))
        except ValueError as exc:
            return reply(str(exc))

    if command == "restartchannel":
        if not is_admin:
            return deny()
        channel = None
        if args:
            try:
                channel = int(args[0])
                port_for_channel(channel)
            except (TypeError, ValueError) as exc:
                return reply(str(exc))
        try:
            result = restart_game_channels(channel)
            return reply(format_channel_command_result("restart", result))
        except ValueError as exc:
            return reply(str(exc))

    if command == "restartserver":
        if not is_admin:
            return deny()
        try:
            result = restart_game_channels(None)
            return reply(format_channel_command_result("restart", result))
        except ValueError as exc:
            return reply(str(exc))

    return reply("Unknown command. Type $help for a list of commands.")


def get_sender_character(state: SessionState) -> dict[str, Any]:
    with get_connection() as conn:
        character = get_character(conn, state.character_id)
    if character is None:
        raise ValueError("Character not found")
    return {
        "name": character["name"],
        "channel": int(state.channel),
        "isGm": bool(character["IsGM"]),
    }


def find_online_player_by_name(name: str) -> dict[str, Any] | None:
    lookup = name.strip()
    if not lookup:
        return None

    with get_connection() as conn:
        for data in sessions.values():
            if data.get("is_superadmin") or not data.get("character_id"):
                continue
            if data.get("channel") is None:
                continue
            character = get_character(conn, data["character_id"])
            if character is None:
                continue
            if character["name"].lower() == lookup.lower():
                return {
                    "name": character["name"],
                    "channel": int(data["channel"]),
                    "isGm": bool(character["IsGM"]),
                }
    return None


def send_chat_messages(state: SessionState, payload: dict[str, Any]) -> list[dict[str, Any]]:
    if state.account_id is not None and state.account_id in chat_banned_accounts:
        raise ValueError("You are banned from this server.")

    sender = get_sender_character(state)
    msg_type = str(payload.get("type", "general")).strip().lower()
    body = str(payload.get("body", "")).strip()
    if not body:
        raise ValueError("Message is required")
    if len(body) > MAX_CHAT_BODY:
        raise ValueError(f"Message must be at most {MAX_CHAT_BODY} characters")

    if msg_type == "command":
        if is_character_muted(sender["name"]):
            return [
                append_chat_message(
                    {
                        "channel": "whisper",
                        "kind": "whisper-error",
                        "text": "You are muted.",
                        "recipientName": sender["name"],
                    }
                )
            ]
        return handle_chat_command(state, body)

    if is_character_muted(sender["name"]):
        return [
            append_chat_message(
                {
                    "channel": "whisper",
                    "kind": "whisper-error",
                    "text": "You are muted.",
                    "recipientName": sender["name"],
                }
            )
        ]

    if msg_type == "family":
        return [
            append_chat_message(
                {
                    "channel": "whisper",
                    "kind": "whisper-error",
                    "text": "You are not in a family.",
                    "recipientName": sender["name"],
                }
            )
        ]

    if msg_type == "party":
        return [
            append_chat_message(
                {
                    "channel": "whisper",
                    "kind": "whisper-error",
                    "text": "You are not in a party.",
                    "recipientName": sender["name"],
                }
            )
        ]

    if msg_type == "whisper":
        target_name = str(payload.get("targetName", "")).strip()
        if not target_name:
            raise ValueError("Whisper target is required")
        if target_name.lower() == sender["name"].lower():
            raise ValueError("You cannot whisper yourself")

        target = find_online_player_by_name(target_name)
        if target is None:
            return [
                append_chat_message(
                    {
                        "channel": "whisper",
                        "kind": "whisper-error",
                        "text": "User is not connected.",
                        "recipientName": sender["name"],
                    }
                )
            ]

        outgoing = append_chat_message(
            {
                "channel": "whisper",
                "kind": "whisper",
                "direction": "outgoing",
                "playerName": sender["name"],
                "body": body,
                "targetName": target["name"],
                "targetChannel": target["channel"],
            }
        )
        incoming = append_chat_message(
            {
                "channel": "whisper",
                "kind": "whisper",
                "direction": "incoming",
                "playerName": sender["name"],
                "body": body,
                "sourceChannel": sender["channel"],
                "recipientName": target["name"],
            }
        )
        return [outgoing, incoming]

    if msg_type == "general":
        return [
            append_chat_message(
                {
                    "channel": "general",
                    "kind": "general",
                    "playerName": sender["name"],
                    "body": body,
                    "gameChannel": sender["channel"],
                    "isGm": sender["isGm"],
                }
            )
        ]

    raise ValueError("Invalid chat type")


def is_chat_message_visible_to_player(
    message: dict[str, Any],
    player_name: str,
    game_channel: int,
) -> bool:
    kind = message.get("kind")
    if kind in ("general", "speaker"):
        return message.get("gameChannel") == game_channel

    if kind == "whisper":
        if message.get("direction") == "outgoing":
            return message.get("playerName") == player_name
        if message.get("direction") == "incoming":
            return message.get("recipientName") == player_name
        return False

    if kind == "whisper-error":
        return message.get("recipientName") == player_name

    if kind == "command":
        return message.get("recipientName") == player_name

    if kind in ("server", "app"):
        if message.get("recipientName"):
            return message.get("recipientName") == player_name
        return message.get("gameChannel") in (None, game_channel)

    return False


def filter_chat_messages_for_player(
    messages: list[dict[str, Any]],
    player_name: str,
    game_channel: int,
) -> list[dict[str, Any]]:
    return [
        message
        for message in messages
        if is_chat_message_visible_to_player(message, player_name, game_channel)
    ]


def chat_messages_since(player_name: str, game_channel: int, since_id: int = 0) -> list[dict[str, Any]]:
    visible: list[dict[str, Any]] = []
    with chat_lock:
        for message in chat_messages:
            if message["id"] <= since_id:
                continue

            if is_chat_message_visible_to_player(message, player_name, game_channel):
                visible.append(message)

    return visible


def channel_load_status(population: int) -> str:
    if CHANNEL_MAX_PLAYERS <= 0:
        return "normal"

    fill_ratio = population / CHANNEL_MAX_PLAYERS
    if fill_ratio >= CHANNEL_FULL_RATIO:
        return "full"
    if fill_ratio > CHANNEL_HALF_RATIO:
        return "normal"
    return "recommended"


def list_channels() -> list[dict]:
    running = set(running_channels())
    populations = channel_populations()

    items: list[dict] = []
    for channel, port in sorted(CHANNEL_PORTS.items()):
        population = populations.get(channel, 0)
        is_running = channel in running
        status = channel_load_status(population) if is_running else "offline"
        items.append(
            {
                "channel": channel,
                "port": port,
                "number": f"{channel:02d}",
                "label": f"CH{channel}",
                "running": is_running,
                "population": population,
                "maxPlayers": CHANNEL_MAX_PLAYERS,
                "status": status,
            }
        )
    return items


def running_channels() -> list[int]:
    with channels_lock:
        return sorted(channel_runtimes.keys())


def channels_are_running() -> bool:
    with channels_lock:
        return bool(channel_runtimes)


def is_channel_running(channel: int) -> bool:
    with channels_lock:
        return channel in channel_runtimes


def parse_channel_index_param(payload: dict) -> int | None:
    if "channel" not in payload or payload["channel"] is None:
        return None
    try:
        channel = int(payload["channel"])
    except (TypeError, ValueError) as exc:
        raise ValueError("channel must be a channel index (1, 2, 3, ...)") from exc
    port_for_channel(channel)
    return channel


def start_game_channels(channel: int | None = None) -> dict[str, Any]:
    global channel_runtimes

    if channel is not None:
        channels_to_start = [channel]
    else:
        channels_to_start = [
            channel
            for channel in CHANNEL_PORTS
            if not is_channel_running(channel)
        ]

    started_channels: list[int] = []
    started_servers: list[BazaarHTTPServer] = []
    started_threads: list[threading.Thread] = []

    try:
        for target_channel in channels_to_start:
            with channels_lock:
                if target_channel in channel_runtimes:
                    continue

            port = port_for_channel(target_channel)
            server = BazaarHTTPServer((HOST, port), BazaarHandler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            with channels_lock:
                channel_runtimes[target_channel] = (server, thread)

            started_channels.append(target_channel)
            started_servers.append(server)
            started_threads.append(thread)
    except OSError as exc:
        for server in started_servers:
            server.shutdown()
        for thread in started_threads:
            thread.join(timeout=2)
        with channels_lock:
            for channel in started_channels:
                channel_runtimes.pop(channel, None)
        if getattr(exc, "winerror", None) == 10048 or exc.errno in (48, 98):
            raise ValueError("Could not start game channels: port already in use.") from exc
        raise ValueError(f"Could not start game channels: {exc}") from exc

    if not started_channels:
        return {
            "ok": True,
            "channelsRunning": channels_are_running(),
            "runningChannels": running_channels(),
            "alreadyRunning": True,
            "startedChannels": [],
            "channels": list_channels(),
        }

    channel_labels = ", ".join(
        f"CH{channel}:{CHANNEL_PORTS[channel]}" for channel in started_channels
    )
    print(f"Game channels started on {HOST} ({channel_labels})")
    return {
        "ok": True,
        "channelsRunning": True,
        "runningChannels": running_channels(),
        "startedChannels": started_channels,
        "channels": list_channels(),
    }


def eject_sessions_from_channel(channel: int) -> None:
    channel_key = int(channel)
    for session in sessions.values():
        if session.get("channel") is not None and int(session["channel"]) == channel_key:
            session["channel"] = None
            session["character_id"] = None
            session["channel_disconnect"] = True


def shutdown_game_channels(channel: int | None = None) -> dict[str, Any]:
    global channel_runtimes

    if channel is not None:
        port_for_channel(channel)
        target_channels = [channel]
    else:
        target_channels = running_channels()

    if not target_channels:
        return {
            "ok": True,
            "channelsRunning": False,
            "runningChannels": [],
            "stoppedChannels": [],
            "alreadyStopped": True,
        }

    stopped_channels: list[int] = []
    for target_channel in target_channels:
        eject_sessions_from_channel(target_channel)

        with channels_lock:
            runtime = channel_runtimes.pop(target_channel, None)
        if runtime is None:
            continue

        server, thread = runtime
        server.shutdown()
        thread.join(timeout=5)
        stopped_channels.append(target_channel)

    if stopped_channels:
        labels = ", ".join(f"CH{channel}" for channel in stopped_channels)
        print(f"Game channels stopped: {labels}")

    return {
        "ok": True,
        "channelsRunning": channels_are_running(),
        "runningChannels": running_channels(),
        "stoppedChannels": stopped_channels,
    }


def shutdown_all_servers() -> None:
    shutdown_game_channels()
    if login_server is not None:
        login_server.shutdown()


def buy_listing(listing_id: int, buyer_id: int, quantity: int = 1) -> dict:
    if quantity < 1:
        raise ValueError("Invalid quantity")

    expiry = listing_expiry_sql()
    with get_connection() as conn:
        listing = conn.execute(
            f"""
            SELECT
              b.id,
              b.price,
              b.character_id AS seller_id,
              i.name,
              ii.id AS instance_id,
              ii.Quantity AS available
            FROM bazaar b
            JOIN item_instances ii ON b.item_instance_id = ii.id
            JOIN items i ON ii.ItemVNum = i.ItemVNum
            WHERE b.id = ?
              AND julianday({expiry}) >= julianday('now')
            """,
            (listing_id,),
        ).fetchone()

        if listing is None:
            raise ValueError("Listing not found or expired")

        if listing["seller_id"] == buyer_id:
            raise ValueError("Cannot buy your own listing")

        available = int(listing["available"])
        if quantity > available:
            raise ValueError("Not enough stock")

        unit_price = int(listing["price"])
        total_price = unit_price * quantity

        buyer = get_character(conn, buyer_id)
        if buyer is None:
            raise ValueError("Character not found")

        if buyer["gold"] < total_price:
            raise ValueError("Not enough gold")

        seller = get_character(conn, listing["seller_id"])
        if seller is None:
            raise ValueError("Seller not found")

        buyer_gold = buyer["gold"] - total_price
        seller_gold = seller["gold"] + total_price

        conn.execute("UPDATE characters SET gold = ? WHERE id = ?", (buyer_gold, buyer_id))
        conn.execute(
            "UPDATE characters SET gold = ? WHERE id = ?",
            (seller_gold, listing["seller_id"]),
        )

        remaining = available - quantity
        if remaining > 0:
            conn.execute(
                "UPDATE item_instances SET Quantity = ? WHERE id = ?",
                (remaining, listing["instance_id"]),
            )
        else:
            conn.execute("DELETE FROM bazaar WHERE id = ?", (listing_id,))
            conn.execute("DELETE FROM item_instances WHERE id = ?", (listing["instance_id"]))

        conn.commit()

        return {
            "gold": buyer_gold,
            "name": listing["name"],
            "listingId": listing_id,
            "quantity": quantity,
            "remaining": remaining,
        }


def clear_bazaar(conn: sqlite3.Connection) -> dict:
    deleted = conn.execute("DELETE FROM bazaar").rowcount
    return {"ok": True, "deleted": {"bazaar": deleted}}


def clear_item_instances(conn: sqlite3.Connection) -> dict:
    bazaar_deleted = conn.execute("DELETE FROM bazaar").rowcount
    instances_deleted = conn.execute("DELETE FROM item_instances").rowcount
    return {
        "ok": True,
        "deleted": {
            "bazaar": bazaar_deleted,
            "item_instances": instances_deleted,
        },
    }


def clear_items(conn: sqlite3.Connection) -> dict:
    bazaar_deleted = conn.execute("DELETE FROM bazaar").rowcount
    instances_deleted = conn.execute("DELETE FROM item_instances").rowcount
    items_deleted = conn.execute("DELETE FROM items").rowcount
    return {
        "ok": True,
        "deleted": {
            "bazaar": bazaar_deleted,
            "item_instances": instances_deleted,
            "items": items_deleted,
        },
    }


def session_state_from_dict(data: dict[str, Any] | None) -> SessionState | None:
    if not data:
        return None
    if data.get("is_superadmin"):
        return SessionState(
            account_id=SUPERADMIN_ACCOUNT_ID,
            channel=data.get("channel"),
            character_id=data.get("character_id"),
            is_superadmin=True,
            username=data.get("username"),
        )
    if data.get("account_id") is None:
        return None
    return SessionState(
        account_id=int(data["account_id"]),
        channel=data.get("channel"),
        character_id=data.get("character_id"),
        is_superadmin=False,
    )


def build_session_status(
    state: SessionState | None,
    current_port: int,
    token: str | None = None,
) -> dict:
    login_url = lobby_url(PLAY_LOGIN)
    channel_disconnect = bool(token and sessions.get(token, {}).get("channel_disconnect"))

    if state is None:
        payload = {"step": "none", "authenticated": False, "loginUrl": login_url}
        if not is_login_port(current_port):
            payload["lobbyUrl"] = login_url
        return payload

    authenticated = {"authenticated": True}
    payload_is_admin = {"isAdmin": is_session_admin(state)}
    if is_session_admin(state):
        payload_is_admin["adminUrl"] = lobby_url(ADMIN_HOME)

    if state.channel is None:
        payload = {
            "step": "channel",
            "loginUrl": login_url,
            "channelDisconnect": channel_disconnect,
            **authenticated,
            **payload_is_admin,
        }
        if not is_login_port(current_port):
            if token:
                payload["lobbyUrl"] = lobby_handoff_url(token, PLAY_SELECT_CHANNEL)
            else:
                payload["lobbyUrl"] = lobby_url(PLAY_SELECT_CHANNEL)
        return payload

    if state.character_id is None:
        payload = {"step": "character", "loginUrl": login_url, "channel": state.channel, **authenticated, **payload_is_admin}
        if not is_login_port(current_port):
            payload["lobbyUrl"] = lobby_url(PLAY_SELECT_CHARACTER)
        return payload

    expected_port = port_for_channel(state.channel)
    if current_port != expected_port:
        if token:
            return {
                "step": "game",
                "ready": False,
                "redirect": handoff_url(token, state.channel),
                "channel": state.channel,
                "loginUrl": login_url,
                **authenticated,
                **payload_is_admin,
            }

    return {
        "step": "game",
        "ready": current_port == expected_port,
        "channel": state.channel,
        "port": expected_port,
        "loginUrl": login_url,
        **authenticated,
        **payload_is_admin,
    }


class BazaarHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "web"), **kwargs)

    @property
    def current_port(self) -> int:
        return int(self.server.server_address[1])

    @property
    def on_login_port(self) -> bool:
        return is_login_port(self.current_port)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _external_redirect(self, location: str) -> None:
        self.send_response(HTTPStatus.FOUND)
        self.send_header("Location", location)
        self.end_headers()

    def _redirect_lobby_home(self) -> None:
        state = self._session_state()
        if state is None:
            return self._redirect(PLAY_LOGIN)
        if state.channel is None:
            return self._redirect(PLAY_SELECT_CHANNEL)
        if state.character_id is None:
            return self._redirect(PLAY_SELECT_CHARACTER)
        token = self._session_token()
        if token:
            return self._external_redirect(handoff_url(token, state.channel))
        return self._redirect(PLAY_LOGIN)

    def _redirect_game_home(self) -> None:
        if self._session_ready_for_game():
            return self._redirect(PLAY_MAIN)

        state = self._session_state()
        if state is None:
            return self._external_redirect(lobby_url(PLAY_LOGIN))
        if state.channel is None:
            return self._external_redirect(lobby_url(PLAY_SELECT_CHANNEL))
        if state.character_id is None:
            return self._external_redirect(lobby_url(PLAY_SELECT_CHARACTER))

        token = self._session_token()
        if token:
            return self._external_redirect(handoff_url(token, state.channel))
        return self._external_redirect(lobby_url(PLAY_LOGIN))

    def _redirect_home(self) -> None:
        if self.on_login_port:
            return self._redirect_lobby_home()
        return self._redirect_game_home()

    def _redirect_to_login_port(self, path: str) -> None:
        if self.on_login_port:
            return self._redirect(path)
        return self._external_redirect(lobby_url(path))

    def do_GET(self) -> None:
        path = normalize_path(urlparse(self.path).path)
        route = resolve_get_route(path, ROOT)

        if route.kind == RouteKind.BAZAAR_REDIRECT:
            if not self._session_ready_for_game():
                return self._redirect_home()
            return self._redirect(PLAY_MAIN)

        if route.kind == RouteKind.VAULT_ASSET:
            return self._serve_vault_asset(route.vault_name or "")

        if route.kind == RouteKind.STATIC_FILE:
            return self._serve_static(route.file_path)

        if route.kind == RouteKind.NOT_FOUND:
            return self._serve_page(route.file_path, status=HTTPStatus.NOT_FOUND)

        if route.kind == RouteKind.PAGE:
            return self._dispatch_page(route.page_id, route.file_path)

        if route.kind == RouteKind.API:
            return self._dispatch_api_get(path)

        return self._serve_not_found()

    def do_HEAD(self) -> None:
        saved_wfile = self.wfile
        self.wfile = io.BytesIO()
        try:
            self.do_GET()
        finally:
            self.wfile = saved_wfile

    def _dispatch_page(self, page_id: PageId | None, file_path: Path | None) -> None:
        if page_id == PageId.INDEX:
            if not self.on_login_port:
                return self._redirect_game_home()
            return self._serve_page(file_path)

        if page_id == PageId.PLAY_HOME:
            if not self.on_login_port:
                return self._external_redirect(lobby_url(PLAY_HOME))
            state = self._session_state()
            if state is None:
                return self._redirect(PLAY_LOGIN)
            if state.character_id and state.channel:
                token = self._session_token()
                if token:
                    return self._external_redirect(handoff_url(token, state.channel))
            return self._redirect_lobby_home()

        if page_id == PageId.LOGIN:
            if not self.on_login_port:
                return self._external_redirect(lobby_url(PLAY_LOGIN))
            state = self._session_state()
            if state is not None:
                return self._redirect_lobby_home()
            return self._serve_page(file_path)

        if page_id == PageId.REGISTER:
            if not self.on_login_port:
                return self._external_redirect(lobby_url("/register"))
            state = self._session_state()
            if state is not None:
                return self._redirect_lobby_home()
            return self._serve_page(file_path)

        if page_id == PageId.SELECT_CHANNEL:
            if not self.on_login_port:
                return self._external_redirect(lobby_url(PLAY_SELECT_CHANNEL))
            state = self._session_state()
            if state is None:
                return self._redirect(PLAY_LOGIN)
            if state.channel is not None and state.character_id is None:
                return self._redirect(PLAY_SELECT_CHARACTER)
            if state.channel is not None and state.character_id is not None:
                token = self._session_token()
                if token:
                    return self._external_redirect(handoff_url(token, state.channel))
            return self._serve_page(file_path)

        if page_id == PageId.SELECT_CHARACTER:
            if not self.on_login_port:
                return self._external_redirect(lobby_url(PLAY_SELECT_CHARACTER))
            state = self._session_state()
            if state is None:
                return self._redirect(PLAY_LOGIN)
            if state.channel is None:
                return self._redirect(PLAY_SELECT_CHANNEL)
            if state.character_id is not None:
                token = self._session_token()
                if token:
                    return self._external_redirect(handoff_url(token, state.channel))
            return self._serve_page(file_path)

        if page_id == PageId.CREATE_CHARACTER:
            if not self.on_login_port:
                return self._external_redirect(lobby_url(PLAY_CREATE_CHARACTER))
            state = self._session_state()
            if state is None:
                return self._redirect(PLAY_LOGIN)
            if state.account_id is None:
                return self._redirect(PLAY_LOGIN)
            if state.channel is None:
                return self._redirect(PLAY_SELECT_CHANNEL)
            if state.character_id is not None:
                token = self._session_token()
                if token:
                    return self._external_redirect(handoff_url(token, state.channel))
            return self._serve_page(file_path)

        if page_id == PageId.MAIN:
            if self.on_login_port:
                state = self._session_state()
                if state and state.channel and state.character_id:
                    token = self._session_token()
                    if token:
                        return self._external_redirect(handoff_url(token, state.channel))
                return self._redirect_lobby_home()
            if not self._session_ready_for_game():
                return self._redirect_game_home()
            return self._serve_page(file_path)

        if page_id == PageId.ADMIN:
            if not self.on_login_port:
                return self._external_redirect(lobby_url(ADMIN_HOME))
            if not is_session_admin(self._session_state()):
                return self._redirect(ADMIN_LOGIN)
            return self._serve_page(file_path)

        if page_id == PageId.ADMIN_ACCOUNTS:
            if not self.on_login_port:
                return self._external_redirect(lobby_url(ADMIN_ACCOUNTS))
            if not is_session_admin(self._session_state()):
                return self._redirect(ADMIN_LOGIN)
            return self._serve_page(file_path)

        if page_id == PageId.ADMIN_CHARACTERS:
            if not self.on_login_port:
                return self._external_redirect(lobby_url(ADMIN_CHARACTERS))
            if not is_session_admin(self._session_state()):
                return self._redirect(ADMIN_LOGIN)
            return self._serve_page(file_path)

        if page_id == PageId.ADMIN_LOGIN:
            if not self.on_login_port:
                return self._external_redirect(lobby_url(ADMIN_LOGIN))
            if is_session_admin(self._session_state()):
                return self._redirect(ADMIN_HOME)
            return self._serve_page(file_path)

        return self._serve_not_found()

    def _dispatch_api_get(self, path: str) -> None:
        if path.startswith(NOSAPKI_SPRITE_API_PREFIX):
            relative = path[len(NOSAPKI_SPRITE_API_PREFIX) :]
            try:
                content = fetch_nosapki_sprite(relative)
            except (ValueError, OSError):
                return self._serve_not_found()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            self.wfile.write(content)
            return

        if path == "/api/lobby-handoff":
            parsed = urlparse(self.path)
            if not self.on_login_port:
                return self._external_redirect(f"{lobby_url(parsed.path)}?{parsed.query}")

            query = parse_qs(parsed.query)
            token_values = query.get("token", [])
            token = token_values[0] if token_values else None
            if not token or token not in sessions:
                return self._json_response({"error": "Invalid session"}, status=HTTPStatus.UNAUTHORIZED)

            target_values = query.get("to", [PLAY_SELECT_CHANNEL])
            target_path = target_values[0] if target_values else PLAY_SELECT_CHANNEL
            if not target_path.startswith("/"):
                target_path = PLAY_SELECT_CHANNEL

            fade_in = query.get("fadeIn", [None])[0] == "1"
            location = f"{target_path}?fadeIn=1" if fade_in else target_path
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", location)
            self.send_header("Set-Cookie", f"session={token}; Path=/; HttpOnly; SameSite=Lax")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return

        if path == "/api/session-handoff":
            if self.on_login_port:
                return self._json_response({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)
            query = parse_qs(urlparse(self.path).query)
            token_values = query.get("token", [])
            token = token_values[0] if token_values else None
            if not token or token not in sessions:
                return self._json_response({"error": "Invalid session"}, status=HTTPStatus.UNAUTHORIZED)

            channel = channel_for_port(self.current_port)
            if channel is not None:
                sessions[token]["channel"] = channel

            fade_in = query.get("fadeIn", [None])[0] == "1"
            location = f"{PLAY_MAIN}?fadeIn=1" if fade_in else PLAY_MAIN
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", location)
            self.send_header("Set-Cookie", f"session={token}; Path=/; HttpOnly; SameSite=Lax")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return

        if path == "/api/session-status":
            return self._json_response(
                build_session_status(
                    self._session_state(),
                    self.current_port,
                    self._session_token(),
                )
            )

        if path == "/api/characters":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            state = self._session_state()
            if state is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            if state.account_id is None:
                return self._json_response(
                    {"error": "No play account is available for this session"},
                    status=HTTPStatus.FORBIDDEN,
                )
            if state.channel is None:
                return self._json_response({"error": "Channel not selected"}, status=HTTPStatus.BAD_REQUEST)
            with get_connection() as conn:
                characters = list_characters(conn, state.account_id)
            return self._json_response(
                {
                    "characters": characters,
                    "maxCharacters": MAX_CHARACTERS_PER_ACCOUNT,
                    "channel": state.channel,
                    "championLevelThreshold": CHAMPION_LEVEL_THRESHOLD,
                }
            )

        if path == "/api/create-character/options":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            state = self._session_state()
            if state is None or state.account_id is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            if state.channel is None:
                return self._json_response({"error": "Channel not selected"}, status=HTTPStatus.BAD_REQUEST)
            parsed = urlparse(self.path)
            slot_raw = parse_qs(parsed.query).get("slot", ["1"])[0]
            try:
                slot_index = int(slot_raw)
            except (TypeError, ValueError):
                return self._json_response({"error": "Invalid slot"}, status=HTTPStatus.BAD_REQUEST)
            try:
                options = get_create_character_options(state.account_id, slot_index)
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return self._json_response(
                {
                    **options,
                    "channel": state.channel,
                    "jobChangeLevel": JOB_CHANGE_LEVEL,
                    "jobChangeJobLevel": JOB_CHANGE_JOB_LEVEL,
                }
            )

        if path == "/api/admin/accounts":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            if not is_session_admin(self._session_state()):
                return self._json_response({"error": "Forbidden"}, status=HTTPStatus.FORBIDDEN)
            return self._json_response({"accounts": list_all_accounts()})

        if path == "/api/admin/characters":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            if not is_session_admin(self._session_state()):
                return self._json_response({"error": "Forbidden"}, status=HTTPStatus.FORBIDDEN)
            return self._json_response({"characters": list_all_characters()})

        if path == "/api/channels":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            state = self._session_state()
            if state is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            return self._json_response(
                {
                    "channels": list_channels(),
                    "channelsRunning": channels_are_running(),
                    "runningChannels": running_channels(),
                }
            )

        if path == "/api/me":
            state = self._session_state()
            if not self._session_ready_for_game():
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            with get_connection() as conn:
                character = get_character(conn, state.character_id)
            if character is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            return self._json_response(
                {
                    "id": character["id"],
                    "name": character["name"],
                    "gold": character["gold"],
                    "channel": state.channel,
                    "isGm": bool(character["IsGM"]),
                    "gender": character["gender"],
                    "hairStyle": character["hair_style"],
                    "hairColour": character["hair_colour"],
                    "job": character["job"],
                }
            )

        if path == "/api/health":
            return self._json_response(
                {
                    "ok": True,
                    "server": "nosbazaar",
                    "db": vault.exists("nosbazaar.db"),
                    "loginPort": LOGIN_PORT,
                    "loginUrl": lobby_url(PLAY_LOGIN),
                    "channelsRunning": channels_are_running(),
                    "runningChannels": running_channels(),
                    "channels": list_channels(),
                }
            )

        if path == "/api/bootstrap":
            state = self._session_state()
            if not self._session_ready_for_game():
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            try:
                return self._json_response(get_bootstrap(state.character_id))
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except sqlite3.Error as exc:
                return self._json_response(
                    {"error": f"Database error: {exc}. Run: py scripts/init_db.py"},
                    status=HTTPStatus.INTERNAL_SERVER_ERROR,
                )

        if path == "/api/skills":
            if not self._session_ready_for_game():
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            with get_connection() as conn:
                return self._json_response({"skills": fetch_skills(conn)})

        if path == "/api/preferences":
            state = self._session_state()
            if not self._session_ready_for_game():
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            with get_connection() as conn:
                try:
                    return self._json_response(fetch_preferences(conn, state.character_id))
                except ValueError as exc:
                    return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

        if path == "/api/listings":
            if not self._session_ready_for_game():
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            with get_connection() as conn:
                return self._json_response({"listings": fetch_listings(conn)})

        if path == "/api/inventory":
            state = self._session_state()
            if not self._session_ready_for_game():
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            with get_connection() as conn:
                character = get_character(conn, state.character_id)
                if character is None:
                    return self._json_response({"error": "Character not found"}, status=HTTPStatus.BAD_REQUEST)
                inventory = fetch_character_inventory(conn, state.character_id)
                return self._json_response(
                    {
                        "inventory": inventory,
                        "gold": int(character["gold"]),
                    }
                )

        if path == "/api/chat":
            state = self._session_state()
            if not self._session_ready_for_game():
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            parsed = urlparse(self.path)
            since_raw = parse_qs(parsed.query).get("since", ["0"])[0]
            try:
                since_id = max(0, int(since_raw))
            except (TypeError, ValueError):
                since_id = 0
            try:
                sender = get_sender_character(state)
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.UNAUTHORIZED)
            messages = chat_messages_since(sender["name"], sender["channel"], since_id)
            return self._json_response({"messages": messages, "latestId": latest_chat_id()})

        return self._serve_not_found()

    def _serve_not_found(self) -> None:
        not_found_page = page_file(ROOT, PageId.NOT_FOUND)
        if not not_found_page.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        return self._serve_page(not_found_page, status=HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        path = normalize_path(urlparse(self.path).path)

        if path == "/api/admin-login":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            try:
                payload = self._read_json()
                account = authenticate_admin_login(
                    payload.get("username", ""),
                    payload.get("password", ""),
                )
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.UNAUTHORIZED)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            except sqlite3.Error as exc:
                return self._json_response(
                    {"error": f"Database error: {exc}. Run: py scripts/init_db.py"},
                    status=HTTPStatus.INTERNAL_SERVER_ERROR,
                )

            token = establish_session(self._session_token(), account)
            return self._json_response(
                account,
                set_cookie=f"session={token}; Path=/; HttpOnly; SameSite=Lax",
            )

        if path == "/api/login":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            try:
                payload = self._read_json()
                account = authenticate_login(payload.get("username", ""), payload.get("password", ""))
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.UNAUTHORIZED)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            except sqlite3.Error as exc:
                return self._json_response(
                    {"error": f"Database error: {exc}. Run: py scripts/init_db.py"},
                    status=HTTPStatus.INTERNAL_SERVER_ERROR,
                )

            token = establish_session(self._session_token(), account)
            return self._json_response(
                account,
                set_cookie=f"session={token}; Path=/; HttpOnly; SameSite=Lax",
            )

        if path == "/api/register":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            try:
                payload = self._read_json()
                account = register_account(
                    payload.get("username", ""),
                    payload.get("password", ""),
                )
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            except sqlite3.Error as exc:
                return self._json_response(
                    {"error": f"Database error: {exc}. Run: py scripts/init_db.py"},
                    status=HTTPStatus.INTERNAL_SERVER_ERROR,
                )

            return self._json_response(
                {
                    "ok": True,
                    "message": "Account created successfully.",
                }
            )

        if path == "/api/create-character":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            state = self._session_state()
            if state is None or state.account_id is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            if state.channel is None:
                return self._json_response({"error": "Channel not selected"}, status=HTTPStatus.BAD_REQUEST)
            try:
                payload = self._read_json()
                character = create_character(
                    state.account_id,
                    int(payload.get("slotIndex")),
                    str(payload.get("name", "")),
                    str(payload.get("gender", "")),
                    str(payload.get("job", "")),
                    str(payload.get("hairStyle", "A")),
                    payload.get("hairColour", 1),
                )
            except (ValueError, TypeError) as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            except sqlite3.Error as exc:
                return self._json_response(
                    {"error": f"Database error: {exc}"},
                    status=HTTPStatus.INTERNAL_SERVER_ERROR,
                )
            return self._json_response({"ok": True, "character": character})

        if path == "/api/select-character":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            state = self._session_state()
            if state is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            if state.account_id is None:
                return self._json_response(
                    {"error": "No play account is available for this session"},
                    status=HTTPStatus.FORBIDDEN,
                )
            if state.channel is None:
                return self._json_response({"error": "Channel not selected"}, status=HTTPStatus.BAD_REQUEST)
            if not channels_are_running():
                return self._json_response(
                    {"error": "Game channels are not running"},
                    status=HTTPStatus.SERVICE_UNAVAILABLE,
                )
            if state.channel is not None and not is_channel_running(state.channel):
                return self._json_response(
                    {"error": f"Channel {state.channel} is not running"},
                    status=HTTPStatus.SERVICE_UNAVAILABLE,
                )
            try:
                payload = self._read_json()
                character = select_character(state.account_id, int(payload.get("characterId")))
            except (ValueError, TypeError) as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)

            token = self._session_token()
            if token:
                sessions[token]["character_id"] = character["id"]
            if not token:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            return self._json_response(
                {
                    "character": character,
                    "redirect": handoff_url(token, state.channel),
                }
            )

        if path == "/api/reset-selection":
            token = self._session_token()
            if not token or token not in sessions:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            try:
                payload = self._read_json()
            except json.JSONDecodeError:
                payload = {}
            scope = payload.get("scope", "all")
            if scope == "channel":
                sessions[token]["channel"] = None
                sessions[token]["character_id"] = None
                sessions[token].pop("channel_disconnect", None)
            else:
                sessions[token]["channel"] = None
                sessions[token]["character_id"] = None
                sessions[token].pop("channel_disconnect", None)

            lobby_target = lobby_url(PLAY_SELECT_CHANNEL)
            if not self.on_login_port:
                lobby_target = lobby_handoff_url(token, PLAY_SELECT_CHANNEL)

            return self._json_response(
                {
                    "ok": True,
                    "lobbyUrl": lobby_target,
                }
            )

        if path == "/api/delete-character":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            state = self._session_state()
            if state is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            if state.account_id is None:
                return self._json_response(
                    {"error": "No play account is available for this session"},
                    status=HTTPStatus.FORBIDDEN,
                )
            try:
                payload = self._read_json()
                mark_character_deleted(state.account_id, int(payload.get("characterId")))
            except (ValueError, TypeError) as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            except sqlite3.Error as exc:
                return self._json_response(
                    {"error": f"Database error: {exc}"},
                    status=HTTPStatus.INTERNAL_SERVER_ERROR,
                )
            return self._json_response({"ok": True})

        if path == "/api/admin/delete-account":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            if not is_session_admin(self._session_state()):
                return self._json_response({"error": "Forbidden"}, status=HTTPStatus.FORBIDDEN)
            try:
                payload = self._read_json()
                admin_delete_account(int(payload.get("accountId")))
            except (ValueError, TypeError) as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            except sqlite3.Error as exc:
                return self._json_response(
                    {"error": f"Database error: {exc}"},
                    status=HTTPStatus.INTERNAL_SERVER_ERROR,
                )
            return self._json_response({"ok": True})

        if path == "/api/admin/delete-character":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            if not is_session_admin(self._session_state()):
                return self._json_response({"error": "Forbidden"}, status=HTTPStatus.FORBIDDEN)
            try:
                payload = self._read_json()
                admin_delete_character(int(payload.get("characterId")))
            except (ValueError, TypeError) as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            except sqlite3.Error as exc:
                return self._json_response(
                    {"error": f"Database error: {exc}"},
                    status=HTTPStatus.INTERNAL_SERVER_ERROR,
                )
            return self._json_response({"ok": True})

        if path == "/api/select-channel":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            state = self._session_state()
            if state is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            if state.account_id is None:
                return self._json_response(
                    {"error": "No play account is available for this session"},
                    status=HTTPStatus.FORBIDDEN,
                )
            if not channels_are_running():
                return self._json_response(
                    {"error": "Game channels are not running"},
                    status=HTTPStatus.SERVICE_UNAVAILABLE,
                )
            try:
                payload = self._read_json()
                channel = int(payload.get("channel"))
                port_for_channel(channel)
            except (ValueError, TypeError) as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)

            if not is_channel_running(channel):
                return self._json_response(
                    {"error": f"Channel {channel} is not running"},
                    status=HTTPStatus.SERVICE_UNAVAILABLE,
                )

            token = self._session_token()
            if not token:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)

            sessions[token]["channel"] = channel
            sessions[token]["character_id"] = None
            return self._json_response({"ok": True, "channel": channel})

        if path == "/api/logout":
            token = self._session_token()
            if token:
                sessions.pop(token, None)
            return self._json_response(
                {
                    "ok": True,
                    "indexUrl": lobby_url("/"),
                    "loginUrl": lobby_url(PLAY_LOGIN),
                },
                clear_cookie=True,
            )

        if path == "/api/shutdown-channels":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            state = self._session_state()
            if not is_session_admin(state):
                return self._json_response({"error": "Forbidden"}, status=HTTPStatus.FORBIDDEN)
            try:
                payload = self._read_json()
                channel_value = parse_channel_index_param(payload)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return self._json_response(shutdown_game_channels(channel_value))

        if path == "/api/start-channels":
            if not self.on_login_port:
                return self._json_response({"error": "Use login port"}, status=HTTPStatus.BAD_REQUEST)
            state = self._session_state()
            if not is_session_admin(state):
                return self._json_response({"error": "Forbidden"}, status=HTTPStatus.FORBIDDEN)
            try:
                payload = self._read_json()
                channel_value = parse_channel_index_param(payload)
                return self._json_response(start_game_channels(channel_value))
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

        if path == "/api/chat":
            state = self._session_state()
            if not self._session_ready_for_game():
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            try:
                payload = self._read_json()
                messages = send_chat_messages(state, payload)
                sender = get_sender_character(state)
                messages = filter_chat_messages_for_player(
                    messages,
                    sender["name"],
                    sender["channel"],
                )
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            return self._json_response({"messages": messages})

        if path.startswith("/api/buy/"):
            state = self._session_state()
            if not self._session_ready_for_game():
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)

            listing_id = path.rsplit("/", 1)[-1]
            try:
                body = self._read_json()
                quantity = int(body.get("quantity", 1))
                payload = buy_listing(int(listing_id), state.character_id, quantity)
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            return self._json_response(payload)

        if path == "/api/inventory/move":
            state = self._session_state()
            if not self._session_ready_for_game():
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            try:
                payload = self._read_json()
                instance_id = int(payload.get("instanceId"))
                pocket = str(payload.get("pocket", "")).strip().lower()
                slot = int(payload.get("slot"))
                with get_connection() as conn:
                    move_inventory_item(conn, state.character_id, instance_id, pocket, slot)
                    inventory = fetch_character_inventory(conn, state.character_id)
                return self._json_response({"ok": True, "inventory": inventory})
            except (TypeError, ValueError) as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)

        if path == "/api/inventory/discard":
            state = self._session_state()
            if not self._session_ready_for_game():
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            try:
                payload = self._read_json()
                instance_id = int(payload.get("instanceId"))
                with get_connection() as conn:
                    discard_inventory_item(conn, state.character_id, instance_id)
                    inventory = fetch_character_inventory(conn, state.character_id)
                return self._json_response({"ok": True, "inventory": inventory})
            except (TypeError, ValueError) as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_PUT(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/preferences":
            state = self._session_state()
            if not self._session_ready_for_game():
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            try:
                payload = self._read_json()
                return self._json_response(update_preferences(state.character_id, payload))
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        if not self._session_ready_for_game():
            return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)

        try:
            if path == "/api/bazaar":
                with get_connection() as conn:
                    return self._json_response(clear_bazaar(conn))
            if path == "/api/item-instances":
                with get_connection() as conn:
                    return self._json_response(clear_item_instances(conn))
            if path == "/api/items":
                with get_connection() as conn:
                    return self._json_response(clear_items(conn))
        except sqlite3.Error as exc:
            return self._json_response(
                {"error": f"Database error: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

        self.send_error(HTTPStatus.NOT_FOUND)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"
        return json.loads(body.decode("utf-8"))

    def _session_token(self) -> str | None:
        cookie_header = self.headers.get("Cookie")
        if not cookie_header:
            return None
        jar = SimpleCookie()
        jar.load(cookie_header)
        morsel = jar.get("session")
        return morsel.value if morsel else None

    def _session_state(self) -> SessionState | None:
        token = self._session_token()
        if not token:
            return None
        data = sessions.get(token)
        if not data:
            return None
        if data.get("is_superadmin") and data.get("account_id") is None:
            data = {**data, "account_id": SUPERADMIN_ACCOUNT_ID}
            sessions[token] = data
        return session_state_from_dict(data)

    def _session_ready_for_game(self) -> bool:
        state = self._session_state()
        if state is None or state.account_id is None:
            return False
        if state.account_id in chat_banned_accounts:
            return False
        if state.character_id is None or state.channel is None:
            return False
        return channel_for_port(self.current_port) == state.channel

    def _serve_page(self, file_path: Path | None, status: HTTPStatus = HTTPStatus.OK) -> None:
        if file_path is None or not file_path.is_file():
            return self._serve_not_found()
        return self._serve_file(file_path, status=status, content_type="text/html; charset=utf-8")

    def _serve_static(self, file_path: Path | None) -> None:
        if file_path is None or not file_path.is_file():
            return self._serve_not_found()
        return self._serve_file(file_path, content_type=static_content_type(file_path))

    def _write_bytes(self, content: bytes) -> None:
        chunk_size = 256 * 1024
        for offset in range(0, len(content), chunk_size):
            self.wfile.write(content[offset : offset + chunk_size])

    def _serve_file(
        self,
        file_path: Path,
        status: HTTPStatus = HTTPStatus.OK,
        content_type: str | None = None,
    ) -> None:
        content = file_path.read_bytes()
        if content_type is None:
            content_type = (
                "text/html; charset=utf-8"
                if file_path.suffix == ".html"
                else "application/octet-stream"
            )
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self._write_bytes(content)

    def _serve_vault_asset(self, logical_name: str) -> None:
        try:
            content = vault.read_bytes(logical_name)
        except FileNotFoundError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_type = ASSET_CONTENT_TYPES.get(
            Path(logical_name).suffix.lower(),
            "application/octet-stream",
        )
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self._write_bytes(content)

    def _redirect(self, location: str) -> None:
        self.send_response(HTTPStatus.FOUND)
        self.send_header("Location", location)
        self.end_headers()

    def _json_response(
        self,
        payload: dict,
        status: HTTPStatus = HTTPStatus.OK,
        set_cookie: str | None = None,
        clear_cookie: bool = False,
        redirect: str | None = None,
    ) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if set_cookie:
            self.send_header("Set-Cookie", set_cookie)
        if clear_cookie:
            self.send_header("Set-Cookie", "session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:
        if str(args[0]).startswith(("GET /api/", "POST /api/")):
            super().log_message(format, *args)


def migrate_database() -> None:
    if not vault.exists("nosbazaar.db"):
        return

    conn = sqlite3.connect(vault.db_work_path())
    try:
        account_columns = {
            row[1] for row in conn.execute("PRAGMA table_info(accounts)").fetchall()
        }
        character_columns = {
            row[1] for row in conn.execute("PRAGMA table_info(characters)").fetchall()
        }
        if "IsDeleted" not in account_columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN IsDeleted INTEGER NOT NULL DEFAULT 0")
        if "IsDeleted" not in character_columns:
            conn.execute("ALTER TABLE characters ADD COLUMN IsDeleted INTEGER NOT NULL DEFAULT 0")
        if "level" not in character_columns:
            conn.execute("ALTER TABLE characters ADD COLUMN level INTEGER NOT NULL DEFAULT 1")
        if "champion_level" not in character_columns:
            conn.execute(
                "ALTER TABLE characters ADD COLUMN champion_level INTEGER NOT NULL DEFAULT 0"
            )
        if "job" not in character_columns:
            conn.execute(
                "ALTER TABLE characters ADD COLUMN job TEXT NOT NULL DEFAULT 'Adventurer'"
            )
        if "job_level" not in character_columns:
            conn.execute(
                "ALTER TABLE characters ADD COLUMN job_level INTEGER NOT NULL DEFAULT 1"
            )
        if "gender" not in character_columns:
            conn.execute(
                "ALTER TABLE characters ADD COLUMN gender TEXT NOT NULL DEFAULT 'male'"
            )
        if "hair_style" not in character_columns:
            conn.execute(
                "ALTER TABLE characters ADD COLUMN hair_style TEXT NOT NULL DEFAULT 'A'"
            )
        if "hair_colour" not in character_columns:
            conn.execute(
                "ALTER TABLE characters ADD COLUMN hair_colour INTEGER NOT NULL DEFAULT 1"
            )
        elif conn.execute(
            "SELECT 1 FROM characters WHERE hair_colour = 0 LIMIT 1"
        ).fetchone():
            conn.execute(
                "UPDATE characters SET hair_colour = hair_colour + 1 "
                "WHERE hair_colour BETWEEN 0 AND 9"
            )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS character_inventory (
              character_id INTEGER NOT NULL,
              pocket INTEGER NOT NULL,
              slot INTEGER NOT NULL,
              item_instance_id INTEGER NOT NULL UNIQUE,
              FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
              FOREIGN KEY (item_instance_id) REFERENCES item_instances(id) ON DELETE CASCADE,
              UNIQUE(character_id, pocket, slot),
              CHECK(slot BETWEEN 0 AND 47)
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_character_inventory_character
            ON character_inventory(character_id)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_character_inventory_instance
            ON character_inventory(item_instance_id)
            """
        )
        conn.commit()
    finally:
        conn.close()


def schema_is_compatible() -> bool:
    if not vault.exists("nosbazaar.db"):
        return False

    conn = sqlite3.connect(vault.db_work_path())
    try:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'accounts'"
        ).fetchone()
        if row is None:
            return False

        account_columns = {
            row[1] for row in conn.execute("PRAGMA table_info(accounts)").fetchall()
        }
        character_columns = {
            row[1] for row in conn.execute("PRAGMA table_info(characters)").fetchall()
        }
        return "IsAdmin" in account_columns and "IsGM" in character_columns
    finally:
        conn.close()


def ensure_ready() -> None:
    ensure_vault_compiled(vault, ROOT)
    if vault.exists("nosbazaar.db") and schema_is_compatible():
        migrate_database()
    elif vault.exists("nosbazaar.db") and not schema_is_compatible():
        print("Database schema is outdated. Recreating database...")
        from init_db import main as init_db_main

        init_db_main()
    else:
        print("First run: creating empty database...")
        from init_db import main as init_db_main

        init_db_main()
    ensure_superadmin_account()


AUTOSTART_PATH = "/"


def open_browser() -> None:
    webbrowser.open(lobby_url(AUTOSTART_PATH))


def main() -> None:
    global LOGIN_PORT, CHANNEL_PORTS, login_server

    ensure_ready()
    verify_routes()
    LOGIN_PORT, CHANNEL_PORTS = load_server_config()
    load_game_config()
    assert_port_available(LOGIN_PORT)

    try:
        login_server = BazaarHTTPServer((HOST, LOGIN_PORT), BazaarHandler)
    except OSError as exc:
        if getattr(exc, "winerror", None) == 10048 or exc.errno in (48, 98):
            raise SystemExit(
                f"Port {LOGIN_PORT} is already in use. Stop the other process then run: {server_run_hint()}"
            ) from exc
        raise

    try:
        start_game_channels()
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    print(f"Serving NosBazaar login on {HOST}:{LOGIN_PORT}")
    print(f"Use this server ({server_run_hint()}), not py -m http.server")

    login_thread = threading.Thread(target=login_server.serve_forever, daemon=True)
    login_thread.start()

    if getattr(sys, "frozen", False):
        threading.Timer(0.5, open_browser).start()

    try:
        while login_thread.is_alive():
            login_thread.join(timeout=0.5)
    except KeyboardInterrupt:
        shutdown_all_servers()
        login_thread.join(timeout=2)

    print("Server stopped.")


if __name__ == "__main__":
    main()
