"""Central URL routing for NosBazaar."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from urllib.parse import unquote


class RouteKind(Enum):
    API = "api"
    VAULT_ASSET = "vault_asset"
    STATIC_FILE = "static_file"
    PAGE = "page"
    BAZAAR_REDIRECT = "bazaar_redirect"
    NOT_FOUND = "not_found"


class PageId(Enum):
    INDEX = "index"
    PLAY_HOME = "play_home"
    LOGIN = "login"
    REGISTER = "register"
    SELECT_CHANNEL = "select_channel"
    SELECT_CHARACTER = "select_character"
    MAIN = "main"
    ADMIN = "admin"
    ADMIN_LOGIN = "admin_login"
    ADMIN_ACCOUNTS = "admin_accounts"
    ADMIN_CHARACTERS = "admin_characters"
    CREATE_CHARACTER = "create_character"
    NOT_FOUND = "not_found"


PLAY_HOME = "/play"
PLAY_LOGIN = "/play/login"
PLAY_MAIN = "/play/main"
PLAY_SELECT_CHANNEL = "/play/select-channel"
PLAY_SELECT_CHARACTER = "/play/select-character"
PLAY_CREATE_CHARACTER = "/play/create-character"
ADMIN_HOME = "/admin"
ADMIN_LOGIN = "/admin/login"
ADMIN_ACCOUNTS = "/admin/accounts"
ADMIN_CHARACTERS = "/admin/characters"

PAGE_PATHS: dict[str, PageId] = {
    "/": PageId.INDEX,
    "/index.html": PageId.INDEX,
    PLAY_HOME: PageId.PLAY_HOME,
    PLAY_LOGIN: PageId.LOGIN,
    "/register": PageId.REGISTER,
    PLAY_SELECT_CHANNEL: PageId.SELECT_CHANNEL,
    PLAY_SELECT_CHARACTER: PageId.SELECT_CHARACTER,
    PLAY_CREATE_CHARACTER: PageId.CREATE_CHARACTER,
    PLAY_MAIN: PageId.MAIN,
    ADMIN_HOME: PageId.ADMIN,
    ADMIN_LOGIN: PageId.ADMIN_LOGIN,
    ADMIN_ACCOUNTS: PageId.ADMIN_ACCOUNTS,
    ADMIN_CHARACTERS: PageId.ADMIN_CHARACTERS,
}

PAGE_FILES: dict[PageId, str] = {
    PageId.INDEX: "index.html",
    PageId.LOGIN: "login.html",
    PageId.REGISTER: "register.html",
    PageId.SELECT_CHANNEL: "select-channel.html",
    PageId.SELECT_CHARACTER: "select-character.html",
    PageId.CREATE_CHARACTER: "create-character.html",
    PageId.MAIN: "main.html",
    PageId.ADMIN: "admin.html",
    PageId.ADMIN_LOGIN: "admin-login.html",
    PageId.ADMIN_ACCOUNTS: "admin-accounts.html",
    PageId.ADMIN_CHARACTERS: "admin-characters.html",
    PageId.NOT_FOUND: "404.html",
}

STATIC_CONTENT_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
}


@dataclass(frozen=True)
class ResolvedRoute:
    kind: RouteKind
    page_id: PageId | None = None
    file_path: Path | None = None
    vault_name: str | None = None


def web_root(app_root: Path) -> Path:
    return app_root / "web"


def pages_dir(app_root: Path) -> Path:
    return web_root(app_root) / "pages"


def page_file(app_root: Path, page_id: PageId) -> Path | None:
    filename = PAGE_FILES.get(page_id)
    if filename is None:
        return None
    return pages_dir(app_root) / filename


def normalize_path(path: str) -> str:
    if path != "/" and path.endswith("/"):
        return path.rstrip("/")
    return path


def resolve_get_route(path: str, app_root: Path) -> ResolvedRoute:
    path = normalize_path(path)
    if path.startswith("/api/"):
        return ResolvedRoute(RouteKind.API)

    if path in ("/bazaar", "/bazaar.html"):
        return ResolvedRoute(RouteKind.BAZAAR_REDIRECT)

    if path.startswith("/assets/"):
        return ResolvedRoute(
            RouteKind.VAULT_ASSET,
            vault_name=unquote(path.lstrip("/")),
        )

    if path.startswith("/static/"):
        static_path = web_root(app_root) / path.lstrip("/")
        if static_path.is_file():
            return ResolvedRoute(RouteKind.STATIC_FILE, file_path=static_path)
        not_found = page_file(app_root, PageId.NOT_FOUND)
        return ResolvedRoute(
            RouteKind.NOT_FOUND,
            page_id=PageId.NOT_FOUND,
            file_path=not_found,
        )

    page_id = PAGE_PATHS.get(path)
    if page_id is not None:
        return ResolvedRoute(
            RouteKind.PAGE,
            page_id=page_id,
            file_path=page_file(app_root, page_id),
        )

    not_found = page_file(app_root, PageId.NOT_FOUND)
    return ResolvedRoute(
        RouteKind.NOT_FOUND,
        page_id=PageId.NOT_FOUND,
        file_path=not_found,
    )


def static_content_type(file_path: Path) -> str:
    return STATIC_CONTENT_TYPES.get(
        file_path.suffix.lower(),
        "application/octet-stream",
    )
