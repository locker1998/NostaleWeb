"""NosBazaar static UI + SQLite API server."""

from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from app_paths import app_root

ROOT = app_root()
DB_PATH = ROOT / "data" / "nosbazaar.db"
FILTERS_PATH = ROOT / "data" / "filters.json"
HOST = "127.0.0.1"
PORT = 8080
LISTING_TTL_DAYS = 30

sessions: dict[str, int] = {}


def hash_password(password: str) -> str:
    return hashlib.sha1(password.encode("utf-8")).hexdigest()


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def load_filters() -> dict:
    return json.loads(FILTERS_PATH.read_text(encoding="utf-8"))


def listing_expiry_sql() -> str:
    return f"date(b.list_date, '+{LISTING_TTL_DAYS} days')"


ITEM_SELECT_SQL = """
  i.ItemVNum,
  i.name,
  i.category,
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
  i.Description
"""


def item_to_dict(row: sqlite3.Row) -> dict:
    return {
        "itemVNum": row["ItemVNum"],
        "name": row["name"],
        "category": row["category"],
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
          p.username AS seller,
          {ITEM_SELECT_SQL}
        FROM bazaar b
        JOIN item_instances ii ON b.item_instance_id = ii.id
        JOIN items i ON ii.ItemVNum = i.ItemVNum
        JOIN players p ON b.player_id = p.id
        WHERE julianday({expiry}) >= julianday('now')
        ORDER BY b.id
        """
    ).fetchall()

    return [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "iconId": row["ItemVNum"],
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
    return [
        {
            "name": row["name"],
            "description": row["description"],
        }
        for row in rows
    ]


def fetch_preferences(conn: sqlite3.Connection, player_id: int) -> dict:
    row = conn.execute(
        """
        SELECT skill_page, skill_slots_locked, skill_alt_hotkeys
        FROM players
        WHERE id = ?
        """,
        (player_id,),
    ).fetchone()
    if row is None:
        raise ValueError("Player not found")

    return {
        "skillPage": int(row["skill_page"]),
        "skillSlotsLocked": bool(row["skill_slots_locked"]),
        "skillAltHotkeys": bool(row["skill_alt_hotkeys"]),
    }


def update_preferences(player_id: int, payload: dict) -> dict:
    skill_page = int(payload.get("skillPage", 1))
    if skill_page not in (1, 2):
        raise ValueError("Invalid skill page")

    skill_slots_locked = 1 if payload.get("skillSlotsLocked") else 0
    skill_alt_hotkeys = 1 if payload.get("skillAltHotkeys") else 0

    with get_connection() as conn:
        updated = conn.execute(
            """
            UPDATE players
            SET skill_page = ?, skill_slots_locked = ?, skill_alt_hotkeys = ?
            WHERE id = ?
            """,
            (skill_page, skill_slots_locked, skill_alt_hotkeys, player_id),
        ).rowcount
        if updated == 0:
            raise ValueError("Player not found")
        conn.commit()
        return fetch_preferences(conn, player_id)


def get_player(conn: sqlite3.Connection, player_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT id, username, gold FROM players WHERE id = ?",
        (player_id,),
    ).fetchone()


def get_bootstrap(player_id: int) -> dict:
    filters = load_filters()
    with get_connection() as conn:
        player = get_player(conn, player_id)
        if player is None:
            raise ValueError("Player not found")

        listings = fetch_listings(conn)

    return {
        **filters,
        "player": {
            "id": player["id"],
            "username": player["username"],
            "gold": player["gold"],
        },
        "listings": listings,
    }


def login_player(username: str, password: str) -> dict:
    with get_connection() as conn:
        player = conn.execute(
            "SELECT id, username, gold FROM players WHERE username = ? AND password = ?",
            (username, hash_password(password)),
        ).fetchone()

    if player is None:
        raise ValueError("Invalid username or password")

    return {
        "id": player["id"],
        "username": player["username"],
        "gold": player["gold"],
    }


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
              b.player_id AS seller_id,
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

        buyer = get_player(conn, buyer_id)
        if buyer is None:
            raise ValueError("Player not found")

        if buyer["gold"] < total_price:
            raise ValueError("Not enough gold")

        seller = get_player(conn, listing["seller_id"])
        if seller is None:
            raise ValueError("Seller not found")

        buyer_gold = buyer["gold"] - total_price
        seller_gold = seller["gold"] + total_price

        conn.execute("UPDATE players SET gold = ? WHERE id = ?", (buyer_gold, buyer_id))
        conn.execute(
            "UPDATE players SET gold = ? WHERE id = ?",
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
            conn.execute("DELETE FROM item_instances WHERE id = ?", (listing["instance_id"],))

        conn.commit()

        return {
            "gold": buyer_gold,
            "name": listing["name"],
            "listingId": listing_id,
            "quantity": quantity,
            "remaining": remaining,
        }


class BazaarHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _redirect_home(self) -> None:
        player_id = self._session_player_id()
        self._redirect("/main" if player_id else "/login")

    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path in ("/", "/index.html"):
            return self._redirect_home()

        if path == "/login":
            if self._session_player_id() is not None:
                return self._redirect("/main")
            return self._serve_file(ROOT / "login.html")

        if path == "/main":
            if self._session_player_id() is None:
                return self._redirect("/login")
            return self._serve_file(ROOT / "main.html")

        if path in ("/bazaar", "/bazaar.html"):
            if self._session_player_id() is None:
                return self._redirect("/login")
            return self._redirect("/main")

        if path == "/api/me":
            player_id = self._session_player_id()
            if player_id is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            with get_connection() as conn:
                player = get_player(conn, player_id)
            if player is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            return self._json_response(
                {
                    "id": player["id"],
                    "username": player["username"],
                    "gold": player["gold"],
                }
            )

        if path == "/api/health":
            return self._json_response(
                {
                    "ok": True,
                    "server": "nosbazaar",
                    "db": DB_PATH.exists(),
                }
            )

        if path == "/api/bootstrap":
            player_id = self._session_player_id()
            if player_id is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            try:
                return self._json_response(get_bootstrap(player_id))
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except sqlite3.Error as exc:
                return self._json_response(
                    {"error": f"Database error: {exc}. Run: py db/init_db.py"},
                    status=HTTPStatus.INTERNAL_SERVER_ERROR,
                )

        if path == "/api/skills":
            player_id = self._session_player_id()
            if player_id is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            with get_connection() as conn:
                return self._json_response({"skills": fetch_skills(conn)})

        if path == "/api/preferences":
            player_id = self._session_player_id()
            if player_id is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            with get_connection() as conn:
                try:
                    return self._json_response(fetch_preferences(conn, player_id))
                except ValueError as exc:
                    return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

        if path == "/api/listings":
            player_id = self._session_player_id()
            if player_id is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            with get_connection() as conn:
                return self._json_response({"listings": fetch_listings(conn)})

        return super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/login":
            try:
                payload = self._read_json()
                user = login_player(payload.get("username", ""), payload.get("password", ""))
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.UNAUTHORIZED)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)

            token = secrets.token_urlsafe(32)
            sessions[token] = user["id"]
            return self._json_response(user, set_cookie=f"session={token}; Path=/; HttpOnly; SameSite=Lax")

        if path == "/api/logout":
            token = self._session_token()
            if token:
                sessions.pop(token, None)
            return self._json_response({"ok": True}, clear_cookie=True)

        if path.startswith("/api/buy/"):
            player_id = self._session_player_id()
            if player_id is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)

            listing_id = path.rsplit("/", 1)[-1]
            try:
                body = self._read_json()
                quantity = int(body.get("quantity", 1))
                payload = buy_listing(int(listing_id), player_id, quantity)
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            return self._json_response(payload)

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_PUT(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/preferences":
            player_id = self._session_player_id()
            if player_id is None:
                return self._json_response({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            try:
                payload = self._read_json()
                return self._json_response(update_preferences(player_id, payload))
            except ValueError as exc:
                return self._json_response({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError:
                return self._json_response({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)

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

    def _session_player_id(self) -> int | None:
        token = self._session_token()
        if not token:
            return None
        return sessions.get(token)

    def _serve_file(self, file_path: Path) -> None:
        if not file_path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content = file_path.read_bytes()
        content_type = "text/html; charset=utf-8" if file_path.suffix == ".html" else "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

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


def ensure_ready() -> None:
    if DB_PATH.exists() and FILTERS_PATH.exists():
        return
    print("First run: creating database from seed data...")
    from db.init_db import main as init_db_main

    init_db_main()


def main() -> None:
    ensure_ready()

    try:
        server = ThreadingHTTPServer((HOST, PORT), BazaarHandler)
    except OSError as exc:
        if getattr(exc, "winerror", None) == 10048 or exc.errno in (48, 98):
            raise SystemExit(
                f"Port {PORT} is already in use. Stop the other process "
                f"(often `py -m http.server`) then run: py server.py"
            ) from exc
        raise

    print(f"Serving NosBazaar at http://{HOST}:{PORT}/")
    print("Use this server (py server.py), not py -m http.server")
    server.serve_forever()


if __name__ == "__main__":
    main()
