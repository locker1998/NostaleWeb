# NostaleWeb

A NosTale-style bazaar browser demo: static HTML/CSS/JS UI with a small Python API server and SQLite database.

## Download (recommended)

1. Open [Releases](https://github.com/locker1998/NostaleWeb/releases).
2. Download **NostaleWeb-windows-x64.zip** from the latest release.
3. Extract the folder anywhere on your PC.
4. Run **NostaleWeb.exe**.
5. Open **http://127.0.0.1:8080/main** in your browser.

On first launch the app creates `data/nosbazaar.db` and `data/filters.json` from the bundled seed data.

**Demo login:** `demo` / `demo`

Leave the console window open while you use the app. Close it to stop the server.

## Run from source

Requirements: **Python 3.10+** (stdlib only for the server).

```powershell
git clone git@github.com:locker1998/NostaleWeb.git
cd NostaleWeb
py db/init_db.py
py server.py
```

Then open http://127.0.0.1:8080/main

Health check: http://127.0.0.1:8080/api/health

## Project layout

| Path | Purpose |
|------|---------|
| `server.py` | HTTP server and REST API |
| `login.html`, `main.html`, `bazaar.html` | Pages |
| `app.js`, `main.js`, `login.js` | Frontend logic |
| `bazaar.css` | Styles |
| `db/schema.sql`, `db/init_db.py` | Database schema and seed |
| `data/items.json` | Item and listing seed data |
| `assets/` | Local images |

## API overview

- `POST /api/login` — sign in
- `GET /api/me`, `GET /api/bootstrap`, `GET /api/skills`
- `GET/PUT /api/preferences`
- `POST /api/buy/{id}` — body `{ "quantity": N }`
- `GET /api/health`

## Build a release locally

```powershell
py -m pip install -r requirements-build.txt
py build/package.py
```

Output: `dist/NostaleWeb-windows-x64.zip`

## CI/CD

Pushing a version tag builds the Windows zip and publishes it to GitHub Releases:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

You can also run the **Release** workflow manually from the Actions tab.

## Notes

- Use `py server.py`, not `python -m http.server` — the UI needs the API.
- If port 8080 is busy, stop the other process first.
- Item icons load from [nosapki.com](https://nosapki.com/images/icons); an internet connection is required for icons.
