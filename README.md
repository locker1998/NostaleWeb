# NostaleWeb

A NosTale-style bazaar browser demo: static HTML/CSS/JS UI with a small Python API server and SQLite database.

## Download (recommended)

1. Open [Releases](https://github.com/locker1998/NostaleWeb/releases).
2. Download **NostaleWeb-windows-x64.zip** from the latest release.
3. Extract the folder anywhere on your PC.
4. Run **NostaleWeb.exe** — your browser opens automatically to the home page at `http://127.0.0.1:8080/`.

On first launch the app creates a local database in the encrypted `data/` vault.

**Demo login:** register an account at `/register` (no default demo user is created).

Leave the console window open while you use the app. **Cancel** on the login page and **Quit Game** in settings log you out and return to the home page.

## Run from source

Requirements: **Python 3.10+** and `cryptography` (see `scripts/requirements.txt`).

```powershell
git clone git@github.com:locker1998/NostaleWeb.git
cd NostaleWeb
py -m pip install -r scripts\requirements.txt
py scripts\init_db.py
py scripts\server.py
```

Compiled game data (`data/data000`, `data001`, …) is committed to the repo. A fresh clone does not need `data/_plain/`.

Then open http://127.0.0.1:8080/

Health check: http://127.0.0.1:8080/api/health

### Routes

| Public (landing) | In-game (`/play`) |
|------------------|-------------------|
| `/` — home page | `/play` — redirects to login or the right lobby step |
| `/register` — create account | `/play/login` |
| `/admin` — admin panel (requires admin session) | `/play/select-channel`, `/play/select-character`, `/play/main` |
| `/admin/login` — administrator sign-in (works when channels are down) | |

`/play` sends you to `/play/login` when signed out, or to channel/character selection or the game when a session is already in progress.

`/admin` sends you to `/admin/login` when you are not signed in as an administrator. If you already signed in at `/play/login` or `/admin/login`, the same session cookie is reused — no second sign-in required when switching between play and admin pages.

### Channel config (`config/channels.json`)

```json
{
  "loginPort": 8080,
  "channels": {
    "1": 8081,
    "2": 8082,
    "3": 8083,
    "4": 8084,
    "5": 8085
  }
}
```

Object keys are channel indexes (`1` = CH1, `2` = CH2, …). Values are the TCP ports for each channel. Indexes are explicit so they stay stable regardless of JSON key order.

### Superadmin (`config/auth.json`)

```json
{
  "superadmin": {
    "username": "superadmin",
    "passwordEnc": "<encrypted-password>"
  }
}
```

The superadmin account is **not stored in the database**. It has full admin rights (including `/admin` and channel start/stop APIs).

Generate `passwordEnc` with:

```powershell
py scripts\encrypt_superadmin_password.py "your-password"
```

Paste the output into `config/auth.json`. Default dev credentials: `superadmin` / `superadmin`.

## Project layout

| Path | Purpose |
|------|---------|
| `NostaleWeb.exe` | Compiled server (build with `scripts/package.py`) |
| `scripts/` | Python sources (`server.py`, `compile_data.py`, `package.py`, …) |
| `scripts/routing/router.py` | Central URL routing |
| `web/pages/` | HTML pages (index, login, register, game) |
| `web/static/css/`, `web/static/js/` | Styles and frontend scripts |
| `config/channels.json` | Login port and channel index → port map |
| `config/auth.json` | Superadmin username and encrypted password |
| `scripts/init_db.py` | Database schema plus item import from itempicker.atlagaming.eu |
| `/assets/...` | Game assets served from encrypted vault |

## API overview

- `POST /api/login` — sign in to play
- `POST /api/admin-login` — sign in as administrator (superadmin or `IsAdmin` account)
- `POST /api/register` — create account (no email verification)
- `POST /api/shutdown-channels` — stop game channels (login port only). Body `{}` stops all; `{ "channel": 3 }` stops channel index 3 (CH3), not the port number
- `POST /api/start-channels` — start game channels (login port only). Body `{}` starts all stopped channels; `{ "channel": 3 }` starts channel index 3 only
- `GET /api/me`, `GET /api/bootstrap`, `GET /api/skills`
- `GET/PUT /api/preferences`
- `GET /api/inventory` — character inventory pockets and gold
- `POST /api/buy/{id}` — body `{ "quantity": N }`
- `DELETE /api/bazaar` — remove all bazaar listings
- `DELETE /api/item-instances` — remove all listings and item instances
- `DELETE /api/items` — remove all listings, item instances, and item definitions
- `GET /api/health`

## Build a release locally

```powershell
py -m pip install -r scripts\requirements-build.txt
py scripts/package.py
```

Output: `dist/NostaleWeb-windows-x64.zip`

The release zip copies the committed compiled `data/` vault as-is (without a bundled database).

## CI/CD

Pushing a version tag builds the Windows zip and publishes it to GitHub Releases:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

You can also run the **Release** workflow manually from the Actions tab.

## Data storage

| Path | Role |
|------|------|
| `data/data000` | Encrypted table of contents (tracked in git) |
| `data001`, `data002`, … | Encrypted payloads: assets, `items.json`, runtime `nosbazaar.db` (tracked except live DB) |
| `data/_plain/` | **Local dev only** — edit raw assets here, then compile (gitignored) |

**Developers** editing assets:

1. Put files under `data/_plain/` (e.g. `data/_plain/assets/`).
2. Compile into the encrypted vault:

```powershell
py scripts\compile_data.py
```

3. Commit the updated `data/data*` files. Restart the server — the game reads from the vault, not `_plain`.

**Everyone else** (clone, CI, release zip): use the compiled `data/` files directly. No `_plain` folder is created.

## Notes

- Use `py scripts\server.py`, not `python -m http.server` — the UI needs the API.
- If port 8080 is busy, stop the other process first.
- Item icons load from the [itempicker API](https://itempicker.atlagaming.eu/about-api#item-icon) (`/api/items/icon/{itemVnum}`); an internet connection is required for icons.
